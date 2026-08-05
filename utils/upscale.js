// ─────────────────────────────────────────────
// FAST CARD IMAGE NORMALIZER
// ─────────────────────────────────────────────
// Every card is processed through the same fixed 2x canvas. Sharp performs a
// fast Lanczos resize, and the promise cache prevents duplicate downloads or
// processing when several users request the same card at once.

const sharp = require('sharp');

const upscaleCache = new Map();
const IMAGE_FETCH_TIMEOUT_MS = 10_000;
const UPSCALE_FACTOR = 2;
const CARD_WIDTH = 573;
const CARD_HEIGHT = 800;
const OUTPUT_WIDTH = CARD_WIDTH * UPSCALE_FACTOR;
const OUTPUT_HEIGHT = CARD_HEIGHT * UPSCALE_FACTOR;

function shouldUpscale(cardData, baseCard = null) {
  // Kept as a compatibility helper for existing callers. All card images are
  // now normalized so every card has the same output dimensions.
  return Boolean(cardData || baseCard);
}

async function fetchImageBuffer(imageUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(imageUrl, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`image download returned ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(timeout);
  }
}

async function upscaleImage(imageUrl) {
  const input = await fetchImageBuffer(imageUrl);
  return upscaleImageBuffer(input);
}

async function upscaleImageBuffer(input) {
  return sharp(input)
    .resize({
      width: OUTPUT_WIDTH,
      height: OUTPUT_HEIGHT,
      fit: 'contain',
      position: 'center',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3
    })
    .png()
    .toBuffer();
}

async function getUpscaledBuffer(input, cacheKey) {
  if (!cacheKey) return upscaleImageBuffer(input);
  if (upscaleCache.has(cacheKey)) return upscaleCache.get(cacheKey);

  const promise = upscaleImageBuffer(input).catch(error => {
    upscaleCache.delete(cacheKey);
    throw error;
  });
  upscaleCache.set(cacheKey, promise);
  return promise;
}

async function getUpscaledImageBuffer(imageUrl) {
  if (!imageUrl) return null;
  if (upscaleCache.has(`url:${imageUrl}`)) {
    return upscaleCache.get(`url:${imageUrl}`);
  }

  const promise = upscaleImage(imageUrl).catch(error => {
    upscaleCache.delete(`url:${imageUrl}`);
    throw error;
  });
  upscaleCache.set(`url:${imageUrl}`, promise);
  return promise;
}

async function getCardImageSource(cardData, baseCard = null) {
  const imageUrl = cardData?.image || baseCard?.image;
  if (!imageUrl) {
    return { source: imageUrl, upscaled: false };
  }

  try {
    return {
      source: await getUpscaledImageBuffer(imageUrl),
      upscaled: true
    };
  } catch (error) {
    console.warn(`[Upscale] Failed for ${imageUrl}: ${error.message}`);
    return { source: imageUrl, upscaled: false };
  }
}

module.exports = {
  CARD_WIDTH,
  CARD_HEIGHT,
  OUTPUT_WIDTH,
  OUTPUT_HEIGHT,
  UPSCALE_FACTOR,
  shouldUpscale,
  upscaleImageBuffer,
  getUpscaledBuffer,
  getUpscaledImageBuffer,
  getCardImageSource
};