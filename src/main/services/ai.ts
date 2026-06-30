import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { decrypt } from './security';
import { dbGet } from '../database/connection';

export interface AIProviderConfig {
  provider: 'openai' | 'gemini' | 'claude' | 'openrouter' | 'custom';
  apiKey: string;
  baseUrl?: string;
  organization?: string;
}

export interface GenerationResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCost: number;
}

// Cost estimations per 1000 tokens as of mid-2026 (approximate fallback)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  // Gemini
  'gemini-1.5-pro': { input: 0.00125, output: 0.00375 },
  'gemini-1.5-flash': { input: 0.000075, output: 0.0003 },
  'gemini-2.0-flash-exp': { input: 0.000075, output: 0.0003 },
  // Claude
  'claude-3-5-sonnet-latest': { input: 0.003, output: 0.015 },
  'claude-3-opus-latest': { input: 0.015, output: 0.075 },
  'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 },
  // Default fallback
  'default': { input: 0.002, output: 0.006 }
};

function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const modelKey = Object.keys(MODEL_PRICING).find(key => model.toLowerCase().includes(key)) || 'default';
  const pricing = MODEL_PRICING[modelKey];
  return ((promptTokens * pricing.input) + (completionTokens * pricing.output)) / 1000;
}

// Approximate tokens based on characters (roughly 4 chars = 1 token) if API doesn't return count
function countCharsToTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Main function to generate SEO articles with specific templates and guidelines.
 */
export async function generateArticle(
  config: AIProviderConfig,
  model: string,
  prompt: string,
  systemInstruction?: string
): Promise<GenerationResult> {
  const sysPrompt = systemInstruction || 
    "You are a professional, human-like SEO writer and content assistant. Respond to the user's prompt by generating high-quality content that strictly follows their instructions for format, language, style, length, and topic. Avoid cliché AI phrases (e.g. 'in conclusion', 'delve', 'testament', 'tapestry'). If writing articles, use markdown headings (H2, H3), bullet points, and clean tables where relevant. Follow all user specifications in the prompt exactly.";

  const provider = config.provider.toLowerCase();

  switch (provider) {
    case 'openai':
    case 'openrouter':
    case 'custom':
      return callOpenAICompatible(config, model, prompt, sysPrompt);
    case 'gemini':
      return callGemini(config, model, prompt, sysPrompt);
    case 'claude':
      return callClaude(config, model, prompt, sysPrompt);
    default:
      throw new Error(`Unsupported AI provider: ${config.provider}`);
  }
}

/**
 * Call OpenAI, OpenRouter, or custom compatible API
 */
async function callOpenAICompatible(
  config: AIProviderConfig,
  model: string,
  prompt: string,
  systemPrompt: string
): Promise<GenerationResult> {
  let defaultUrl = 'https://api.openai.com/v1';
  if (config.provider === 'openrouter') {
    defaultUrl = 'https://openrouter.ai/api/v1';
  }
  const url = `${config.baseUrl || defaultUrl}/chat/completions`;

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json'
  };

  if (config.organization) {
    headers['OpenAI-Organization'] = config.organization;
  }

  // OpenRouter requires specific site referrers
  if (config.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://stackorbitai.com';
    headers['X-Title'] = 'StackOrbitAI Bulk Writer Pro';
  }

  const response = await axios.post(url, {
    model: model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7
  }, { headers, timeout: 120000 });

  const choice = response.data?.choices?.[0]?.message?.content || '';
  const usage = response.data?.usage || {
    prompt_tokens: countCharsToTokens(prompt + systemPrompt),
    completion_tokens: countCharsToTokens(choice)
  };

  const promptTokens = usage.prompt_tokens;
  const completionTokens = usage.completion_tokens;

  return {
    text: choice,
    promptTokens,
    completionTokens,
    estimatedCost: estimateCost(model, promptTokens, completionTokens)
  };
}

/**
 * Call direct Gemini API
 */
async function callGemini(
  config: AIProviderConfig,
  model: string,
  prompt: string,
  systemPrompt: string
): Promise<GenerationResult> {
  const apiKey = config.apiKey;
  const geminiModel = model || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [{ text: `${systemPrompt}\n\nUser Input: ${prompt}` }]
      }
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192
    }
  };

  const response = await axios.post(url, requestBody, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 120000
  });

  const parts = response.data?.candidates?.[0]?.content?.parts || [];
  const choice = parts.map((p: any) => p.text).join('') || '';

  // Gemini returns token counts in response metadata if requested, or we approximate
  const promptTokens = response.data?.usageMetadata?.promptTokenCount || countCharsToTokens(prompt + systemPrompt);
  const completionTokens = response.data?.usageMetadata?.candidatesTokenCount || countCharsToTokens(choice);

  return {
    text: choice,
    promptTokens,
    completionTokens,
    estimatedCost: estimateCost(geminiModel, promptTokens, completionTokens)
  };
}

