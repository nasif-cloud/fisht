// ─────────────────────────────────────────────
// FAST CARD IMAGE NORMALIZER
// ─────────────────────────────────────────────
// Card images that are already visually close to the target dimensions are
// kept as-is. Other images are rendered on a fixed 573×800 canvas. Sharp keeps
// the original aspect ratio and crops only the minimum excess so there is no
// padding.

const sharp = require('sharp');

const imageCache = new Map();
const IMAGE_FETCH_TIMEOUT_MS = 10_000;
const CARD_WIDTH = 573;
const CARD_HEIGHT = 800;
const NEAR_TARGET_TOLERANCE = 0.03;

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
  return sharp(input, { sequentialRead: true })
    .resize({
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      fit: 'cover',
      position: 'center',
      kernel: sharp.kernel.cubic
    })
    .jpeg({
      quality: 82,
      chromaSubsampling: '4:2:0',
      trellisQuantisation: false,
      overshootDeringing: false,
      optimiseScans: false,
      progressive: false
    })
    .toBuffer();
}

function isNearTargetDimensions(width, height) {
  if (!width || !height) return false;

  return (
    Math.abs(width - CARD_WIDTH) / CARD_WIDTH <= NEAR_TARGET_TOLERANCE &&
    Math.abs(height - CARD_HEIGHT) / CARD_HEIGHT <= NEAR_TARGET_TOLERANCE
  );
}

async function processCardImageBuffer(input, imageUrl) {
  const metadata = await sharp(input, { sequentialRead: true }).metadata();

  if (isNearTargetDimensions(metadata.width, metadata.height)) {
    return {
      source: imageUrl,
      normalized: false,
      width: metadata.width,
      height: metadata.height
    };
  }

  return {
    source: await normalizeImageBuffer(input),
    normalized: true,
    width: CARD_WIDTH,
    height: CARD_HEIGHT
  };
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

async function getCardImageResult(imageUrl) {
  if (!imageUrl) {
    return { source: imageUrl, normalized: false };
  }

  const cacheKey = `smart-url:${imageUrl}`;
  if (imageCache.has(cacheKey)) return imageCache.get(cacheKey);

  const promise = fetchImageBuffer(imageUrl)
    .then(input => processCardImageBuffer(input, imageUrl))
    .catch(error => {
      imageCache.delete(cacheKey);
      throw error;
    });
  imageCache.set(cacheKey, promise);
  return promise;
}

async function getCardImagePayload(imageUrl, attachmentName = 'card_image.jpg') {
  try {
    const result = await getCardImageResult(imageUrl);
    return {
      imageUrl: result.normalized
        ? `attachment://${attachmentName}`
        : result.source,
      files: result.normalized
        ? [{ attachment: result.source, name: attachmentName }]
        : [],
      normalized: result.normalized
    };
  } catch (error) {
    console.warn(`[Card image] Failed for ${imageUrl}: ${error.message}`);
    return {
      imageUrl,
      files: [],
      normalized: false
    };
  }
}

async function getCardImageSource(cardData, baseCard = null) {
  const imageUrl = cardData?.image || baseCard?.image;

  try {
    return await getCardImageResult(imageUrl);
  } catch (error) {
    console.warn(`[Card image] Failed for ${imageUrl}: ${error.message}`);
    return { source: imageUrl, normalized: false };
  }
}

module.exports = {
  CARD_WIDTH,
  CARD_HEIGHT,
  NEAR_TARGET_TOLERANCE,
  isNearTargetDimensions,
  normalizeImageBuffer,
  getNormalizedBuffer,
  getNormalizedImageBuffer,
  getCardImageResult,
  getCardImagePayload,
  getCardImageSource
};