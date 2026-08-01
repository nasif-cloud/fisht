const { SlashCommandBuilder } = require('discord.js');
const { createCanvas, loadImage, Image, ImageData } = require('@napi-rs/canvas');
require('@tensorflow/tfjs');
const faceapi = require('face-api.js');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const { cards, rankConfig, resolveStat, safeRank, safeStat } = require('../../data/cards');
const User = require('../../models/user');

const CANVAS_WIDTH = 860;
const CANVAS_HEIGHT = 500;
const SUCCESS_REACTION = '✅';
const FACE_MODEL_DIR = path.join(__dirname, '..', '..', '.cache', 'face-models');
const FACE_MODEL_BASE_URL = 'https://justadudewhohacks.github.io/face-api.js/models';

const CanvasClass = createCanvas(1, 1).constructor;
faceapi.env.monkeyPatch({ Canvas: CanvasClass, Image, ImageData });

let faceModelsReady = false;

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
  const slots = [null, null, null];
  for (let index = 0; index < Math.min(3, teamEntries.length); index++) {
    slots[index] = teamEntries[index];
  }
  return slots;
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

function truncateText(ctx, text, maxWidth, font) {
  ctx.font = font;
  if (ctx.measureText(text).width <= maxWidth) return text;

  let output = text;
  while (output.length > 0 && ctx.measureText(`${output}...`).width > maxWidth) {
    output = output.slice(0, -1);
  }

  return output ? `${output}...` : '...';
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

async function ensureFaceModels() {
  if (faceModelsReady) return;

  await fsp.mkdir(FACE_MODEL_DIR, { recursive: true });

  const manifestFile = 'tiny_face_detector_model-weights_manifest.json';
  const manifestPath = path.join(FACE_MODEL_DIR, manifestFile);

  if (!fs.existsSync(manifestPath)) {
    const manifestResponse = await fetch(`${FACE_MODEL_BASE_URL}/${manifestFile}`);
    if (!manifestResponse.ok) {
      throw new Error(`Failed to download face model manifest: ${manifestResponse.status}`);
    }

    await fsp.writeFile(manifestPath, Buffer.from(await manifestResponse.arrayBuffer()));
  }

  const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
  const shardFiles = new Set();

  for (const group of manifest.weightsManifest || []) {
    for (const fileName of group.paths || []) {
      shardFiles.add(fileName);
    }
  }

  await Promise.all([...shardFiles].map(async fileName => {
    const shardPath = path.join(FACE_MODEL_DIR, fileName);
    if (fs.existsSync(shardPath)) return;

    const shardResponse = await fetch(`${FACE_MODEL_BASE_URL}/${fileName}`);
    if (!shardResponse.ok) {
      throw new Error(`Failed to download face model shard: ${shardResponse.status}`);
    }

    await fsp.writeFile(shardPath, Buffer.from(await shardResponse.arrayBuffer()));
  }));

  await faceapi.nets.tinyFaceDetector.loadFromDisk(FACE_MODEL_DIR);
  faceModelsReady = true;
}

async function fetchImageBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function detectFaceCrop(sourceImage) {
  try {
    await ensureFaceModels();
  } catch (error) {
    console.warn('[Crew] Face model load failed, using center crop.', error.message);
    return null;
  }

  try {
    const detection = await faceapi.detectSingleFace(
      sourceImage,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 })
    );

    if (!detection?.box) return null;

    const { x, y, width, height } = detection.box;
    const imageWidth = sourceImage.width;
    const imageHeight = sourceImage.height;
    const faceCenterX = x + width / 2;
    const faceCenterY = y + height / 2;
    const cropSize = Math.min(
      Math.max(width, height) * 2.4,
      imageWidth,
      imageHeight
    );

    let cropX = faceCenterX - cropSize / 2;
    let cropY = faceCenterY - cropSize / 2;

    cropX = Math.max(0, Math.min(cropX, imageWidth - cropSize));
    cropY = Math.max(0, Math.min(cropY, imageHeight - cropSize));

    return { x: cropX, y: cropY, size: cropSize };
  } catch (error) {
    console.warn('[Crew] Face detection failed, using center crop.', error.message);
    return null;
  }
}

async function renderCardSlot(ctx, entry, layout) {
  const { x, y, size, labelWidth, radius, innerPadding } = layout;
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

  if (entry) {
    const sourceImage = await loadImage(await fetchImageBuffer(entry.card.image));
    const crop = await detectFaceCrop(sourceImage);
    const innerX = x + innerPadding;
    const innerY = y + innerPadding;
    const innerSize = size - innerPadding * 2;

    ctx.save();
    roundedRectPath(ctx, innerX, innerY, innerSize, innerSize, Math.max(10, radius - 12));
    ctx.clip();

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (crop) {
      ctx.drawImage(sourceImage, crop.x, crop.y, crop.size, crop.size, innerX, innerY, innerSize, innerSize);
    } else {
      const sourceSize = Math.min(sourceImage.width, sourceImage.height);
      const sourceX = (sourceImage.width - sourceSize) / 2;
      const sourceY = (sourceImage.height - sourceSize) / 2;
      ctx.drawImage(sourceImage, sourceX, sourceY, sourceSize, sourceSize, innerX, innerY, innerSize, innerSize);
    }

    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.52)';
    roundedRectPath(ctx, innerX, innerY + innerSize - 34, innerSize, 34, 10);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(truncateText(ctx, cardName, labelWidth, '700 15px sans-serif'), innerX + innerSize / 2, innerY + innerSize - 17);
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

  const layout = {
    left:   { x: 72,  y: 173, size: 166, labelWidth: 170, radius: 30, innerPadding: 12 },
    middle: { x: 303, y: 135, size: 220, labelWidth: 224, radius: 36, innerPadding: 13 },
    right:  { x: 606, y: 173, size: 166, labelWidth: 170, radius: 30, innerPadding: 12 }
  };

  await renderCardSlot(ctx, slots[0], layout.left);
  await renderCardSlot(ctx, slots[1], layout.middle);
  await renderCardSlot(ctx, slots[2], layout.right);

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
    .setName('crew')
    .setDescription('Show your 3 card crew'),

  name: 'crew',
  aliases: ['crew', 'autocrew', 'auto'],

  async execute(interactionOrMessage) {
    const user = interactionOrMessage.user || interactionOrMessage.author;
    const isSlash = interactionOrMessage.isChatInputCommand?.();
    const prefixCommandName = isSlash ? 'crew' : getPrefixCommandName(interactionOrMessage);
    const autoMode = !isSlash && (prefixCommandName === 'autocrew' || prefixCommandName === 'auto');

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

    const teamEntries = resolveDisplayTeam(userData, ownedCards);
    const payload = await buildTeamPayload(user, teamEntries);

    if (isSlash) {
      return interactionOrMessage.reply(payload);
    }
    return interactionOrMessage.channel.send({ ...payload, allowedMentions: { repliedUser: false } });
  }
};