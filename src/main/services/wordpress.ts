import axios from 'axios';
import fs from 'fs';
import path from 'path';
import https from 'https';

export interface WordPressSiteConfig {
  url: string;
  username: string;
  password?: string; // Decrypted
}

export interface PostPayload {
  title: string;
  content: string;
  status: 'draft' | 'pending' | 'publish' | 'future' | 'private';
  categoryName?: string;
  tags?: string[];
  featuredImageId?: number;
  slug?: string;
  excerpt?: string;
  seoSettings?: {
    focusKeyword?: string;
    metaTitle?: string;
    metaDescription?: string;
    tags?: string;
    plugin?: 'yoast' | 'rankmath' | 'aioseo' | 'none';
  };
  scheduleDate?: string; // ISO date string for future posts
}

// Clean WordPress base URL to ensure proper endpoint routing
function cleanUrl(url: string): string {
  let cleaned = url.trim();
  if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    cleaned = 'https://' + cleaned;
  }
  if (cleaned.endsWith('/')) {
    cleaned = cleaned.slice(0, -1);
  }
  return cleaned;
}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// HTTPS agent that ignores SSL certificate errors (crucial for local/self-signed setups)
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

function getHeaders(authHeader: string, extraHeaders: Record<string, string> = {}): Record<string, string> {
  return {
    'Authorization': authHeader,
    'User-Agent': USER_AGENT,
    ...extraHeaders
  };
}

// Generate basic or Bearer authentication header
function getAuthHeader(config: WordPressSiteConfig): string {
  if (config.password && (config.password.startsWith('Bearer ') || config.password.length > 50)) {
    return config.password.startsWith('Bearer ') ? config.password : `Bearer ${config.password}`;
  }
  const token = Buffer.from(`${config.username}:${config.password}`).toString('base64');
  return `Basic ${token}`;
}

/**
 * Executes an Axios request manually following 3xx redirects to preserve Authorization header, method and body,
 * and bypassing self-signed/invalid SSL certificates.
 */
async function requestWithRedirects(axiosConfig: any, maxRedirects = 5): Promise<any> {
  const currentConfig = {
    ...axiosConfig,
    maxRedirects: 0,
    httpsAgent,
    validateStatus: (status: number) => (status >= 200 && status < 300) || (status >= 300 && status < 400)
  };

  let redirectCount = 0;
  while (redirectCount <= maxRedirects) {
    const response = await axios(currentConfig);
    if (response.status >= 300 && response.status < 400) {
      const redirectUrl = response.headers.location;
      if (!redirectUrl) {
        return response;
      }

      // Resolve redirect URL relative to the original URL
      const nextUrl = new URL(redirectUrl, currentConfig.url).toString();
      console.log(`[WordPress] Redirecting to: ${nextUrl} (Status ${response.status})`);

      currentConfig.url = nextUrl;
      currentConfig.headers = { ...currentConfig.headers };

      redirectCount++;
    } else {
      return response;
    }
  }
  throw new Error('Too many redirects');
}

/**
 * Tries to query WordPress REST API by probing standard and fallback query-parameter endpoints:
 * 1. Pretty Permalinks: baseUrl/wp-json/wp/v2/...
 * 2. Pretty Permalinks Index Fallback: baseUrl/index.php/wp-json/wp/v2/...
 * 3. Plain Permalinks Fallback: baseUrl/?rest_route=/wp/v2/...
 * 4. Plain Permalinks Index Fallback: baseUrl/index.php?rest_route=/wp/v2/...
 */