/**
 * Call Anthropic Claude API
 */
async function callClaude(
  config: AIProviderConfig,
  model: string,
  prompt: string,
  systemPrompt: string
): Promise<GenerationResult> {
  const url = 'https://api.anthropic.com/v1/messages';
  const headers = {
    'x-api-key': config.apiKey,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json'
  };

  const response = await axios.post(url, {
    model: model || 'claude-3-5-sonnet-latest',
    system: systemPrompt,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 4000,
    temperature: 0.7
  }, { headers, timeout: 120000 });

  const contentParts = response.data?.content || [];
  const choice = contentParts.map((p: any) => p.text).join('') || '';

  const promptTokens = response.data?.usage?.input_tokens || countCharsToTokens(prompt + systemPrompt);
  const completionTokens = response.data?.usage?.output_tokens || countCharsToTokens(choice);

  return {
    text: choice,
    promptTokens,
    completionTokens,
    estimatedCost: estimateCost(model, promptTokens, completionTokens)
  };
}

/**
 * Generates an image and returns the local file path.
 */
export async function generateGeminiImagen(
  apiKey: string,
  prompt: string,
  size: string,
  modelName: string = 'imagen-3.0-generate-002'
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:predict`;
  
  let aspectRatio = '1:1';
  if (size === '1200x628' || size === '1200x675' || size === '1792x1024' || size === '16:9') {
    aspectRatio = '16:9';
  } else if (size === '4:3') {
    aspectRatio = '4:3';
  } else if (size === '9:16') {
    aspectRatio = '9:16';
  }

  const headers = {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey
  };

  const response = await axios.post(url, {
    instances: [
      {
        prompt: prompt
      }
    ],
    parameters: {
      sampleCount: 1,
      aspectRatio: aspectRatio,
      outputMimeType: 'image/jpeg'
    }
  }, { headers, timeout: 60000 });

  const base64 = response.data?.predictions?.[0]?.bytesBase64Encoded;
  if (!base64) {
    throw new Error('No image returned from Gemini Imagen API');
  }

  return await saveBase64Image(base64);
}

export async function generateRunwareImage(
  apiKey: string,
  prompt: string,
  size: string,
  modelName: string = 'runware:100'
): Promise<string> {
  const url = 'https://api.runware.ai/v1';

  let width = 1024;
  let height = 768;
  if (size === '1200x628') {
    width = 1200;
    height = 628;
  } else if (size === '1200x675') {
    width = 1200;
    height = 672; // Round to multiple of 16/64
  } else if (size.includes('x')) {
    const parts = size.split('x');
    width = parseInt(parts[0], 10) || 1024;
    height = parseInt(parts[1], 10) || 768;
  }

  // Stable Diffusion and Flux models require dimensions to be multiples of 64.
  // We automatically round to the nearest multiple of 64 to ensure API compatibility.
  width = Math.round(width / 64) * 64;
  height = Math.round(height / 64) * 64;

  const headers = {
    'Content-Type': 'application/json'
  };

  const payload = [
    {
      taskType: 'authentication',
      apiKey: apiKey
    },
    {
      taskType: 'imageInference',
      taskUUID: `task_${Date.now()}`,
      positivePrompt: prompt,
      width: width,
      height: height,
      model: modelName,
      numberResults: 1
    }
  ];

  const response = await axios.post(url, payload, { headers, timeout: 60000 });
  const data = response.data?.data;
  const inferenceResult = data?.find((d: any) => d.taskType === 'imageInference');
  const imageUrl = inferenceResult?.imageURL;

  if (!imageUrl) {
    const errResult = data?.find((d: any) => d.error);
    throw new Error(errResult?.error || 'No image URL returned from Runware API');
  }

  return await downloadImage(imageUrl);
}

export async function generateFeaturedImage(
  config: AIProviderConfig,
  prompt: string,
  size: string,
  style: string,
  model?: string
): Promise<string> {
  const imageModel = model || 'gpt-image-2';
  const enhancedPrompt = `A high quality, high resolution, detailed ${style} image depicting: ${prompt}. No text, no logos, no watermarks, realistic lighting, professional composition.`;

  // 1. Runware AI Generation Check
  if (imageModel.toLowerCase().startsWith('runware') || imageModel.toLowerCase().startsWith('civitai') || imageModel.toLowerCase().startsWith('cblas')) {
    const rwKeySetting = await dbGet(`SELECT value FROM settings WHERE key = 'runware_api_key'`);
    const rwKey = rwKeySetting?.value || '';
    if (!rwKey) {
      throw new Error('Runware.ai API Key is not configured. Please add it in Settings.');
    }
    return await generateRunwareImage(rwKey, enhancedPrompt, size, imageModel);
  }

  // 2. Gemini Imagen Generation Check
  if (imageModel.toLowerCase().startsWith('imagen-')) {
    let geminiKey = '';
    if (config.provider === 'gemini') {
      geminiKey = config.apiKey;
    } else {
      const dbKey = await dbGet(`SELECT api_key FROM api_keys WHERE provider = 'gemini' ORDER BY is_default DESC LIMIT 1`);
      if (dbKey?.api_key) {
        geminiKey = decrypt(dbKey.api_key);
      }
    }
    if (!geminiKey) {
      throw new Error('Google Gemini API Key is not configured. Please add a Gemini credentials integration first.');
    }
    return await generateGeminiImagen(geminiKey, enhancedPrompt, size, imageModel);
  }

  // 3. Default OpenAI DALL-E Fallback
  const defaultUrl = 'https://api.openai.com/v1';
  const url = `${config.baseUrl || defaultUrl}/images/generations`;
  const apiSize = (size === '1200x628' || size === '1200x675') ? '1792x1024' : size;
  const headers = {
    'Authorization': `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json'
  };
  const requestBody: Record<string, any> = {
    model: imageModel,
    prompt: enhancedPrompt,
    n: 1,
    size: apiSize
  };
  if (imageModel.toLowerCase().startsWith('dall-e')) {
    requestBody.response_format = 'url';
  }
  if (imageModel.toLowerCase() === 'dall-e-3') {
    requestBody.quality = 'standard';
  }
  const response = await axios.post(url, requestBody, { headers, timeout: 120000 });
  const imgData = response.data?.data?.[0];
  if (!imgData) throw new Error('No image data returned from provider');
  if (imgData.b64_json) return await saveBase64Image(imgData.b64_json);
  if (imgData.url) return await downloadImage(imgData.url);
  throw new Error('Neither image URL nor base64 data returned from provider');
}

