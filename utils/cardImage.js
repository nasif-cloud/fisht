// ─────────────────────────────────────────────
// CARD IMAGE NORMALIZER
// ─────────────────────────────────────────────
// Every card image is rendered on the same fixed 573×800 canvas. Sharp keeps
// the original aspect ratio and uses transparent padding when necessary.

const sharp = require('sharp');

const imageCache = new Map();
const IMAGE_FETCH_TIMEOUT_MS = 10_000;
const CARD_WIDTH = 573;
const CARD_HEIGHT = 800;

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

async function normalizeImageBuffer(input) {
  return sharp(input)
    .resize({
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      fit: 'contain',
      position: 'center',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3
    })
    .png()
    .toBuffer();
}

async function getNormalizedBuffer(input, cacheKey) {
  if (!cacheKey) return normalizeImageBuffer(input);
  if (imageCache.has(cacheKey)) return imageCache.get(cacheKey);

  const promise = normalizeImageBuffer(input).catch(error => {
    imageCache.delete(cacheKey);
    throw error;
  });
  imageCache.set(cacheKey, promise);
  return promise;
}

async function getNormalizedImageBuffer(imageUrl) {
  if (!imageUrl) return null;
  const cacheKey = `url:${imageUrl}`;
  if (imageCache.has(cacheKey)) return imageCache.get(cacheKey);

  const promise = fetchImageBuffer(imageUrl)
    .then(normalizeImageBuffer)
    .catch(error => {
      imageCache.delete(cacheKey);
      throw error;
    });
  imageCache.set(cacheKey, promise);
  return promise;
}

async function getCardImageSource(cardData, baseCard = null) {
  const imageUrl = cardData?.image || baseCard?.image;
  if (!imageUrl) {
    return { source: imageUrl, normalized: false };
  }

  try {
    return {
      source: await getNormalizedImageBuffer(imageUrl),
      normalized: true
    };
  } catch (error) {
    console.warn(`[Card image] Failed for ${imageUrl}: ${error.message}`);
    return { source: imageUrl, normalized: false };
  }
}

module.exports = {
  CARD_WIDTH,
  CARD_HEIGHT,
  normalizeImageBuffer,
  getNormalizedBuffer,
  getNormalizedImageBuffer,
  getCardImageSource
};