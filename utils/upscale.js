// ─────────────────────────────────────────────
// FAST CARD IMAGE UPSCALER
// ─────────────────────────────────────────────
// Cards opt in with `isUpscale: true`. Sharp performs a fast 2x Lanczos
// resize, and the promise cache prevents duplicate downloads/processing when
// several users request the same card at once.

const sharp = require('sharp');

const upscaleCache = new Map();
const IMAGE_FETCH_TIMEOUT_MS = 10_000;
const UPSCALE_FACTOR = 2;

function shouldUpscale(cardData, baseCard = null) {
  if (typeof cardData?.isUpscale === 'boolean') return cardData.isUpscale;
  return baseCard?.isUpscale === true;
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
  const metadata = await sharp(input).metadata();
  const width = Math.max(1, Number(metadata.width) || 1);
  const height = Math.max(1, Number(metadata.height) || 1);

  return sharp(input)
    .resize({
      width: width * UPSCALE_FACTOR,
      height: height * UPSCALE_FACTOR,
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
  if (!imageUrl || !shouldUpscale(cardData, baseCard)) {
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
  UPSCALE_FACTOR,
  shouldUpscale,
  upscaleImageBuffer,
  getUpscaledBuffer,
  getUpscaledImageBuffer,
  getCardImageSource
};