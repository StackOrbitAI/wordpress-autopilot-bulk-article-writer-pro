import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { dbGet } from '../database/connection';

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'in', 'on', 'at', 'for', 'to', 'with', 'is', 'of',
  'how', 'best', 'why', 'what', 'where', 'who', 'top', 'ways', 'methods', 'tips', 'guide',
  'tutorial', 'list', 'about', 'from', 'by', 'that', 'this', 'these', 'those', 'are', 'was', 'were',
  'be', 'been', 'has', 'have', 'had', 'do', 'does', 'did', 'but', 'not', 'some', 'any', 'each',
  'few', 'more', 'most', 'other', 'such', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'can',
  'will', 'just', 'should', 'would', 'now'
]);

function getKeywordWords(keyword: string): string[] {
  return keyword
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOP_WORDS.has(word));
}

function calculateRelevance(text: string, keywordWords: string[]): number {
  if (!text) return 0;
  let score = 0;
  const lowercaseText = text.toLowerCase();
  keywordWords.forEach(word => {
    if (lowercaseText.includes(word)) {
      score += 1;
      // Extra weight for exact word match
      const regex = new RegExp(`\\b${word}\\b`, 'i');
      if (regex.test(lowercaseText)) {
        score += 2;
      }
    }
  });
  return score;
}

/**
 * Fetches search results from a specific stock photo provider, ranks them,
 * and returns the best image URL.
 */
async function fetchFromProvider(keyword: string, provider: number): Promise<string> {
  const keywordWords = getKeywordWords(keyword);
  // If the query is empty after filtering stop words, use the original keyword
  const searchQueries = keywordWords.length > 0 ? [keywordWords.join(' '), keyword] : [keyword];

  if (provider === 3) {
    // Unsplash API (Primary / Main)
    const apiKeySetting = await dbGet(`SELECT value FROM settings WHERE key = 'unsplash_api_key'`);
    const apiKey = apiKeySetting?.value || '';
    if (!apiKey) {
      throw new Error('Unsplash Access Key is not configured');
    }

    // Try with filtered query first, fallback to original keyword if no results
    for (const query of searchQueries) {
      try {
        const response = await axios.get(
          `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=10`,
          {
            headers: { Authorization: `Client-ID ${apiKey}` },
            timeout: 20000
          }
        );

        const results = response.data?.results || [];
        if (results.length > 0) {
          // Rank by relevance
          let bestPhoto = results[0];
          let maxScore = -1;
          for (const photo of results) {
            const photoText = [
              photo.description || '',
              photo.alt_description || '',
              ...(photo.tags || []).map((t: any) => t.title || '')
            ].join(' ');
            const score = calculateRelevance(photoText, keywordWords);
            if (score > maxScore) {
              maxScore = score;
              bestPhoto = photo;
            }
          }
          const finalUrl = bestPhoto.urls?.regular || bestPhoto.urls?.full;
          if (finalUrl) return finalUrl;
        }
      } catch (err: any) {
        console.warn(`[Unsplash Search] Query "${query}" failed:`, err.message);
        // If it's a authorization or rate limit error, propagate it immediately to trigger fallback
        if (err.response?.status === 401 || err.response?.status === 403) {
          throw new Error(`Unsplash API authorization or rate limit error: ${err.message}`);
        }
      }
    }
    throw new Error(`No images found on Unsplash for keyword: "${keyword}"`);
  } 
  
  if (provider === 2) {
    // Pexels API
    const apiKeySetting = await dbGet(`SELECT value FROM settings WHERE key = 'pexels_api_key'`);
    const apiKey = apiKeySetting?.value || '';
    if (!apiKey) {
      throw new Error('Pexels API Key is not configured');
    }

    for (const query of searchQueries) {
      try {
        const response = await axios.get(
          `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=10`,
          {
            headers: { Authorization: apiKey },
            timeout: 20000
          }
        );

        const photos = response.data?.photos || [];
        if (photos.length > 0) {
          let bestPhoto = photos[0];
          let maxScore = -1;
          for (const photo of photos) {
            const photoText = [
              photo.alt || '',
              photo.url || ''
            ].join(' ');
            const score = calculateRelevance(photoText, keywordWords);
            if (score > maxScore) {
              maxScore = score;
              bestPhoto = photo;
            }
          }
          const finalUrl = bestPhoto.src?.large2x || bestPhoto.src?.large || bestPhoto.src?.original;
          if (finalUrl) return finalUrl;
        }
      } catch (err: any) {
        console.warn(`[Pexels Search] Query "${query}" failed:`, err.message);
        if (err.response?.status === 401 || err.response?.status === 403) {
          throw new Error(`Pexels API authorization or rate limit error: ${err.message}`);
        }
      }
    }
    throw new Error(`No images found on Pexels for keyword: "${keyword}"`);
  } 
  
  if (provider === 4) {
    // Pixabay API
    const apiKeySetting = await dbGet(`SELECT value FROM settings WHERE key = 'pixabay_api_key'`);
    const apiKey = apiKeySetting?.value || '';
    if (!apiKey) {
      throw new Error('Pixabay API Key is not configured');
    }

    for (const query of searchQueries) {
      try {
        const response = await axios.get(
          `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(query)}&per_page=10&image_type=photo`,
          { timeout: 20000 }
        );

        const hits = response.data?.hits || [];
        if (hits.length > 0) {
          let bestPhoto = hits[0];
          let maxScore = -1;
          for (const hit of hits) {
            const photoText = hit.tags || '';
            const score = calculateRelevance(photoText, keywordWords);
            if (score > maxScore) {
              maxScore = score;
              bestPhoto = hit;
            }
          }
          const finalUrl = bestPhoto.largeImageURL || bestPhoto.webformatURL;
          if (finalUrl) return finalUrl;
        }
      } catch (err: any) {
        console.warn(`[Pixabay Search] Query "${query}" failed:`, err.message);
        if (err.response?.status === 401 || err.response?.status === 403) {
          throw new Error(`Pixabay API authorization or rate limit error: ${err.message}`);
        }
      }
    }
    throw new Error(`No images found on Pixabay for keyword: "${keyword}"`);
  }

  throw new Error(`Unknown stock image provider ID: ${provider}`);
}