async function makeWordPressRequest(
  config: WordPressSiteConfig,
  path: string,
  axiosConfigExtra: any = {}
): Promise<any> {
  const baseUrl = cleanUrl(config.url);
  const authHeader = getAuthHeader(config);
  const headers = getHeaders(authHeader, axiosConfigExtra.headers || {});

  // Determine if it is a WordPress.com URL
  let host = '';
  try {
    host = new URL(baseUrl).hostname;
  } catch (urlErr) {
    host = baseUrl.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
  }
  const isWordPressCom = host.endsWith('.wordpress.com') || baseUrl.includes('wordpress.com');

  const endpoints: { type: string; url: string }[] = [];

  if (isWordPressCom) {
    const cleanPath = path.startsWith('/wp/v2') ? path.substring(6) : path;
    endpoints.push({
      type: 'wp_com_public',
      url: `https://public-api.wordpress.com/wp/v2/sites/${host}${cleanPath}`
    });
  }

  // Standard and index/param fallbacks
  endpoints.push(
    { type: 'standard', url: `${baseUrl}/wp-json${path}` },
    { type: 'index_json', url: `${baseUrl}/index.php/wp-json${path}` },
    { type: 'param', url: baseUrl.includes('?') ? `${baseUrl}&rest_route=${path}` : `${baseUrl}/?rest_route=${path}` },
    { type: 'index_param', url: baseUrl.includes('?') ? `${baseUrl}&rest_route=${path}` : `${baseUrl}/index.php?rest_route=${path}` }
  );

  let lastError: any = null;

  for (const endpoint of endpoints) {
    try {
      console.log(`[WordPress] Requesting [${endpoint.type}]: ${endpoint.url}`);
      
      // If we have custom params in query, merge/format them correctly
      let finalUrl = endpoint.url;
      if (endpoint.type === 'param' || endpoint.type === 'index_param') {
        // For query param endpoints, if the caller passed standard Axios params, we append them to the rest_route
        if (axiosConfigExtra.params) {
          const searchParams = new URLSearchParams(axiosConfigExtra.params);
          finalUrl = `${finalUrl}&${searchParams.toString()}`;
        }
      }

      const response = await requestWithRedirects({
        timeout: 30000,
        ...axiosConfigExtra,
        url: finalUrl,
        headers,
        params: (endpoint.type === 'standard' || endpoint.type === 'index_json' || endpoint.type === 'wp_com_public') ? axiosConfigExtra.params : undefined
      });

      return response;
    } catch (error: any) {
      console.warn(`[WordPress] Request failed for endpoint [${endpoint.url}]:`, error.message);
      lastError = error;
      
      // If it's a timeout error (e.g. server too slow or upload taking time),
      // do not waste time trying other endpoints which will also time out.
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        throw error;
      }
    }
  }

  throw lastError || new Error(`Failed to access WordPress REST API for path ${path}`);
}

/**
 * Validates connection to WordPress site by fetching current user details or categories fallback.
 */
export async function testWordPressConnection(config: WordPressSiteConfig): Promise<boolean> {
  try {
    // 1. Try checking /wp/v2/users/me first
    try {
      const response = await makeWordPressRequest(config, '/wp/v2/users/me', { method: 'get' });
      if (response.data && response.data.id) {
        return true;
      }
    } catch (userErr: any) {
      console.warn('[WordPress] users/me check failed, trying categories check fallback...');
    }

    // 2. Fallback check: retrieve categories with limit 1
    const fallbackResponse = await makeWordPressRequest(config, '/wp/v2/categories', {
      method: 'get',
      params: { per_page: 1 }
    });

    return Array.isArray(fallbackResponse.data);
  } catch (error: any) {
    console.error(`[WordPress] Connection check failed for ${config.url}:`, error.message);
    throw new Error(error.response?.data?.message || error.message || 'Failed to connect to WordPress REST API');
  }
}

/**
 * Finds a category by slug or name, preventing automatic creation of new categories.
 */
