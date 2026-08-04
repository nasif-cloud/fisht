// ─────────────────────────────────────────────
// PROFILE IMAGE RENDERER
// ─────────────────────────────────────────────
// This draws the profile card as one image so the layout stays the same in
// both prefix and slash command replies.

const path = require('node:path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const PROFILE_WIDTH = 1024;
const PROFILE_HEIGHT = 360;
const PROFILE_FONT = 'Luckiest Guy';
const PROFILE_FONT_PATH = path.join(
  __dirname,
  '..',
  'attached_assets',
  'LuckiestGuy-Regular.ttf'
);

// Register the rounded display font used by the supplied profile reference.
// Registration is safe to repeat when the command module is reloaded.
GlobalFonts.registerFromPath(PROFILE_FONT_PATH, PROFILE_FONT);

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

function getProfileColor(level) {
  return '#ffffff';
}

async function fetchAvatar(avatarUrl) {
  if (!avatarUrl) return null;

  try {
    const response = await fetch(avatarUrl);
    if (!response.ok) return null;
    return loadImage(Buffer.from(await response.arrayBuffer()));
  } catch {
    return null;
  }
}

async function renderProfileCard({
  avatarUrl,
  username,
  level,
  currentXp,
  xpNeeded,
  globalRank
}) {
  const canvas = createCanvas(PROFILE_WIDTH, PROFILE_HEIGHT);
  const ctx = canvas.getContext('2d');
  const accent = getProfileColor(level);
  const avatar = await fetchAvatar(avatarUrl);

  // The reference is a clean, borderless black profile card.
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, PROFILE_WIDTH, PROFILE_HEIGHT);

  // The avatar sits in the visual center, with the thin white circular
  // outline shown in the reference image.
  const avatarCenterX = 512;
  const avatarCenterY = 126;
  const avatarRadius = 62;
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarCenterX, avatarCenterY, avatarRadius, 0, Math.PI * 2);
  ctx.clip();
  if (avatar) {
    ctx.drawImage(
      avatar,
      avatarCenterX - avatarRadius,
      avatarCenterY - avatarRadius,
      avatarRadius * 2,
      avatarRadius * 2
    );
  } else {
    ctx.fillStyle = '#262626';
    ctx.fillRect(
      avatarCenterX - avatarRadius,
      avatarCenterY - avatarRadius,
      avatarRadius * 2,
      avatarRadius * 2
    );
    ctx.fillStyle = '#ffffff';
    ctx.font = `400 54px "${PROFILE_FONT}"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((username || '?').slice(0, 1).toUpperCase(), avatarCenterX, avatarCenterY);
  }
  ctx.restore();

  ctx.strokeStyle = '#f0f0f0';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(avatarCenterX, avatarCenterY, avatarRadius + 3, 0, Math.PI * 2);
  ctx.stroke();

  // Rank and level are placed above the avatar, matching the reference.
  ctx.fillStyle = '#ffffff';
  ctx.font = `400 31px "${PROFILE_FONT}"`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(`RANK #${globalRank}`, 110, 68);

  ctx.textAlign = 'right';
  ctx.fillText(`LEVEL ${level}`, 910, 68);

  // The username sits under the avatar on the left.
  ctx.textAlign = 'left';
  ctx.font = `400 43px "${PROFILE_FONT}"`;
  ctx.fillText(username || 'Unknown user', 110, 244);

  // Keep the XP text above the right end of the bar, as in the reference.
  const xpText = `${formatCompactNumber(currentXp)} / ${formatCompactNumber(xpNeeded)} XP`;
  const xpRemaining = Math.max(0, xpNeeded - currentXp);
  ctx.textAlign = 'right';
  ctx.font = `400 25px "${PROFILE_FONT}"`;
  ctx.fillText(xpText, 885, 244);
  ctx.font = `400 14px "${PROFILE_FONT}"`;
  ctx.fillText(`${formatCompactNumber(xpRemaining)} XP TO NEXT LEVEL`, 885, 260);

  // XP bar: a light progress fill over a dark rounded track.
  const barX = 113;
  const barY = 275;
  const barWidth = 773;
  const barHeight = 25;
  const progress = xpNeeded > 0 ? Math.min(1, currentXp / xpNeeded) : 0;
  ctx.fillStyle = '#202020';
  roundedRectPath(ctx, barX, barY, barWidth, barHeight, 13);
  ctx.fill();
  if (progress > 0) {
    ctx.fillStyle = '#eeeeee';
    roundedRectPath(ctx, barX, barY, Math.max(barHeight, barWidth * progress), barHeight, 15);
    ctx.fill();
  }

  return canvas.toBuffer('image/png');
}

function formatCompactNumber(value) {
  const number = Math.max(0, Number(value) || 0);
  if (number >= 1000) {
    return `${(number / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  }
  return number.toLocaleString('en-US');
}

module.exports = {
  renderProfileCard,
  getProfileColor
};