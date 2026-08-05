const { SlashCommandBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const { cards, rankConfig, resolveStat, safeRank, safeStat } = require('../../data/cards');
const User = require('../../models/user');
const { computeBoosts } = require('../../utils/boosts');
const { generateShinyImage } = require('../../utils/shinyImage');
const { assignRoles } = require('../../utils/duel');

const CANVAS_WIDTH = 860;
const CANVAS_HEIGHT = 500;
const SUCCESS_REACTION = '<:Success:1533154745731256531>';
const TEAM_COOLDOWN_MS = 5000;
const IMAGE_FETCH_TIMEOUT_MS = 8000;
const SHINY_EMOJI_URL = 'https://cdn.discordapp.com/emojis/1533666993637687466.png?size=32&quality=lossless';
const ROLE_EMOJI_URLS = {
  HP: 'https://cdn.discordapp.com/emojis/1534326743459037244.png?size=32&quality=lossless',
  ATK: 'https://cdn.discordapp.com/emojis/1534326742678769684.png?size=32&quality=lossless',
  SPD: 'https://cdn.discordapp.com/emojis/1534326741693104168.png?size=32&quality=lossless'
};

const imageBufferCache = new Map();
let shinyEmojiImagePromise = null;
const roleEmojiImagePromises = new Map();

function buildOwnedCardPool(userData) {
  const ownedCards = [];

  for (const entry of userData?.cardCopies || []) {
    const card = cards.find(c => c.name === entry.cardName);
    if (!card) continue;

    const copies = Number(entry.amount);
    if (!Number.isFinite(copies) || copies <= 0) continue;

    const mastery = Math.min(3, Math.max(1, Number(entry.mastery) || 1));
    const cardData = mastery === 3
      ? card.M3 || card.M2 || card
      : mastery === 2
        ? card.M2 || card
        : card;
    const rank = safeRank(cardData.rank || card.rank);
    const isShiny = entry.shiny ?? false;
    const baseHealth = resolveStat(rank, 'health', safeStat(cardData.health), card.name, mastery);
    const basePower = resolveStat(rank, 'power', safeStat(cardData.power), card.name, mastery);
    const baseSpeed = resolveStat(rank, 'speed', safeStat(cardData.speed), card.name, mastery);
    const boosted = computeBoosts(baseHealth, basePower, baseSpeed, copies, isShiny);

    ownedCards.push({
      card,
      copies,
      isShiny,
      mastery,
      health: boosted.health,
      // Auto-team selection and visual ordering use the same effective power
      // that the card displays elsewhere in the bot.
      power: boosted.power,
      speed: boosted.speed,
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
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, width, height, radius);
    return;
  }

  const r = Math.min(radius, width / 2, height / 2);
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

function drawSurface(ctx) {
  ctx.fillStyle = '#12131C';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // One-pixel grid, spaced at 20px, gives the surface a quiet developer UI
  // structure without stars, particles, or decorative light effects.
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.055)';
  ctx.lineWidth = 1;
  for (let x = 0.5; x <= CANVAS_WIDTH; x += 20) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, CANVAS_HEIGHT);
    ctx.stroke();
  }
  for (let y = 0.5; y <= CANVAS_HEIGHT; y += 20) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_WIDTH, y);
    ctx.stroke();
  }
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

  const imageUrl = getCardImageUrl(entry);
  if (!imageUrl) return null;

  // Keep normal and shiny versions in separate canvas caches.
  const cacheKey = `${imageUrl}|${entry.isShiny ? 'shiny' : 'normal'}`;
  try {
    if (imageBufferCache.has(cacheKey)) {
      const cached = imageBufferCache.get(cacheKey);
      return cached ? await loadImage(cached) : null;
    }

    // A shiny-owned card must use the generated holographic image, not the
    // original card URL. The generator has its own buffer cache as well.
    const buffer = entry.isShiny
      ? await generateShinyImage(imageUrl, entry.card.name)
      : await fetchImageBuffer(imageUrl);
    imageBufferCache.set(cacheKey, buffer);
    return await loadImage(buffer);
  } catch (error) {
    console.warn(`[Crew] Failed to load image for ${entry.card.name}: ${error.message}`);
    imageBufferCache.set(cacheKey, null);
    return null;
  }
}

