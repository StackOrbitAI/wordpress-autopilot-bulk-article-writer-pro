import axios from 'axios';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';

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

// Generate basic authentication header
function getAuthHeader(config: WordPressSiteConfig): string {
  const token = Buffer.from(`${config.username}:${config.password}`).toString('base64');
  return `Basic ${token}`;
}

/**
 * Validates connection to WordPress site by fetching current user details.
 */
export async function testWordPressConnection(config: WordPressSiteConfig): Promise<boolean> {
  const baseUrl = cleanUrl(config.url);
  const authHeader = getAuthHeader(config);
  
  try {
    const response = await axios.get(`${baseUrl}/wp-json/wp/v2/users/me`, {
      headers: { 'Authorization': authHeader },
      timeout: 15000
    });
    
    // If successfully returned details, authentication is valid
    return !!response.data?.id;
  } catch (error: any) {
    console.error(`[WordPress] Connection check failed for ${config.url}:`, error.message);
    throw new Error(error.response?.data?.message || 'Failed to connect to WordPress REST API');
  }
}

/**
 * Finds a category by slug or creates it if missing.
 */
export async function findOrCreateCategory(
  baseUrl: string,
  authHeader: string,
  categoryName: string
): Promise<number | null> {
  if (!categoryName) return null;
  const name = categoryName.trim();
  const slug = encodeURIComponent(name.toLowerCase().replace(/\s+/g, '-'));

  try {
    // 1. Search for existing category
    const searchResponse = await axios.get(`${baseUrl}/wp-json/wp/v2/categories`, {
      params: { slug },
      headers: { 'Authorization': authHeader }
    });

    if (searchResponse.data && searchResponse.data.length > 0) {
      return searchResponse.data[0].id;
    }

    // 2. Create category if not found
    const createResponse = await axios.post(`${baseUrl}/wp-json/wp/v2/categories`, {
      name,
      slug
    }, {
      headers: { 'Authorization': authHeader }
    });

    return createResponse.data?.id || null;
  } catch (err: any) {
    console.warn(`[WordPress] Error mapping category '${categoryName}':`, err.message);
    return null;
  }
}

/**
 * Finds or creates tags. Returns list of tag IDs.
 */
export async function findOrCreateTags(
  baseUrl: string,
  authHeader: string,
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
      const searchResponse = await axios.get(`${baseUrl}/wp-json/wp/v2/tags`, {
        params: { slug },
        headers: { 'Authorization': authHeader }
      });

      if (searchResponse.data && searchResponse.data.length > 0) {
        tagIds.push(searchResponse.data[0].id);
        continue;
      }

      // 2. Create tag
      const createResponse = await axios.post(`${baseUrl}/wp-json/wp/v2/tags`, {
        name,
        slug
      }, {
        headers: { 'Authorization': authHeader }
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
  const baseUrl = cleanUrl(config.url);
  const authHeader = getAuthHeader(config);

  if (!fs.existsSync(localImagePath)) {
    throw new Error(`Media file not found at path: ${localImagePath}`);
  }

  const filename = path.basename(localImagePath);
  const fileBuffer = fs.readFileSync(localImagePath);

  try {
    const response = await axios.post(`${baseUrl}/wp-json/wp/v2/media`, fileBuffer, {
      headers: {
        'Authorization': authHeader,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type': 'image/png'
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 60000
    });

    const mediaId = response.data?.id;
    const mediaUrl = response.data?.source_url;

    if (!mediaId) {
      throw new Error('Upload succeeded but no media ID was returned');
    }

    // Set Alt text and description
    try {
      await axios.post(`${baseUrl}/wp-json/wp/v2/media/${mediaId}`, {
        alt_text: altText,
        description: altText
      }, {
        headers: { 'Authorization': authHeader }
      });
    } catch (metaErr: any) {
      console.warn('[WordPress] Failed to set image alt text:', metaErr.message);
    }

    return { id: mediaId, url: mediaUrl };
  } catch (error: any) {
    console.error('[WordPress] Media upload failed:', error.message);
    throw new Error(error.response?.data?.message || 'Failed to upload media to WordPress');
  }
}

/**
 * Publishes an article (post) to WordPress.
 */
export async function createWordPressPost(
  config: WordPressSiteConfig,
  payload: PostPayload
): Promise<{ id: number; url: string }> {
  const baseUrl = cleanUrl(config.url);
  const authHeader = getAuthHeader(config);

  // 1. Resolve Category ID
  let categoryIds: number[] = [];
  if (payload.categoryName) {
    const catId = await findOrCreateCategory(baseUrl, authHeader, payload.categoryName);
    if (catId) categoryIds.push(catId);
  }

  // 2. Resolve Tag IDs
  let tagIds: number[] = [];
  if (payload.tags && payload.tags.length > 0) {
    tagIds = await findOrCreateTags(baseUrl, authHeader, payload.tags);
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
    const response = await axios.post(`${baseUrl}/wp-json/wp/v2/posts`, body, {
      headers: {
        'Authorization': authHeader,
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
    throw new Error(error.response?.data?.message || 'Failed to publish post to WordPress');
  }
}

/**
 * Fetches all categories from WordPress site.
 */
export async function getWordPressCategories(
  config: WordPressSiteConfig
): Promise<{ id: number; name: string; slug: string }[]> {
  const baseUrl = cleanUrl(config.url);
  const authHeader = getAuthHeader(config);

  try {
    const response = await axios.get(`${baseUrl}/wp-json/wp/v2/categories`, {
      params: { per_page: 100 },
      headers: { 'Authorization': authHeader },
      timeout: 15000
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
    throw new Error(error.response?.data?.message || 'Failed to fetch categories from WordPress REST API');
  }
}
