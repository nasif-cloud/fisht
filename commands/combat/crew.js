const { SlashCommandBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const { cards, rankConfig, resolveStat, safeRank, safeStat } = require('../../data/cards');
const User = require('../../models/user');
const { computeBoosts } = require('../../utils/boosts');
const { generateShinyImage } = require('../../utils/shinyImage');

const CANVAS_WIDTH = 860;
const CANVAS_HEIGHT = 500;
const SUCCESS_REACTION = '<:Success:1533154745731256531>';
const TEAM_COOLDOWN_MS = 5000;
const IMAGE_FETCH_TIMEOUT_MS = 2500;
const SHINY_EMOJI_URL = 'https://cdn.discordapp.com/emojis/1533666993637687466.png?size=32&quality=lossless';

const imageBufferCache = new Map();
let shinyEmojiImagePromise = null;

function buildOwnedCardPool(userData) {
  const ownedCards = [];

  for (const entry of userData?.cardCopies || []) {
    const card = cards.find(c => c.name === entry.cardName);
    if (!card) continue;

    const rank = safeRank(card.rank);
    const copies = entry.amount || 1;
    const isShiny = entry.shiny ?? false;
    const baseHealth = resolveStat(rank, 'health', safeStat(card.health), card.name, 1);
    const basePower = resolveStat(rank, 'power', safeStat(card.power), card.name, 1);
    const baseSpeed = resolveStat(rank, 'speed', safeStat(card.speed), card.name, 1);
    const boosted = computeBoosts(baseHealth, basePower, baseSpeed, copies, isShiny);

    ownedCards.push({
      card,
      copies,
      isShiny,
      // Auto-team selection and visual ordering use the same effective power
      // that the card displays elsewhere in the bot.
      power: boosted.power,
      rank
    });
  }

  return ownedCards.sort((a, b) => {
    return b.power - a.power ||
      Number(b.isShiny) - Number(a.isShiny) ||
      b.copies - a.copies ||
      a.card.name.localeCompare(b.card.name);
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
  const cut = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + cut, y);
  ctx.lineTo(x + width - cut, y);
  ctx.lineTo(x + width, y + cut);
  ctx.lineTo(x + width, y + height - cut);
  ctx.lineTo(x + width - cut, y + height);
  ctx.lineTo(x + cut, y + height);
  ctx.lineTo(x, y + height - cut);
  ctx.lineTo(x, y + cut);
  ctx.closePath();
}

function getRankColor(rank) {
  const color = rankConfig[safeRank(rank)]?.M1?.color || 0xffffff;
  return `#${color.toString(16).padStart(6, '0')}`;
}

function hexToRgb(hex) {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff
  };
}

function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawSurface(ctx) {
  const background = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  background.addColorStop(0, '#14161b');
  background.addColorStop(0.5, '#1b1e24');
  background.addColorStop(1, '#121419');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Broad, quiet bands suggest a charcoal wall without a particle field.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.018)';
  ctx.fillRect(0, 158, CANVAS_WIDTH, 2);
  ctx.fillRect(0, 474, CANVAS_WIDTH, 1);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
  ctx.fillRect(0, 170, CANVAS_WIDTH, 30);
  ctx.fillRect(0, 445, CANVAS_WIDTH, 18);
}

