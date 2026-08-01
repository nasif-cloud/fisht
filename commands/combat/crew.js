const { SlashCommandBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const { cards, rankConfig, resolveStat, safeRank, safeStat } = require('../../data/cards');
const User = require('../../models/user');

const CANVAS_WIDTH = 860;
const CANVAS_HEIGHT = 500;
const SUCCESS_REACTION = '✅';

function buildOwnedCardPool(userData) {
  const ownedCards = [];

  for (const entry of userData?.cardCopies || []) {
    const card = cards.find(c => c.name === entry.cardName);
    if (!card) continue;

    const rank = safeRank(card.rank);
    const power = resolveStat(rank, 'power', safeStat(card.power), card.name, 1);

    ownedCards.push({
      card,
      copies: entry.amount || 1,
      power,
      rank
    });
  }

  return ownedCards.sort((a, b) => {
    return b.power - a.power || b.copies - a.copies || a.card.name.localeCompare(b.card.name);
  });
}

function uniqueCards(cardEntries) {
  const seen = new Set();
  const unique = [];

  for (const entry of cardEntries) {
    if (!entry?.card?.name || seen.has(entry.card.name)) continue;
    seen.add(entry.card.name);
    unique.push(entry);
  }

  return unique;
}

function resolveDisplayTeam(userData, ownedCards) {
  const savedNames = Array.isArray(userData?.teamCards) ? userData.teamCards : [];
  const ownedLookup = new Map(ownedCards.map(entry => [entry.card.name, entry]));
  const selected = [];

  for (const name of savedNames) {
    const match = ownedLookup.get(name);
    if (match && !selected.some(entry => entry.card.name === name)) {
      selected.push(match);
    }
  }

  return uniqueCards(selected).slice(0, 3);
}

function getDisplaySlots(teamEntries) {
  // Always put the highest-power card in the center slot (index 1)
  // so the strongest card is visually prominent.
  const sorted = [...teamEntries].sort((a, b) => b.power - a.power);

  if (sorted.length === 0) return [null, null, null];
  if (sorted.length === 1) return [null, sorted[0], null];
  if (sorted.length === 2) return [sorted[1], sorted[0], null]; // strongest center, second left
  // 3 cards: strongest center, second left, third right
  return [sorted[1], sorted[0], sorted[2]];
}

function getTeamTotalPower(teamEntries) {
  return teamEntries.reduce((sum, entry) => sum + entry.power, 0);
}

function normalizeContentName(username) {
  return `**${username}'s team**`;
}

function getPrefixCommandName(message) {
  const content = message.content.slice(2).trim();
  return content.split(/ +/)[0]?.toLowerCase() || '';
}

// Shrink the font size until the text fits within maxWidth.
// Returns the font size to use — caller must set ctx.font before drawing.
function fitFontSize(ctx, text, maxWidth, maxPx) {
  let size = maxPx;
  ctx.font = `700 ${size}px sans-serif`;
  while (size > 8 && ctx.measureText(text).width > maxWidth) {
    size--;
    ctx.font = `700 ${size}px sans-serif`;
  }
  return size;
}

function roundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function getRankColor(rank) {
  const color = rankConfig[safeRank(rank)]?.M1?.color || 0xffffff;
  return `#${color.toString(16).padStart(6, '0')}`;
}

async function fetchImageBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

// Top-biased square crop — faces in card/manga art are almost always in the
// upper portion of the image, so we anchor the crop near the top rather than
// the center. For portrait images (taller than wide) we take a full-width
// square starting just a few percent from the top. For landscape/square images
// we fall back to a centered square crop.
function getSmartCrop(img) {
  const { width, height } = img;

  if (height > width) {
    // Portrait: crop a full-width square, anchored ~8% from the top
    const cropSize = width;
    const cropY = Math.floor(height * 0.08);
    // Make sure we don't overshoot the bottom
    const safeY = Math.min(cropY, height - cropSize);
    return { x: 0, y: Math.max(0, safeY), size: cropSize };
  }

  // Landscape / square: center crop
  const cropSize = Math.min(width, height);
  return {
    x: Math.floor((width  - cropSize) / 2),
    y: Math.floor((height - cropSize) / 2),
    size: cropSize
  };
}

// Pre-load a card's image. Returns null for empty slots so callers can check easily.
async function loadCardImage(entry) {
  if (!entry) return null;
  return loadImage(await fetchImageBuffer(entry.card.image));
}

// renderCardSlot now accepts an already-loaded sourceImage (or null for empty slots)
// so all network work can be done in parallel before any drawing starts.
function renderCardSlot(ctx, entry, sourceImage, layout) {
  const { x, y, size, radius, innerPadding } = layout;
  const borderColor = entry ? getRankColor(entry.rank) : '#8f9bb7';
  const cardName = entry?.card?.name || 'Empty slot';
  const frameShadow = entry ? borderColor : '#25304c';

  ctx.save();
  ctx.shadowColor = frameShadow;
  ctx.shadowBlur = entry ? 22 : 10;
  ctx.fillStyle = '#f7f9ff';
  roundedRectPath(ctx, x, y, size, size, radius);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = '#10172d';
  roundedRectPath(ctx, x + 9, y + 9, size - 18, size - 18, radius - 4);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.lineWidth = 8;
  ctx.strokeStyle = borderColor;
  roundedRectPath(ctx, x + 7, y + 7, size - 14, size - 14, radius - 5);
  ctx.stroke();
  ctx.restore();

  if (entry && sourceImage) {
    const crop = getSmartCrop(sourceImage); // top-biased crop — shows face area
    const innerX = x + innerPadding;
    const innerY = y + innerPadding;
    const innerSize = size - innerPadding * 2;

    ctx.save();
    roundedRectPath(ctx, innerX, innerY, innerSize, innerSize, Math.max(10, radius - 12));
    ctx.clip();

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sourceImage, crop.x, crop.y, crop.size, crop.size, innerX, innerY, innerSize, innerSize);

    ctx.restore();

    // Draw name label — shrink font until it fully fits, never cut it off
    ctx.save();
    const nameMaxWidth = innerSize - 12; // 6px padding each side
    const nameFontSize = fitFontSize(ctx, cardName, nameMaxWidth, 15);
    const labelHeight = nameFontSize + 14; // padding above and below text
    ctx.fillStyle = 'rgba(0, 0, 0, 0.52)';
    roundedRectPath(ctx, innerX, innerY + innerSize - labelHeight, innerSize, labelHeight, 10);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${nameFontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cardName, innerX + innerSize / 2, innerY + innerSize - labelHeight / 2);
    ctx.restore();
  } else {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
    roundedRectPath(ctx, x + innerPadding, y + innerPadding, size - innerPadding * 2, size - innerPadding * 2, Math.max(10, radius - 12));
    ctx.fill();
    ctx.fillStyle = '#c1ccf8';
    ctx.font = '700 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Empty slot', x + size / 2, y + size / 2);
    ctx.restore();
  }
}