export async function findOrCreateCategory(
  config: WordPressSiteConfig,
  categoryName: string
): Promise<number | null> {
  if (!categoryName) return null;
  const name = categoryName.trim();
  const cleanSlug = name.toLowerCase().replace(/\s+/g, '-');

  try {
    // 1. Search in-memory by fetching categories (very reliable for first 100)
    try {
      const existingCats = await getWordPressCategories(config);
      if (Array.isArray(existingCats)) {
        const match = existingCats.find(
          cat => cat.name.toLowerCase() === name.toLowerCase() || 
                 cat.slug.toLowerCase() === cleanSlug.toLowerCase()
        );
        if (match) {
          console.log(`[WordPress] Category '${categoryName}' matched in-memory to ID ${match.id}`);
          return match.id;
        }
      }
    } catch (fetchErr: any) {
      console.warn(`[WordPress] Failed to fetch category list for in-memory match:`, fetchErr.message);
    }

    // 2. Search fallback via API querying by slug (without pre-encoding so axios does it)
    const searchResponse = await makeWordPressRequest(config, '/wp/v2/categories', {
      method: 'get',
      params: { slug: cleanSlug }
    });

    if (searchResponse.data && searchResponse.data.length > 0) {
      return searchResponse.data[0].id;
    }

    // 3. Search fallback via API querying by search term
    const searchByNameResponse = await makeWordPressRequest(config, '/wp/v2/categories', {
      method: 'get',
      params: { search: name }
    });

    if (searchByNameResponse.data && searchByNameResponse.data.length > 0) {
      const exactMatch = searchByNameResponse.data.find(
        (cat: any) => cat.name.toLowerCase() === name.toLowerCase()
      );
      if (exactMatch) return exactMatch.id;
    }

    console.warn(`[WordPress] Category '${categoryName}' not found. Returning null (will not create new category per user preference).`);
    return null;
  } catch (err: any) {
    console.warn(`[WordPress] Error mapping category '${categoryName}':`, err.message);
    return null;
  }
}

/**
 * Finds or creates tags. Returns list of tag IDs.
 */
export async function findOrCreateTags(
  config: WordPressSiteConfig,
  tags: string[]
): Promise<number[]> {
  if (!tags || tags.length === 0) return [];
  const tagIds: number[] = [];

  for (const tag of tags) {
    const name = tag.trim();
    if (!name) continue;
    const slug = encodeURIComponent(name.toLowerCase().replace(/\s+/g, '-'));

    try {
      // 1. Search for existing tag
      const searchResponse = await makeWordPressRequest(config, '/wp/v2/tags', {
        method: 'get',
        params: { slug }
      });

      if (searchResponse.data && searchResponse.data.length > 0) {
        tagIds.push(searchResponse.data[0].id);
        continue;
      }

      // 2. Create tag
      const createResponse = await makeWordPressRequest(config, '/wp/v2/tags', {
        method: 'post',
        data: { name, slug }
      });

      if (createResponse.data?.id) {
        tagIds.push(createResponse.data.id);
      }
    } catch (err: any) {
      console.warn(`[WordPress] Error mapping tag '${tag}':`, err.message);
    }
  }

  return tagIds;
}

/**
 * Uploads a local image file to the WordPress media library.
 */
