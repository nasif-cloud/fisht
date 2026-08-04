const path = require('node:path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const shopItems = require('../data/shop');

const SHOP_WIDTH = 2000;
const SHOP_HEIGHT = 1414;
const SHOP_FONT = 'Luckiest Guy';
const SHOP_FONT_PATH = path.join(
  __dirname,
  '..',
  'attached_assets',
  'LuckiestGuy-Regular.ttf'
);
const SHOP_BACKGROUND_PATH = path.join(
  __dirname,
  '..',
  'attached_assets',
  'Joy_journey_Shop_20260804_020137_0000_1785823860066.png'
);

const EMOJI_SIZE = 180;
const EMOJI_URL = item =>
  `https://cdn.discordapp.com/emojis/${item.emojiId}.png?size=256&quality=lossless`;

// The four positions follow the supplied 2x2 layout: top-left, top-right,
// bottom-left, then bottom-right.
const SLOT_POSITIONS = [
  { centerX: 480, centerY: 315, titleX: 480, titleY: 610, priceX: 820, priceY: 126 },
  { centerX: 1485, centerY: 315, titleX: 1485, titleY: 610, priceX: 1820, priceY: 126 },
  { centerX: 480, centerY: 1015, titleX: 480, titleY: 1310, priceX: 820, priceY: 826 },
  { centerX: 1485, centerY: 1015, titleX: 1485, titleY: 1310, priceX: 1820, priceY: 826 }
];

GlobalFonts.registerFromPath(SHOP_FONT_PATH, SHOP_FONT);

async function loadItemEmoji(item) {
  if (!item?.emojiId) return null;

  try {
    const response = await fetch(EMOJI_URL(item));
    if (!response.ok) return null;
    return loadImage(Buffer.from(await response.arrayBuffer()));
  } catch {
    return null;
  }
}

function fitText(ctx, text, maxWidth, maxSize) {
  let size = maxSize;
  while (size > 18) {
    ctx.font = `400 ${size}px "${SHOP_FONT}"`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 1;
  }
  return size;
}

async function renderShopImage() {
  const canvas = createCanvas(SHOP_WIDTH, SHOP_HEIGHT);
  const ctx = canvas.getContext('2d');
  const background = await loadImage(SHOP_BACKGROUND_PATH);
  ctx.drawImage(background, 0, 0, SHOP_WIDTH, SHOP_HEIGHT);

  for (const [index, item] of shopItems.entries()) {
    const position = SLOT_POSITIONS[index];
    if (!position) break;

    const emoji = await loadItemEmoji(item);
    if (emoji) {
      ctx.drawImage(
        emoji,
        position.centerX - EMOJI_SIZE / 2,
        position.centerY - EMOJI_SIZE / 2,
        EMOJI_SIZE,
        EMOJI_SIZE
      );
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#0b0b0b';
    const titleSize = fitText(ctx, item.name, 650, 74);
    ctx.font = `400 ${titleSize}px "${SHOP_FONT}"`;
    ctx.fillText(item.name, position.titleX, position.titleY);

    const priceText = `${(item.price / 1000).toFixed(item.price % 1000 === 0 ? 0 : 1)}k`;
    const priceSize = fitText(ctx, priceText, 260, 58);
    ctx.font = `400 ${priceSize}px "${SHOP_FONT}"`;
    ctx.fillText(priceText, position.priceX, position.priceY);
  }

  return canvas.toBuffer('image/png');
}

module.exports = {
  SLOT_POSITIONS,
  renderShopImage
};