async function renderTeamImage(teamEntries, username) {
  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const ctx = canvas.getContext('2d');
  const totalPower = getTeamTotalPower(teamEntries);
  const slots = getDisplaySlots(teamEntries);

  const background = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  background.addColorStop(0, '#07122d');
  background.addColorStop(1, '#161337');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const glow = ctx.createRadialGradient(CANVAS_WIDTH / 2, 110, 40, CANVAS_WIDTH / 2, 110, 320);
  glow.addColorStop(0, 'rgba(108, 77, 255, 0.28)');
  glow.addColorStop(1, 'rgba(7, 18, 45, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 33px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TOTAL POWER', CANVAS_WIDTH / 2, 46);
  ctx.restore();

  ctx.save();
  ctx.fillStyle = '#ffd44d';
  ctx.shadowColor = 'rgba(255, 212, 77, 0.7)';
  ctx.shadowBlur = 18;
  ctx.font = '900 86px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(totalPower), CANVAS_WIDTH / 2, 118);
  ctx.restore();

  // Layout is centered on the 860px canvas.
  // Side cards: size=200, middle card: size=250, gap=20
  // Total width: 200 + 20 + 250 + 20 + 200 = 690 → start at (860-690)/2 = 85
  // Middle card center: 85 + 200 + 20 + 125 = 430 = canvas center ✓
  // Cards start well below the number text (which bottoms out ~y=161) with breathing room.
  const layout = {
    left:   { x: 40,  y: 225, size: 215, radius: 34, innerPadding: 13 },
    middle: { x: 293, y: 190, size: 270, radius: 40, innerPadding: 15 },
    right:  { x: 595, y: 225, size: 215, radius: 34, innerPadding: 13 }
  };

  // Fetch all card images in parallel — one round-trip instead of three sequential ones.
  const [imgLeft, imgMiddle, imgRight] = await Promise.all([
    loadCardImage(slots[0]),
    loadCardImage(slots[1]),
    loadCardImage(slots[2])
  ]);

  // Drawing is synchronous (no more awaits needed inside renderCardSlot)
  renderCardSlot(ctx, slots[0], imgLeft,   layout.left);
  renderCardSlot(ctx, slots[1], imgMiddle, layout.middle);
  renderCardSlot(ctx, slots[2], imgRight,  layout.right);

  return canvas.toBuffer('image/png');
}