export async function uploadWordPressMedia(
  config: WordPressSiteConfig,
  localImagePath: string,
  altText: string
): Promise<{ id: number; url: string }> {
  if (!fs.existsSync(localImagePath)) {
    throw new Error(`Media file not found at path: ${localImagePath}`);
  }

  const filename = path.basename(localImagePath);
  const fileBuffer = fs.readFileSync(localImagePath);

  try {
    const response = await makeWordPressRequest(config, '/wp/v2/media', {
      method: 'post',
      data: fileBuffer,
      headers: {
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type': 'image/png'
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 120000
    });

    const mediaId = response.data?.id;
    const mediaUrl = response.data?.source_url;

    if (!mediaId) {
      throw new Error('Upload succeeded but no media ID was returned');
    }

    // Set Alt text and description
    try {
      await makeWordPressRequest(config, `/wp/v2/media/${mediaId}`, {
        method: 'post',
        data: {
          alt_text: altText,
          description: altText
        }
      });
    } catch (metaErr: any) {
      console.warn('[WordPress] Failed to set image alt text:', metaErr.message);
    }

    return { id: mediaId, url: mediaUrl };
  } catch (error: any) {
    console.error('[WordPress] Media upload failed:', error.message);
    throw new Error(error.response?.data?.message || error.message || 'Failed to upload media to WordPress');
  }
}

/**
 * Publishes an article (post) to WordPress.
 */
export async function createWordPressPost(
  config: WordPressSiteConfig,
  payload: PostPayload
): Promise<{ id: number; url: string }> {
  // 1. Resolve Category ID
  let categoryIds: number[] = [];
  if (payload.categoryName) {
    const catNames = payload.categoryName.split(',').map(c => c.trim()).filter(Boolean);
    for (const catName of catNames) {
      const catId = await findOrCreateCategory(config, catName);
      if (catId) categoryIds.push(catId);
    }
  }

  // 2. Resolve Tag IDs
  let tagIds: number[] = [];
  if (payload.tags && payload.tags.length > 0) {
    tagIds = await findOrCreateTags(config, payload.tags);
  }

  // 3. Setup core body
  const body: Record<string, any> = {
    title: payload.title,
    content: payload.content,
    status: payload.status,
    slug: payload.slug,
    excerpt: payload.excerpt,
    categories: categoryIds,
    tags: tagIds
  };

  if (payload.featuredImageId) {
    body.featured_media = payload.featuredImageId;
  }

  // Handle future publish date (scheduling)
  if (payload.status === 'future' && payload.scheduleDate) {
    body.date = payload.scheduleDate;
  }

  // 4. Map SEO Plugin Metadata
  const seo = payload.seoSettings;
  if (seo && seo.plugin !== 'none') {
    const meta: Record<string, string> = {};
    
    if (seo.plugin === 'yoast') {
      if (seo.metaTitle) meta._yoast_wpseo_title = seo.metaTitle;
      if (seo.metaDescription) meta._yoast_wpseo_metadesc = seo.metaDescription;
      if (seo.focusKeyword) meta._yoast_wpseo_focuskw = seo.focusKeyword;
    } else if (seo.plugin === 'rankmath') {
      if (seo.metaTitle) meta.rank_math_title = seo.metaTitle;
      if (seo.metaDescription) meta.rank_math_description = seo.metaDescription;
      if (seo.focusKeyword) meta.rank_math_focus_keyword = seo.focusKeyword;
    } else if (seo.plugin === 'aioseo') {
      if (seo.metaTitle) meta._aioseo_title = seo.metaTitle;
      if (seo.metaDescription) meta._aioseo_description = seo.metaDescription;
      if (seo.focusKeyword) meta._aioseo_keywords = seo.focusKeyword;
    }

    body.meta = meta;
  }

  try {
    const response = await makeWordPressRequest(config, '/wp/v2/posts', {
      method: 'post',
      data: body,
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    return {
      id: response.data?.id,
      url: response.data?.link
    };
  } catch (error: any) {
    console.error('[WordPress] Post creation failed:', error.message);
    throw new Error(error.response?.data?.message || error.message || 'Failed to publish post to WordPress');
  }
}

/**
 * Fetches all categories from WordPress site.
 */
export async function getWordPressCategories(
  config: WordPressSiteConfig
): Promise<{ id: number; name: string; slug: string }[]> {
  try {
    const response = await makeWordPressRequest(config, '/wp/v2/categories', {
      method: 'get',
      params: { per_page: 100 }
    });
    
    if (Array.isArray(response.data)) {
      return response.data.map((cat: any) => ({
        id: cat.id,
        name: cat.name,
        slug: cat.slug
      }));
    }
    return [];
  } catch (error: any) {
    console.error(`[WordPress] Fetching categories failed for ${config.url}:`, error.message);
    throw new Error(error.response?.data?.message || error.message || 'Failed to fetch categories from WordPress REST API');
  }
}