// Prefer the image for the mastery the player owns, then fall back to the
// nearest available image. Empty image fields must never be sent to canvas.
function getCardImageUrl(entry) {
  const mastery = Math.min(3, Math.max(1, Number(entry.mastery) || 1));
  const masteryData = mastery === 3
    ? entry.card.M3 || entry.card.M2 || entry.card
    : mastery === 2
      ? entry.card.M2 || entry.card
      : entry.card;
  const masteryImage = masteryData?.image;
  if (typeof masteryImage === 'string' && masteryImage.trim()) return masteryImage;
  const baseImage = entry.card.image;
  return typeof baseImage === 'string' && baseImage.trim() ? baseImage : null;
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

async function loadRoleEmojiImage(role) {
  const url = ROLE_EMOJI_URLS[role];
  if (!url) return null;
  if (!roleEmojiImagePromises.has(role)) {
    roleEmojiImagePromises.set(
      role,
      fetchImageBuffer(url)
        .then(buffer => loadImage(buffer))
        .catch(error => {
          console.warn(`[Crew] Failed to load ${role} role emoji: ${error.message}`);
          return null;
        })
    );
  }
  return roleEmojiImagePromises.get(role);
}

// renderCardSlot now accepts an already-loaded sourceImage (or null for empty slots)
// so all network work can be done in parallel before any drawing starts.
function renderCardSlot(ctx, entry, sourceImage, shinyEmojiImage, roleEmojiImage, layout) {
  const { x, y, size, innerPadding, featured } = layout;
  const cardName = entry?.card?.name?.toUpperCase() || '';
  const innerX = x + innerPadding;
  const innerY = y + innerPadding;
  const innerSize = size - innerPadding * 2;
  const borderColor = featured ? '#FFD166' : '#4A5568';
  const borderWidth = featured ? 3 : 2;

  ctx.save();
  ctx.fillStyle = '#0D111A';
  roundedRectPath(ctx, x, y, size, size, 6);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.lineWidth = borderWidth;
  ctx.strokeStyle = borderColor;
  roundedRectPath(ctx, x + borderWidth / 2, y + borderWidth / 2, size - borderWidth, size - borderWidth, 6);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = '#0B0F17';
  roundedRectPath(ctx, innerX, innerY, innerSize, innerSize, 3);
  ctx.fill();
  ctx.restore();

  if (entry) {
    // Draw the art when it decoded successfully. The name, role, and rank
    // badges below are intentionally outside this check so one bad image
    // cannot make the whole team card appear empty.
    if (sourceImage) {
      const crop = getSmartCrop(sourceImage); // top-biased crop — shows face area
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(sourceImage, crop.x, crop.y, crop.size, crop.size, innerX, innerY, innerSize, innerSize);
    }

    // Attached full-width name bar inside the bottom edge.
    // Keep the label a few pixels lower so it sits comfortably in the bar.
    const nameBarHeight = 30;
    const nameBaselineY = innerY + innerSize - nameBarHeight / 2 + 3;
    ctx.save();
    ctx.fillStyle = '#1A202C';
    ctx.fillRect(innerX, innerY + innerSize - nameBarHeight, innerSize, nameBarHeight);
    const roleLabel = entry.role || '';
    const roleBadgeSize = 18;
    const roleGap = roleLabel ? 5 : 0;
    const textWidth = innerSize - 18 - (roleLabel ? roleBadgeSize + roleGap : 0);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `700 ${fitFontSize(ctx, cardName, textWidth, 14)}px "Trebuchet MS", sans-serif`;
    ctx.textBaseline = 'middle';
    const nameWidth = ctx.measureText(cardName).width;
    const contentWidth = (roleLabel ? roleBadgeSize + roleGap : 0) + nameWidth;
    const contentStart = innerX + (innerSize - contentWidth) / 2;
    if (roleLabel) {
      if (roleEmojiImage) {
        ctx.drawImage(
          roleEmojiImage,
          contentStart,
          nameBaselineY - roleBadgeSize / 2,
          roleBadgeSize,
          roleBadgeSize
        );
      } else {
        ctx.fillStyle = '#FFD166';
        ctx.font = '700 10px "Trebuchet MS", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(roleLabel, contentStart + roleBadgeSize / 2, nameBaselineY);
      }
    }
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `700 ${fitFontSize(ctx, cardName, textWidth, 14)}px "Trebuchet MS", sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(
      cardName,
      contentStart + (roleLabel ? roleBadgeSize + roleGap : 0),
      nameBaselineY
    );
    ctx.restore();

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

    // Flat game-UI badge: every card uses the same 19px inset from its
    // outer edge, regardless of the card's inner image padding.
    const badgeSize = 29;
    const badgeInset = 19;
    const rankColor = getRankColor(entry.rank);
    ctx.save();
    ctx.fillStyle = rankColor;
    ctx.fillRect(x + badgeInset, y + badgeInset, badgeSize, badgeSize);
    ctx.lineWidth = 1;
    ctx.strokeStyle = rankColor;
    ctx.strokeRect(x + badgeInset + 0.5, y + badgeInset + 0.5, badgeSize - 1, badgeSize - 1);
    ctx.fillStyle = '#12131C';
    ctx.font = '700 12px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(safeRank(entry.rank), x + badgeInset + badgeSize / 2, y + badgeInset + badgeSize / 2);
    ctx.restore();
  } else {
    ctx.save();
    ctx.fillStyle = '#151B26';
    roundedRectPath(ctx, innerX, innerY, innerSize, innerSize, 3);
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
  ctx.fillStyle = '#E2E8F0';
  ctx.font = '800 31px "Trebuchet MS", sans-serif';
  ctx.letterSpacing = '4px';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TOTAL POWER', CANVAS_WIDTH / 2, 42);
  ctx.restore();

  ctx.save();
  ctx.fillStyle = '#FFD166';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.font = '900 86px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeText(String(totalPower), CANVAS_WIDTH / 2, 114);
  ctx.fillText(String(totalPower), CANVAS_WIDTH / 2, 114);
  ctx.restore();

  // Layout keeps the featured center card about 10% larger than the sides.
  const layout = {
    left:   { x: 39,  y: 225, size: 215, innerPadding: 10, featured: false },
    middle: { x: 292, y: 190, size: 270, innerPadding: 12, featured: true },
    right:  { x: 599, y: 225, size: 215, innerPadding: 10, featured: false }
  };

  // Fetch all card images in parallel — one round-trip instead of three sequential ones.
  const [imgLeft, imgMiddle, imgRight, shinyEmojiImage, hpEmoji, atkEmoji, spdEmoji] = await Promise.all([
    loadCardImage(slots[0]),
    loadCardImage(slots[1]),
    loadCardImage(slots[2]),
    loadShinyEmojiImage(),
    loadRoleEmojiImage('HP'),
    loadRoleEmojiImage('ATK'),
    loadRoleEmojiImage('SPD')
  ]);

  const roleImages = { HP: hpEmoji, ATK: atkEmoji, SPD: spdEmoji };
  renderCardSlot(ctx, slots[0], imgLeft,   shinyEmojiImage, roleImages[slots[0]?.role], layout.left);
  renderCardSlot(ctx, slots[1], imgMiddle, shinyEmojiImage, roleImages[slots[1]?.role], layout.middle);
  renderCardSlot(ctx, slots[2], imgRight,  shinyEmojiImage, roleImages[slots[2]?.role], layout.right);

  return canvas.toBuffer('image/png');
}

async function saveAutoTeam(userData, ownedCards) {
  const topThree = ownedCards.slice(0, 3);
  userData.teamCards = topThree.map(entry => entry.card.name);
  await userData.save();
  return topThree;
}

async function buildTeamPayload(user, teamEntries) {
  const image = await renderTeamImage(assignRoles(teamEntries), user.username);

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