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

// The uploaded 512px meat asset has transparent margins; this larger draw box
// makes the visible drumstick match the scale of the reference chest artwork.
const ICON_SIZE = 360;
const EMOJI_URL = item =>
  `https://cdn.discordapp.com/emojis/${item.emojiId}.png?size=256&quality=lossless`;

// The four positions follow the supplied 2x2 layout: top-left, top-right,
// bottom-left, then bottom-right.
const SLOT_POSITIONS = [
  {
    iconX: 480, iconY: 320,
    titleX: 480, titleY: 610, titleAngle: -0.12,
    priceX: 860, priceY: 112
  },
  {
    iconX: 1485, iconY: 320,
    titleX: 1485, titleY: 610, titleAngle: -0.12,
    priceX: 1865, priceY: 112
  },
  {
    iconX: 480, iconY: 1020,
    titleX: 480, titleY: 1310, titleAngle: -0.12,
    priceX: 860, priceY: 812
  },
  {
    iconX: 1485, iconY: 1020,
    titleX: 1485, titleY: 1310, titleAngle: -0.12,
    priceX: 1865, priceY: 812
  }
];

GlobalFonts.registerFromPath(SHOP_FONT_PATH, SHOP_FONT);

function removeOuterWhite(image) {
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);

  const imageData = ctx.getImageData(0, 0, image.width, image.height);
  const pixels = imageData.data;
  const width = image.width;
  const height = image.height;
  const visited = new Uint8Array(width * height);
  const queue = [];

  const isBackground = index =>
    pixels[index] > 235 &&
    pixels[index + 1] > 235 &&
    pixels[index + 2] > 235 &&
    pixels[index + 3] > 0;

  const enqueue = (x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const point = y * width + x;
    if (visited[point]) return;
    visited[point] = 1;
    const index = point * 4;
    if (!isBackground(index)) return;
    queue.push(point);
  };

  for (let x = 0; x < width; x++) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  for (let cursor = 0; cursor < queue.length; cursor++) {
    const point = queue[cursor];
    const x = point % width;
    const y = Math.floor(point / width);
    pixels[point * 4 + 3] = 0;
    enqueue(x - 1, y);
    enqueue(x + 1, y);
    enqueue(x, y - 1);
    enqueue(x, y + 1);
  }

  ctx.putImageData(imageData, 0, 0);
  return loadImage(canvas.toBuffer('image/png'));
}

async function loadLocalIcon(item) {
  if (!item?.iconPath) return null;

  try {
    return removeOuterWhite(await loadImage(path.join(__dirname, '..', item.iconPath)));
  } catch {
    return null;
  }
}

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

async function loadItemIcon(item) {
  return (await loadLocalIcon(item)) || loadItemEmoji(item);
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

    const icon = await loadItemIcon(item);
    if (icon) {
      ctx.drawImage(
        icon,
        position.iconX - ICON_SIZE / 2,
        position.iconY - ICON_SIZE / 2,
        ICON_SIZE,
        ICON_SIZE
      );
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#0b0b0b';
    const titleSize = fitText(ctx, item.name, 650, 74);
    ctx.font = `400 ${titleSize}px "${SHOP_FONT}"`;
    ctx.save();
    ctx.translate(position.titleX, position.titleY);
    ctx.rotate(position.titleAngle || 0);
    ctx.fillText(item.name, 0, 0);
    ctx.restore();

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