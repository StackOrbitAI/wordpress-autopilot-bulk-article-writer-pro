import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

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
    "You are a professional, human-like SEO writer. Write long-form articles that are highly readable, EEAT-optimized, AdSense-friendly, and naturally structured. Avoid cliché AI phrases (e.g. 'in conclusion', 'delve', 'testament', 'tapestry'). Use markdown headings (H2, H3), bullet points, and clean tables where relevant. Ensure content is helpful and detailed.";

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
export async function generateFeaturedImage(
  config: AIProviderConfig,
  prompt: string,
  size: string,
  style: string,
  model?: string
): Promise<string> {
  // Only DALL-E (OpenAI) supported natively for direct image generation.
  // Custom endpoints can be configured if they support OpenAI image spec.
  const defaultUrl = 'https://api.openai.com/v1';
  const url = `${config.baseUrl || defaultUrl}/images/generations`;

  // Map 1200x628 and 1200x675 to OpenAI landscape sizes if using DALL-E 3
  // DALL-E 3 supports 1792x1024 landscape.
  const apiSize = (size === '1200x628' || size === '1200x675') ? '1792x1024' : size;
  
  // Build a descriptive, photorealistic prompt based on style
  const enhancedPrompt = `A high quality, high resolution, detailed ${style} image depicting: ${prompt}. No text, no logos, no watermarks, realistic lighting, professional composition.`;

  const headers = {
    'Authorization': `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json'
  };

  const imageModel = model || 'gpt-image-2';

  const requestBody: Record<string, any> = {
    model: imageModel,
    prompt: enhancedPrompt,
    n: 1,
    size: apiSize
  };

  // Only DALL-E models support response_format
  if (imageModel.toLowerCase().startsWith('dall-e')) {
    requestBody.response_format = 'url';
  }

  // Only DALL-E 3 supports quality parameter
  if (imageModel.toLowerCase() === 'dall-e-3') {
    requestBody.quality = 'standard';
  }

  const response = await axios.post(url, requestBody, { headers, timeout: 90000 });

  const imgData = response.data?.data?.[0];
  if (!imgData) {
    throw new Error('No image data returned from provider');
  }

  if (imgData.b64_json) {
    return await saveBase64Image(imgData.b64_json);
  } else if (imgData.url) {
    return await downloadImage(imgData.url);
  } else {
    throw new Error('Neither image URL nor base64 data returned from provider');
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

  const filename = `img_${Date.now()}.png`;
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

  const filename = `img_${Date.now()}.png`;
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
