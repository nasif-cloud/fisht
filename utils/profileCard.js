// ─────────────────────────────────────────────
// PROFILE IMAGE RENDERER
// ─────────────────────────────────────────────
// This draws the profile card as one image so the layout stays the same in
// both prefix and slash command replies.

const { createCanvas, loadImage } = require('@napi-rs/canvas');

const PROFILE_WIDTH = 1000;
const PROFILE_HEIGHT = 420;
const PROFILE_FONT = 'DejaVu Sans';

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
  if (level >= 20) return '#f2c14e';
  if (level >= 15) return '#c084fc';
  if (level >= 10) return '#60a5fa';
  if (level >= 5) return '#4ade80';
  return '#aeb8cc';
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

  // Dark background with a simple accent border inspired by the card layout.
  ctx.fillStyle = '#08152f';
  ctx.fillRect(0, 0, PROFILE_WIDTH, PROFILE_HEIGHT);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  roundedRectPath(ctx, 5, 5, PROFILE_WIDTH - 10, PROFILE_HEIGHT - 10, 28);
  ctx.stroke();

  // Profile picture position: a large circular portrait on the left.
  const avatarCenterX = 150;
  const avatarCenterY = 190;
  const avatarRadius = 96;
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
    ctx.fillStyle = '#253454';
    ctx.fillRect(
      avatarCenterX - avatarRadius,
      avatarCenterY - avatarRadius,
      avatarRadius * 2,
      avatarRadius * 2
    );
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 64px "${PROFILE_FONT}"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((username || '?').slice(0, 1).toUpperCase(), avatarCenterX, avatarCenterY);
  }
  ctx.restore();

  ctx.strokeStyle = accent;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(avatarCenterX, avatarCenterY, avatarRadius + 5, 0, Math.PI * 2);
  ctx.stroke();

  const contentX = 300;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 42px "${PROFILE_FONT}"`;
  ctx.fillText(username || 'Unknown user', contentX, 100);

  ctx.fillStyle = accent;
  ctx.font = `700 34px "${PROFILE_FONT}"`;
  ctx.fillText(`LEVEL ${level}`, contentX, 154);

  ctx.fillStyle = '#b7c3d9';
  ctx.font = `400 25px "${PROFILE_FONT}"`;
  ctx.fillText(`Global rank  #${globalRank}`, contentX, 198);

  // XP bar: progress is based on the XP needed for the current level.
  const barX = contentX;
  const barY = 245;
  const barWidth = 635;
  const barHeight = 30;
  const progress = xpNeeded > 0 ? Math.min(1, currentXp / xpNeeded) : 0;
  ctx.fillStyle = '#1c2b4a';
  roundedRectPath(ctx, barX, barY, barWidth, barHeight, 15);
  ctx.fill();
  if (progress > 0) {
    ctx.fillStyle = accent;
    roundedRectPath(ctx, barX, barY, Math.max(barHeight, barWidth * progress), barHeight, 15);
    ctx.fill();
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = `700 24px "${PROFILE_FONT}"`;
  ctx.fillText(`${currentXp.toLocaleString('en-US')} / ${xpNeeded.toLocaleString('en-US')} XP`, barX, 315);

  ctx.fillStyle = '#b7c3d9';
  ctx.font = `400 23px "${PROFILE_FONT}"`;
  ctx.fillText(
    `${(xpNeeded - currentXp).toLocaleString('en-US')} XP to next level`,
    barX,
    355
  );

  return canvas.toBuffer('image/png');
}

module.exports = {
  renderProfileCard,
  getProfileColor
};