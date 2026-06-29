import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { dbGet } from '../database/connection';
import { generateArticle } from './ai';

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
 * Scores candidates using the configured LLM for high-accuracy semantic matching
 */
async function scoreCandidatesWithAI(
  keyword: string,
  candidates: { alt: string; description: string; tags: string }[],
  aiConfig: { provider: string; apiKey: string }
): Promise<number | null> {
  try {
    // Select a low-cost, fast model based on the provider
    let model = 'gpt-4o-mini';
    if (aiConfig.provider === 'gemini') {
      model = 'gemini-2.5-flash';
    } else if (aiConfig.provider === 'claude') {
      model = 'claude-3-5-haiku-latest';
    } else if (aiConfig.provider === 'openrouter') {
      model = 'google/gemini-2.5-flash';
    }

    const prompt = `You are an editorial director selecting a featured image for a blog post titled "${keyword}".
Below is a list of candidate stock photo descriptions, alt text, and tags. Evaluate which photo has the highest semantic relevance, visual suitability, and thematic match for the article title.

Candidates:
${candidates.map((c, i) => `[Image ${i}]: Alt: ${c.alt || 'N/A'}. Tags: ${c.tags || 'N/A'}. Description: ${c.description || 'N/A'}`).join('\n')}

Identify the single best candidate. You must return ONLY the integer index (e.g. 0, 1, 2) of the chosen image. Do NOT write any other text, explanation, or markdown. Only output a single integer.`;

    const result = await generateArticle(
      aiConfig,
      model,
      prompt,
      "You are a precise selector that returns only a single integer index representing the chosen option."
    );

    const cleanResult = result.text.trim().replace(/[^\d]/g, '');
    const index = parseInt(cleanResult, 10);
    if (!isNaN(index) && index >= 0 && index < candidates.length) {
      console.log(`[StockImage AI Selector] AI chose image index ${index} for "${keyword}"`);
      return index;
    }
  } catch (err: any) {
    console.warn(`[StockImage AI Selector] AI matching failed: ${err.message}. Falling back to local ranking.`);
  }
  return null;
}

/**
 * Fetches search results from a specific stock photo provider, ranks them,
 * and returns the best image URL.
 */
async function fetchFromProvider(
  keyword: string,
  provider: number,
  aiConfig?: { provider: string; apiKey: string }
): Promise<string> {
  const keywordWords = getKeywordWords(keyword);
  const searchQueries = keywordWords.length > 0 ? [keywordWords.join(' '), keyword] : [keyword];

  if (provider === 3) {
    // Unsplash API (Primary / Main)
    const apiKeySetting = await dbGet(`SELECT value FROM settings WHERE key = 'unsplash_api_key'`);
    const apiKey = apiKeySetting?.value || '';
    if (!apiKey) {
      throw new Error('Unsplash Access Key is not configured');
    }

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
          // If AI config is provided, try semantic matching first
          if (aiConfig) {
            const candidates = results.map((photo: any) => ({
              alt: photo.alt_description || '',
              description: photo.description || '',
              tags: (photo.tags || []).map((t: any) => t.title || '').join(', ')
            }));
            const bestIndex = await scoreCandidatesWithAI(keyword, candidates, aiConfig);
            if (bestIndex !== null) {
              const finalUrl = results[bestIndex].urls?.regular || results[bestIndex].urls?.full;
              if (finalUrl) return finalUrl;
            }
          }

          // Local fallback ranking
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
          // If AI config is provided, try semantic matching first
          if (aiConfig) {
            const candidates = photos.map((photo: any) => ({
              alt: photo.alt || '',
              description: photo.url || '',
              tags: ''
            }));
            const bestIndex = await scoreCandidatesWithAI(keyword, candidates, aiConfig);
            if (bestIndex !== null) {
              const finalUrl = photos[bestIndex].src?.large2x || photos[bestIndex].src?.large || photos[bestIndex].src?.original;
              if (finalUrl) return finalUrl;
            }
          }

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
          // If AI config is provided, try semantic matching first
          if (aiConfig) {
            const candidates = hits.map((hit: any) => ({
              alt: hit.tags || '',
              description: hit.tags || '',
              tags: hit.tags || ''
            }));
            const bestIndex = await scoreCandidatesWithAI(keyword, candidates, aiConfig);
            if (bestIndex !== null) {
              const finalUrl = hits[bestIndex].largeImageURL || hits[bestIndex].webformatURL;
              if (finalUrl) return finalUrl;
            }
          }

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
export async function getStockImage(
  keyword: string, 
  provider: number, 
  aiConfig?: { provider: string; apiKey: string }
): Promise<string> {
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
      acquiredUrl = await fetchFromProvider(keyword, prov, aiConfig);
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