/**
 * Searches and downloads an image from Pexels, Unsplash, or Pixabay based on keyword.
 * Implements a smart fallback chain starting with the chosen provider.
 * Returns the local file path.
 */
export async function getStockImage(keyword: string, provider: number): Promise<string> {
  // provider: 2 = Pexels, 3 = Unsplash, 4 = Pixabay
  // Unsplash (3) is prioritized by default.
  let chain: number[] = [];
  if (provider === 3) {
    chain = [3, 2, 4]; // Unsplash -> Pexels -> Pixabay
  } else if (provider === 2) {
    chain = [2, 3, 4]; // Pexels -> Unsplash -> Pixabay
  } else if (provider === 4) {
    chain = [4, 3, 2]; // Pixabay -> Unsplash -> Pexels
  } else {
    chain = [3, 2, 4]; // Default fallback order: Unsplash -> Pexels -> Pixabay
  }

  const errors: string[] = [];
  let acquiredUrl = '';
  
  for (const prov of chain) {
    try {
      console.log(`[StockImage] Trying stock provider ${prov} for keyword: "${keyword}"`);
      acquiredUrl = await fetchFromProvider(keyword, prov);
      if (acquiredUrl) {
        console.log(`[StockImage] Successfully acquired image from provider ${prov}: ${acquiredUrl}`);
        break;
      }
    } catch (err: any) {
      console.warn(`[StockImage] Provider ${prov} failed: ${err.message}`);
      errors.push(`Provider ${prov}: ${err.message}`);
    }
  }

  if (!acquiredUrl) {
    throw new Error(`All stock image providers failed to retrieve an image. Details: [${errors.join('; ')}]`);
  }
  
  // Download the acquired image url to a local temp file
  return await downloadImage(acquiredUrl);
}

async function downloadImage(imageUrl: string): Promise<string> {
  let userDataPath: string;
  try {
    userDataPath = app.getPath('userData');
  } catch (error) {
    userDataPath = path.resolve(__dirname, '../../');
  }

  const downloadsDir = path.join(userDataPath, 'temp_images');
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
  }

  const filename = `stock_img_${Date.now()}.png`;
  const localPath = path.join(downloadsDir, filename);

  const response = await axios({
    method: 'get',
    url: imageUrl,
    responseType: 'stream',
    timeout: 30000
  });

  const writer = fs.createWriteStream(localPath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', () => resolve(localPath));
    writer.on('error', (err) => reject(err));
  });
}