async function saveAutoTeam(userData, ownedCards) {
  const topThree = ownedCards.slice(0, 3);
  userData.teamCards = topThree.map(entry => entry.card.name);
  await userData.save();
  return topThree;
}

async function buildTeamPayload(user, teamEntries) {
  const image = await renderTeamImage(teamEntries, user.username);

  return {
    content: normalizeContentName(user.username),
    files: [{ attachment: image, name: 'team.png' }],
  };
}

function teamMatchesBestPossible(teamCards, ownedCards) {
  const bestCards = ownedCards.slice(0, 3).map(entry => entry.card.name);
  if (teamCards.length !== bestCards.length) return false;

  const teamSet = new Set(teamCards);
  return bestCards.every(name => teamSet.has(name));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('team')
    .setDescription('Show your 3 card team'),

  name: 'team',
  aliases: ['team', 'autoteam', 'auto'],

  async execute(interactionOrMessage) {
    const user = interactionOrMessage.user || interactionOrMessage.author;
    const isSlash = interactionOrMessage.isChatInputCommand?.();
    const prefixCommandName = isSlash ? 'team' : getPrefixCommandName(interactionOrMessage);
    const autoMode = !isSlash && (prefixCommandName === 'autoteam' || prefixCommandName === 'auto');

    const userData = await User.findOne({ userId: user.id }) || new User({ userId: user.id });
    const ownedCards = buildOwnedCardPool(userData);

    if (ownedCards.length === 0) {
      const content = "You don't own any cards yet. Use `op pull` to get some!";
      if (isSlash) {
        return interactionOrMessage.reply({ content, flags: 64 });
      }
      return interactionOrMessage.reply({ content, allowedMentions: { repliedUser: false } });
    }

    if (autoMode) {
      const currentTeam = Array.isArray(userData.teamCards) ? userData.teamCards : [];
      if (teamMatchesBestPossible(currentTeam, ownedCards)) {
        const message = 'Strongest possible cards already set.';
        if (interactionOrMessage.reply) {
          return interactionOrMessage.reply({ content: message, allowedMentions: { repliedUser: false } });
        }
      }

      await saveAutoTeam(userData, ownedCards);

      try {
        if (interactionOrMessage.react) {
          await interactionOrMessage.react(SUCCESS_REACTION);
        }
      } catch {
        // Reaction failures should not block the save.
      }

      return;
    }

    // Defer the slash reply immediately so Discord doesn't time out during
    // the image fetch + canvas render (which can take a couple of seconds).
    if (isSlash) await interactionOrMessage.deferReply();

    const teamEntries = resolveDisplayTeam(userData, ownedCards);
    const payload = await buildTeamPayload(user, teamEntries);

    if (isSlash) {
      return interactionOrMessage.editReply(payload);
    }
    return interactionOrMessage.channel.send({ ...payload, allowedMentions: { repliedUser: false } });
  }
};