/**
 * Fetches stock images from Pexels or Unsplash and returns the local file path.
 */
export async function fetchStockImage(
  provider: 'pexels' | 'unsplash',
  query: string,
  apiKey: string
): Promise<string> {
  if (!apiKey) {
    throw new Error(`API Key / Access Key for ${provider} is missing. Please configure it in Settings.`);
  }

  if (provider === 'pexels') {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1`;
    const response = await axios.get(url, {
      headers: {
        'Authorization': apiKey
      },
      timeout: 15000
    });
    const photo = response.data?.photos?.[0];
    if (!photo) {
      throw new Error(`No image found on Pexels for query: "${query}"`);
    }
    const imageUrl = photo.src?.large2x || photo.src?.large || photo.src?.original;
    if (!imageUrl) {
      throw new Error(`Invalid image URL returned from Pexels`);
    }
    return await downloadImage(imageUrl);
  } else {
    // Unsplash
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1`;
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Client-ID ${apiKey}`
      },
      timeout: 15000
    });
    const result = response.data?.results?.[0];
    if (!result) {
      throw new Error(`No image found on Unsplash for query: "${query}"`);
    }
    const imageUrl = result.urls?.regular || result.urls?.full;
    if (!imageUrl) {
      throw new Error(`Invalid image URL returned from Unsplash`);
    }
    return await downloadImage(imageUrl);
  }
}

async function saveBase64Image(b64Data: string): Promise<string> {
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

  const randomSuffix = Math.random().toString(36).substring(2, 10);
  const filename = `img_${Date.now()}_${randomSuffix}.png`;
  const localPath = path.join(downloadsDir, filename);

  const buffer = Buffer.from(b64Data, 'base64');
  await fs.promises.writeFile(localPath, buffer);

  return localPath;
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

  const randomSuffix = Math.random().toString(36).substring(2, 10);
  const filename = `img_${Date.now()}_${randomSuffix}.png`;
  const localPath = path.join(downloadsDir, filename);

  const response = await axios({
    method: 'get',
    url: imageUrl,
    responseType: 'stream'
  });

  const writer = fs.createWriteStream(localPath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', () => resolve(localPath));
    writer.on('error', (err) => reject(err));
  });
}

export interface MultimodalImage {
  mimeType: string;
  base64: string;
}

export async function generateMultimodalAnalysis(
  config: AIProviderConfig,
  model: string,
  prompt: string,
  images: MultimodalImage[],
  systemInstruction?: string
): Promise<GenerationResult> {
  const sysPrompt = systemInstruction || 
    "You are a precise, analytical assistant that visualizes and chooses the best image candidate matching a topic.";
  
  const provider = config.provider.toLowerCase();

  switch (provider) {
    case 'openai':
    case 'openrouter':
    case 'custom':
      return callOpenAIMultimodal(config, model, prompt, images, sysPrompt);
    case 'gemini':
      return callGeminiMultimodal(config, model, prompt, images, sysPrompt);
    case 'claude':
      return callClaudeMultimodal(config, model, prompt, images, sysPrompt);
    default:
      throw new Error(`Unsupported AI provider for vision analysis: ${config.provider}`);
  }
}

async function callOpenAIMultimodal(
  config: AIProviderConfig,
  model: string,
  prompt: string,
  images: MultimodalImage[],
  systemPrompt: string
): Promise<GenerationResult> {
  let defaultUrl = 'https://api.openai.com/v1';
  if (config.provider === 'openrouter') {
    defaultUrl = 'https://openrouter.ai/api/v1';
  }
  const url = `${config.baseUrl || defaultUrl}/chat/completions`;

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json'
  };

  if (config.organization) {
    headers['OpenAI-Organization'] = config.organization;
  }

  if (config.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://stackorbitai.com';
    headers['X-Title'] = 'StackOrbitAI Bulk Writer Pro';
  }

  const contentParts: any[] = [{ type: 'text', text: prompt }];
  for (const img of images) {
    contentParts.push({
      type: 'image_url',
      image_url: {
        url: `data:${img.mimeType};base64,${img.base64}`
      }
    });
  }

  const response = await axios.post(url, {
    model: model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: contentParts }
    ],
    temperature: 0.2
  }, { headers, timeout: 60000 });

  const choice = response.data?.choices?.[0]?.message?.content || '';
  const usage = response.data?.usage || {
    prompt_tokens: countCharsToTokens(prompt + systemPrompt),
    completion_tokens: countCharsToTokens(choice)
  };

  const promptTokens = usage.prompt_tokens;
  const completionTokens = usage.completion_tokens;

  return {
    text: choice,
    promptTokens,
    completionTokens,
    estimatedCost: estimateCost(model, promptTokens, completionTokens)
  };
}

async function callGeminiMultimodal(
  config: AIProviderConfig,
  model: string,
  prompt: string,
  images: MultimodalImage[],
  systemPrompt: string
): Promise<GenerationResult> {
  const apiKey = config.apiKey;
  const geminiModel = model || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;

  const parts: any[] = [{ text: `${systemPrompt}\n\nUser Input: ${prompt}` }];
  for (const img of images) {
    parts.push({
      inlineData: {
        mimeType: img.mimeType,
        data: img.base64
      }
    });
  }

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: parts
      }
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 100
    }
  };

  const response = await axios.post(url, requestBody, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 60000
  });

  const responseParts = response.data?.candidates?.[0]?.content?.parts || [];
  const choice = responseParts.map((p: any) => p.text).join('') || '';

  const promptTokens = response.data?.usageMetadata?.promptTokenCount || countCharsToTokens(prompt + systemPrompt);
  const completionTokens = response.data?.usageMetadata?.candidatesTokenCount || countCharsToTokens(choice);

  return {
    text: choice,
    promptTokens,
    completionTokens,
    estimatedCost: estimateCost(geminiModel, promptTokens, completionTokens)
  };
}

async function callClaudeMultimodal(
  config: AIProviderConfig,
  model: string,
  prompt: string,
  images: MultimodalImage[],
  systemPrompt: string
): Promise<GenerationResult> {
  const url = 'https://api.anthropic.com/v1/messages';
  const headers = {
    'x-api-key': config.apiKey,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json'
  };

  const contentParts: any[] = [];
  for (const img of images) {
    contentParts.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: img.mimeType,
        data: img.base64
      }
    });
  }
  contentParts.push({ type: 'text', text: prompt });

  const response = await axios.post(url, {
    model: model || 'claude-3-5-sonnet-latest',
    system: systemPrompt,
    messages: [{ role: 'user', content: contentParts }],
    max_tokens: 100,
    temperature: 0.2
  }, { headers, timeout: 60000 });

  const responseParts = response.data?.content || [];
  const choice = responseParts.map((p: any) => p.text).join('') || '';

  const promptTokens = response.data?.usage?.input_tokens || countCharsToTokens(prompt + systemPrompt);
  const completionTokens = response.data?.usage?.output_tokens || countCharsToTokens(choice);

  return {
    text: choice,
    promptTokens,
    completionTokens,
    estimatedCost: estimateCost(model, promptTokens, completionTokens)
  };
}