function drawLightSpill(ctx, layout, color, direction) {
  const { x, y, size } = layout;
  const spill = ctx.createLinearGradient(
    direction === 'left' ? x + size : x,
    y,
    direction === 'left' ? x : x + size,
    y + size
  );
  spill.addColorStop(0, rgba(color, 0));
  spill.addColorStop(0.48, rgba(color, 0.06));
  spill.addColorStop(1, rgba(color, 0));

  ctx.save();
  ctx.fillStyle = spill;
  ctx.beginPath();
  ctx.moveTo(x - 40, y + 16);
  ctx.lineTo(x + size + 40, y - 12);
  ctx.lineTo(x + size + 28, y + size + 28);
  ctx.lineTo(x - 32, y + size - 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawNeonBorder(ctx, entry, layout) {
  const color = entry ? getRankColor(entry.rank) : '#8f9bb7';
  const { x, y, size } = layout;
  const path = () => roundedRectPath(ctx, x + 7, y + 7, size - 14, size - 14, 13);

  // Keep the tube physical: a translucent body, saturated center, and a
  // narrow hot core. No stacked blur filters.
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(color, 0.28);
  ctx.lineWidth = 14;
  path();
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(color, 0.8);
  ctx.lineWidth = 7;
  path();
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba('#fff7ef', 0.72);
  ctx.lineWidth = 1.7;
  path();
  ctx.stroke();
  ctx.restore();

  // Uneven highlight fragments break the perfect vector-tube appearance.
  ctx.save();
  ctx.lineCap = 'round';
  ctx.setLineDash([24, 92, 8, 71]);
  ctx.lineDashOffset = -(size * 0.31);
  ctx.strokeStyle = rgba('#ffffff', 0.3);
  ctx.lineWidth = 1.15;
  path();
  ctx.stroke();
  ctx.restore();
}

async function fetchImageBuffer(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(timeout);
  }
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

  // Keep normal and shiny versions in separate canvas caches.
  const cacheKey = `${entry.card.image}|${entry.isShiny ? 'shiny' : 'normal'}`;
  if (imageBufferCache.has(cacheKey)) {
    const cached = imageBufferCache.get(cacheKey);
    return cached ? loadImage(cached) : null;
  }

  try {
    // A shiny-owned card must use the generated holographic image, not the
    // original card URL. The generator has its own buffer cache as well.
    const buffer = entry.isShiny
      ? await generateShinyImage(entry.card.image, entry.card.name)
      : await fetchImageBuffer(entry.card.image);
    imageBufferCache.set(cacheKey, buffer);
    return loadImage(buffer);
  } catch (error) {
    console.warn(`[Crew] Failed to load image for ${entry.card.name}: ${error.message}`);
    imageBufferCache.set(cacheKey, null);
    return null;
  }
}

// Load the small shiny emoji used as a badge on shiny team cards.
// Cache the promise so simultaneous team renders share one network request.
async function loadShinyEmojiImage() {
  if (!shinyEmojiImagePromise) {
    shinyEmojiImagePromise = fetchImageBuffer(SHINY_EMOJI_URL)
      .then(buffer => loadImage(buffer))
      .catch(error => {
        console.warn(`[Crew] Failed to load shiny emoji: ${error.message}`);
        return null;
      });
  }

  return shinyEmojiImagePromise;
}

// renderCardSlot now accepts an already-loaded sourceImage (or null for empty slots)
// so all network work can be done in parallel before any drawing starts.
function renderCardSlot(ctx, entry, sourceImage, shinyEmojiImage, layout) {
  const { x, y, size, innerPadding, captionY } = layout;
  const cardName = entry?.card?.name || '';
  const innerX = x + innerPadding;
  const innerY = y + innerPadding;
  const innerSize = size - innerPadding * 2;

  ctx.save();
  ctx.fillStyle = '#252831';
  roundedRectPath(ctx, x, y, size, size, 16);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = '#0b0c10';
  roundedRectPath(ctx, x + 9, y + 9, size - 18, size - 18, 12);
  ctx.fill();
  ctx.restore();

  drawNeonBorder(ctx, entry, layout);

  if (entry && sourceImage) {
    const crop = getSmartCrop(sourceImage); // top-biased crop — shows face area
    // Keep the card art as a simple printed panel instead of pairing a
    // rounded clip with a matching rounded border.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sourceImage, crop.x, crop.y, crop.size, crop.size, innerX, innerY, innerSize, innerSize);

    // Put only the plain shiny emoji icon in the card's top-right corner.
    if (entry.isShiny) {
      const badgeSize = Math.min(34, size * 0.16);
      const badgeX = x + size - badgeSize - 14;
      const badgeY = y + 14;

      ctx.save();
      if (shinyEmojiImage) {
        ctx.drawImage(shinyEmojiImage, badgeX, badgeY, badgeSize, badgeSize);
      } else {
        // Fallback if Discord's emoji CDN is temporarily unavailable.
        ctx.fillStyle = '#ffd44d';
        ctx.font = `900 ${Math.floor(badgeSize * 0.8)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✦', badgeX + badgeSize / 2, badgeY + badgeSize / 2);
      }
      ctx.restore();
    }

    // Put the label on the wall below the card instead of on a dark pill over
    // the art. The copy count stays visible without obscuring the image.
    const nameFontSize = fitFontSize(ctx, cardName, size - 18, 16);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = getRankColor(entry.rank);
    ctx.font = '700 12px sans-serif';
    ctx.fillText(`Co. ${entry.copies}`, x + size / 2, captionY - 10);
    ctx.fillStyle = '#f1f2f3';
    ctx.font = `700 ${nameFontSize}px sans-serif`;
    ctx.fillText(cardName, x + size / 2, captionY + 8);
    ctx.restore();
  } else {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.045)';
    roundedRectPath(ctx, innerX, innerY, innerSize, innerSize, 10);
    ctx.fill();
    ctx.restore();
  }
}

async function renderTeamImage(teamEntries, username) {
  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const ctx = canvas.getContext('2d');
  const totalPower = getTeamTotalPower(teamEntries);
  const slots = getDisplaySlots(teamEntries);

  drawSurface(ctx);

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 33px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TOTAL POWER', CANVAS_WIDTH / 2, 46);
  ctx.restore();

  ctx.save();
  ctx.fillStyle = '#ffd44d';
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
    // Captions sit in the open wall space above each frame, never over the
    // artwork. The center caption stays below the power number.
    left:   { x: 39,  y: 225, size: 215, radius: 34, innerPadding: 13, captionY: 214 },
    middle: { x: 292, y: 190, size: 270, radius: 40, innerPadding: 15, captionY: 178 },
    right:  { x: 599,  y: 225, size: 215, radius: 34, innerPadding: 13, captionY: 214 }
  };

  drawLightSpill(ctx, layout.left, slots[0] ? getRankColor(slots[0].rank) : '#8f9bb7', 'left');
  drawLightSpill(ctx, layout.middle, slots[1] ? getRankColor(slots[1].rank) : '#8f9bb7', 'right');
  drawLightSpill(ctx, layout.right, slots[2] ? getRankColor(slots[2].rank) : '#8f9bb7', 'right');

  // Fetch all card images in parallel — one round-trip instead of three sequential ones.
  const [imgLeft, imgMiddle, imgRight, shinyEmojiImage] = await Promise.all([
    loadCardImage(slots[0]),
    loadCardImage(slots[1]),
    loadCardImage(slots[2]),
    loadShinyEmojiImage()
  ]);

  // Drawing is synchronous (no more awaits needed inside renderCardSlot)
  renderCardSlot(ctx, slots[0], imgLeft,   shinyEmojiImage, layout.left);
  renderCardSlot(ctx, slots[1], imgMiddle, shinyEmojiImage, layout.middle);
  renderCardSlot(ctx, slots[2], imgRight,  shinyEmojiImage, layout.right);

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

    const now = Date.now();
    if (!autoMode && userData.lastTeamTime && (now - userData.lastTeamTime.getTime()) < TEAM_COOLDOWN_MS) {
      const secondsLeft = Math.ceil((TEAM_COOLDOWN_MS - (now - userData.lastTeamTime.getTime())) / 1000);
      const label = secondsLeft === 1 ? 'second' : 'seconds';
      const content = `Wait **${secondsLeft} ${label}** before checking your team again`;

      if (isSlash) {
        return interactionOrMessage.reply({ content, flags: 64 });
      }

      return interactionOrMessage.reply({ content, allowedMentions: { repliedUser: false } });
    }

    if (ownedCards.length === 0) {
      const content = "You don't own any cards yet. Use `op pull` to start pulling";
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
    userData.lastTeamTime = new Date(now);
    await userData.save().catch(() => {});
    const payload = await buildTeamPayload(user, teamEntries);

    if (isSlash) {
      return interactionOrMessage.editReply(payload);
    }
    return interactionOrMessage.channel.send({ ...payload, allowedMentions: { repliedUser: false } });
  }
};