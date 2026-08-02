// ─────────────────────────────────────────────
// SHINY IMAGE GENERATOR
// ─────────────────────────────────────────────
// Takes a card's image URL and overlays a holographic shiny effect on it.
// Returns a PNG buffer that can be attached to a Discord message.
//
// The effect has three layers:
//   1. Rainbow shimmer — a diagonal colour gradient blended into the image
//   2. Brightness boost — makes the whole card look more vibrant and lit
//   3. Sparkle stars   — 8 four-pointed stars at positions seeded by the card name
//
// Using jimp (pure JavaScript, no native dependencies) so it runs anywhere.

const Jimp = require('jimp');

// ─────────────────────────────────────────────
// SEEDED RNG — same algorithm as cards.js
// ─────────────────────────────────────────────
// We reuse the same hash + seededRandom pair from data/cards.js.
// This ensures sparkle positions are FIXED per card name — the same card
// always has its sparkles in the same spots for every player.

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = Math.imul(31, hash) + str.charCodeAt(i);
    hash |= 0; // Keep it a 32-bit integer
  }
  return Math.abs(hash);
}

function seededRandom(seed) {
  // Mulberry32 — fast, good distribution, no dependencies
  let t = (seed + 0x6D2B79F5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ─────────────────────────────────────────────
// RAINBOW GRADIENT
// ─────────────────────────────────────────────
// Returns an [R, G, B] colour at position t (0.0 → 1.0) along a rainbow cycle.
// The cycle goes: pink → gold → teal-green → blue → purple → pink.
function rainbowAt(t) {
  // Each stop: [position, R, G, B]
  const stops = [
    [0.00, 255, 120, 200], // pink
    [0.25, 255, 215, 55 ], // gold
    [0.50, 55,  225, 160], // teal-green
    [0.75, 55,  140, 255], // blue
    [1.00, 255, 120, 200]  // back to pink (seamless loop)
  ];

  for (let i = 0; i < stops.length - 1; i++) {
    const [pos0, r0, g0, b0] = stops[i];
    const [pos1, r1, g1, b1] = stops[i + 1];
    if (t >= pos0 && t <= pos1) {
      const pct = (t - pos0) / (pos1 - pos0); // 0–1 within this segment
      return [
        Math.round(r0 + pct * (r1 - r0)),
        Math.round(g0 + pct * (g1 - g0)),
        Math.round(b0 + pct * (b1 - b0))
      ];
    }
  }
  return [255, 120, 200]; // Fallback (should never hit this)
}

// ─────────────────────────────────────────────
// SPARKLE STAR DRAWING
// ─────────────────────────────────────────────
// Draws a 4-pointed star (+ shape with shorter × arms) centred at (cx, cy).
// The arms fade from bright white at the centre to transparent at the tips.
// armLen controls how long each arm is in pixels.
function drawSparkle(img, cx, cy, armLen) {
  const w = img.bitmap.width;
  const h = img.bitmap.height;

  for (let d = 0; d <= armLen; d++) {
    // Alpha fades linearly from 255 at the centre to 0 at the arm tip
    const alpha = Math.floor(255 * (1 - d / armLen));
    const color = Jimp.rgbaToInt(255, 255, 255, alpha);

    // ── Cardinal arms (+ cross, full length) ──
    for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) {
      const x = cx + dx, y = cy + dy;
      if (x >= 0 && x < w && y >= 0 && y < h) img.setPixelColor(color, x, y);
    }

    // ── Diagonal arms (× cross, shorter at 45%) ──
    if (d <= Math.ceil(armLen * 0.45)) {
      const diagColor = Jimp.rgbaToInt(255, 255, 255, Math.floor(alpha * 0.65));
      for (const [dx, dy] of [[d, d], [-d, d], [d, -d], [-d, -d]]) {
        const x = cx + dx, y = cy + dy;
        if (x >= 0 && x < w && y >= 0 && y < h) img.setPixelColor(diagColor, x, y);
      }
    }
  }
}

// ─────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────
/**
 * Generates a shiny version of a card image.
 *
 * @param {string} imageUrl  The original card image URL
 * @param {string} cardName  The card name — used to seed sparkle positions
 * @returns {Promise<Buffer>} PNG image buffer ready to attach to a Discord message
 */
async function generateShinyImage(imageUrl, cardName) {
  // Load the card image from its URL (jimp supports remote URLs natively)
  const img = await Jimp.read(imageUrl);
  const { width, height } = img.bitmap;

  // ── LAYER 1: Rainbow shimmer gradient ──
  // Scan every pixel and blend a rainbow colour into it at ~28% opacity.
  // The gradient runs diagonally from top-left to bottom-right.
  img.scan(0, 0, width, height, (x, y, idx) => {
    // Skip pixels that are fully transparent (e.g. transparent card borders)
    if (img.bitmap.data[idx + 3] < 10) return;

    // Gradient position: 0.0 at top-left corner, 1.0 at bottom-right corner
    const t = x / width * 0.5 + y / height * 0.5;
    const [r, g, b] = rainbowAt(t);

    // Blend the rainbow colour onto the existing pixel at 28% opacity.
    // "Blend" here means: newColour = existing × 0.72 + rainbow × 0.28
    const mix = 0.28;
    img.bitmap.data[idx + 0] = Math.round(img.bitmap.data[idx + 0] * (1 - mix) + r * mix);
    img.bitmap.data[idx + 1] = Math.round(img.bitmap.data[idx + 1] * (1 - mix) + g * mix);
    img.bitmap.data[idx + 2] = Math.round(img.bitmap.data[idx + 2] * (1 - mix) + b * mix);
    // Alpha channel (idx + 3) is untouched — we keep the original transparency
  });

  // ── LAYER 2: Brightness boost ──
  // A small positive brightness modifier makes the card look more vibrant and
  // "glowing" — like a foil card held up to the light.
  // jimp's .brightness() scale: 0.0 = no change, 1.0 = pure white, -1.0 = pure black.
  img.brightness(0.07);

  // ── LAYER 3: Sparkle stars ──
  // 8 four-pointed stars are placed at fixed positions seeded by the card name,
  // so every player sees the same sparkle layout for a given card.
  const SPARKLE_COUNT = 8;
  for (let i = 0; i < SPARKLE_COUNT; i++) {
    const cx     = Math.floor(seededRandom(hashString(`${cardName}|sx|${i}`)) * width);
    const cy     = Math.floor(seededRandom(hashString(`${cardName}|sy|${i}`)) * height);
    const armLen = 5 + Math.floor(seededRandom(hashString(`${cardName}|ss|${i}`)) * 8); // 5–12px
    drawSparkle(img, cx, cy, armLen);
  }

  // Convert to a PNG buffer.
  // This buffer can be passed directly to Discord.js AttachmentBuilder.
  return img.getBufferAsync(Jimp.MIME_PNG);
}

module.exports = { generateShinyImage };
