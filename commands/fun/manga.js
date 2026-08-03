// ─────────────────────────────────────────────
// MANGA COMMAND
// ─────────────────────────────────────────────
// A mini-game: the bot shows a random One Piece manga panel and the player
// has 10 seconds to press Guess, then types the volume number in a popup form.
//
// Rewards based on how close the guess is:
//   Spot on (0 off)  → 300 Berries
//   1–5 volumes off  → 150 Berries
//   6–20 volumes off →  50 Berries
//   >20 volumes off  →   0 Berries (wrong)
//
// Cooldown: 20 minutes per player (rolling timer, not a global reset).
//
// Prefix: op manga  |  Aliases: mg
// Slash:  /manga

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { Vibrant } = require('node-vibrant/node');

const mangaPool = require('../../data/manga');
const User      = require('../../models/user');

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const COOLDOWN_MS  = 20 * 60 * 1000; // 20 minutes in milliseconds
const GAME_TIME_MS = 10000;           // 10 seconds to press the Guess button

// Beli rewards
const REWARD_EXACT = 300; // Spot on
const REWARD_CLOSE = 150; // 1–5 volumes off
const REWARD_FAR   = 50;  // 6–20 volumes off
const MASKED_COVER_FILENAME = 'manga-cover.png';

// Keep each cover's palette and generated images in memory. This avoids
// downloading and processing the same cover again during later rounds.
const coverAssetCache = new Map();

function rgbToNumber(rgb) {
  const [red, green, blue] = rgb;
  return (red << 16) | (green << 8) | blue;
}

function getMostPopularColor(palette) {
  const swatches = Object.values(palette).filter(Boolean);
  const mostPopular = swatches.reduce((current, swatch) => {
    if (!current || swatch._population > current._population) return swatch;
    return current;
  }, null);

  // A stable dark fallback keeps the embed valid if a palette cannot be read.
  return mostPopular ? rgbToNumber(mostPopular._rgb) : 0x2f3d5c;
}

async function loadCoverAssets(imageUrl) {
  if (coverAssetCache.has(imageUrl)) return coverAssetCache.get(imageUrl);

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Cover request failed with status ${response.status}`);
  }

  const sourceBuffer = Buffer.from(await response.arrayBuffer());
  const [sourceImage, palette] = await Promise.all([
    loadImage(sourceBuffer),
    Vibrant.from(sourceBuffer).getPalette()
  ]);
  const dominantColor = getMostPopularColor(palette);
  const canvas = createCanvas(sourceImage.width, sourceImage.height);
  const ctx = canvas.getContext('2d');

  // Render a clean PNG for the answer and timeout states.
  ctx.drawImage(sourceImage, 0, 0, sourceImage.width, sourceImage.height);
  const cleanCover = canvas.toBuffer('image/png');

  // The volume number is printed in the lower-right corner. Use percentages
  // so the mask works for the different cover resolutions in the gallery.
  const maskX = Math.floor(sourceImage.width * 0.58);
  const maskY = Math.floor(sourceImage.height * 0.76);
  const maskWidth = Math.ceil(sourceImage.width * 0.42);
  const maskHeight = Math.ceil(sourceImage.height * 0.24);

  ctx.save();
  ctx.fillStyle = `#${dominantColor.toString(16).padStart(6, '0')}`;
  ctx.fillRect(maskX, maskY, maskWidth, maskHeight);
  ctx.restore();

  const maskedCover = canvas.toBuffer('image/png');
  const assets = { cleanCover, maskedCover, dominantColor };
  coverAssetCache.set(imageUrl, assets);
  return assets;
}

function buildCoverAttachment(buffer) {
  return { attachment: buffer, name: MASKED_COVER_FILENAME };
}

// ─────────────────────────────────────────────
// HELPER — format remaining cooldown as "Xm Ys"
// ─────────────────────────────────────────────
function formatCooldown(ms) {
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

// ─────────────────────────────────────────────
// COMMAND EXPORT
// ─────────────────────────────────────────────
module.exports = {
  // Slash command definition (/manga)
  data: new SlashCommandBuilder()
    .setName('manga')
    .setDescription('Guess the One Piece volume from the manga cover'),

  // Prefix command definition
  name: 'manga',
  aliases: ['m'],

  async execute(interactionOrMessage) {
    const user    = interactionOrMessage.user || interactionOrMessage.author;
    const isSlash = interactionOrMessage.isChatInputCommand?.();

    // ── STEP 1: COOLDOWN CHECK ──
    // Load the player's save data to check when they last played
    let userData = await User.findOne({ userId: user.id });

    if (userData?.lastMangaClaim) {
      const elapsed   = Date.now() - userData.lastMangaClaim.getTime();
      const remaining = COOLDOWN_MS - elapsed;

      if (remaining > 0) {
        // Still on cooldown — tell them how long is left
        const content = `Your're on cooldown.\nAvailable in: \`${formatCooldown(remaining)}\``;

        if (isSlash) return interactionOrMessage.reply({ content, flags: 64 });
        return interactionOrMessage.channel.send(content);
      }
    }

    // ── STEP 2: SET COOLDOWN IMMEDIATELY ──
    // Record the claim time right away so spamming the command before the
    // first save completes can't bypass the cooldown.
    if (userData) {
      userData.lastMangaClaim = new Date();
      await userData.save();
    }

    // ── STEP 3: PICK A RANDOM MANGA ENTRY ──
    const entry = mangaPool[Math.floor(Math.random() * mangaPool.length)];

    // ── STEP 3b: PREPARE THE COVER ──
    // Node Vibrant finds the most common palette colour. The active challenge
    // uses the clean solid mask, while result states use the clean cover.
    const coverAssets = await loadCoverAssets(entry.image);
    const embedColor = coverAssets.dominantColor;
    const maskedCoverAttachment = buildCoverAttachment(coverAssets.maskedCover);
    const cleanCoverAttachment = buildCoverAttachment(coverAssets.cleanCover);

    // ── STEP 4: BUILD THE INITIAL EMBED ──
    const activeEmbed = new EmbedBuilder()
      .setTitle('Manga Challenge')
      .setDescription(
        "Guess the volume number. Press **Guess** when you're ready. " +
        'Be quick, you only have `10 seconds`.'
      )
      .setImage(`attachment://${MASKED_COVER_FILENAME}`)
      .setColor(embedColor);

    // Blue "Guess" button — clicking this opens the number input form
    const guessBtn = new ButtonBuilder()
      .setCustomId('manga_guess')
      .setLabel('Guess')
      .setStyle(ButtonStyle.Primary); // Blue

    const navRow = new ActionRowBuilder().addComponents(guessBtn);

    // ── STEP 5: SEND THE MESSAGE ──
    // fetchReply: true lets us get back the message object to attach a collector
    const payload = {
      embeds: [activeEmbed],
      components: [navRow],
      files: [maskedCoverAttachment],
      fetchReply: true
    };
    let response;

    if (isSlash) {
      response = await interactionOrMessage.reply(payload);
    } else {
      response = await interactionOrMessage.channel.send(payload);
    }

    // ── STEP 6: SET UP THE BUTTON COLLECTOR (10 second window) ──
    // The player must press Guess within 10 seconds or the game expires.
    let resolved = false; // Tracks whether the game was already settled (clicked or wrong)

    const collector = response.createMessageComponentCollector({ time: GAME_TIME_MS });

    collector.on('collect', async (interaction) => {
      // Only the command runner can press the button
      if (interaction.user.id !== user.id) {
        return interaction.reply({ content: "This isn't yours.", flags: 64 });
      }

      // Guard against duplicate presses (shouldn't normally happen, but safe)
      if (resolved) return;
      resolved = true;
      collector.stop('guessed'); // Stop listening for more button clicks

      // ── SHOW THE MODAL (number input popup) ──
      const modal = new ModalBuilder()
        .setCustomId('manga_modal')
        .setTitle('Volume Guess')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('manga_answer')
              .setLabel('What volume is this?')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g. 42')
              .setRequired(true)
          )
        );

      await interaction.showModal(modal);

      // Wait for the player to submit the modal form
      try {
        const submit = await interaction.awaitModalSubmit({
          time:   10000,
          filter: i => i.customId === 'manga_modal' && i.user.id === user.id
        });

        // ── CRITICAL: acknowledge the modal submit immediately ──
        // Discord gives us only 3 seconds to respond before the interaction
        // expires. deferUpdate() buys us up to 15 minutes to do slow work
        // (like DB queries) without the embed silently not updating.
        await submit.deferUpdate();

        const rawAnswer  = submit.fields.getTextInputValue('manga_answer').trim();
        const userAnswer = parseInt(rawAnswer, 10);

        // If they typed something that isn't a number, count it as wrong
        if (isNaN(userAnswer)) {
          const wrongEmbed = new EmbedBuilder()
            .setTitle(`The answer was **${entry.answer}**, you answered **${rawAnswer}**.`)
            .setDescription('Better luck next time.')
            .setImage(`attachment://${MASKED_COVER_FILENAME}`)
            .setColor(embedColor);
          return submit.editReply({
            embeds: [wrongEmbed],
            components: [],
            files: [cleanCoverAttachment]
          });
        }

        // Calculate how far off the guess was
        const diff = Math.abs(userAnswer - entry.answer);

        // Decide the reward tier
        let reward = 0;
        let resultDesc;

        if (diff === 0) {
          // Spot on!
          reward     = REWARD_EXACT;
          resultDesc =
            `<:whitearrow:1532531439445344547> You received **${reward}** <:money:1532532493578928178>`;
        } else if (diff <= 5) {
          // 1–5 volumes off
          reward     = REWARD_CLOSE;
          resultDesc =
            `<:whitearrow:1532531439445344547> You received **${reward}** <:money:1532532493578928178>`;
        } else if (diff <= 20) {
          // 6–20 volumes off
          reward     = REWARD_FAR;
          resultDesc =
            `<:whitearrow:1532531439445344547> You received **${reward}** <:money:1532532493578928178>`;
        } else {
          // More than 20 off — no reward
          resultDesc = 'Better luck next time.';
        }

        // Add the Berries reward to the player's balance if they earned any.
        // These DB operations happen AFTER deferUpdate, so the 3-second
        // deadline is no longer a concern.
        if (reward > 0 && userData) {
          userData = await User.findOne({ userId: user.id }); // Re-fetch for fresh balance
          if (userData) {
            userData.balance += reward;
            await userData.save();
          }
        }

        // Show the result embed — editReply is used because we already deferred
        const resultEmbed = new EmbedBuilder()
          .setTitle(`The answer was **${entry.answer}**, you answered **${userAnswer}**.`)
          .setDescription(resultDesc)
          .setImage(`attachment://${MASKED_COVER_FILENAME}`)
          .setColor(embedColor);

        await submit.editReply({
          embeds: [resultEmbed],
          components: [],
          files: [cleanCoverAttachment]
        });

      } catch {
        // awaitModalSubmit timed out — user dismissed the modal or ran out of time.
        // Show the same result format as a wrong answer (no reward).
        const timedEmbed = new EmbedBuilder()
          .setTitle(`The answer was **${entry.answer}**, you answered nothing.`)
          .setDescription('Better luck next time.')
          .setImage(`attachment://${MASKED_COVER_FILENAME}`)
          .setFooter({ text: `expired` })
          .setColor(embedColor);
        await response.edit({
          embeds: [timedEmbed],
          components: [],
          files: [cleanCoverAttachment]
        }).catch(() => {});
      }
    });

    collector.on('end', async (collected, reason) => {
      // 'guessed' means the player clicked the button — already handled above
      if (reason === 'guessed') return;

      // Any other reason (usually 'time') means the 10 seconds ran out without
      // the player pressing Guess — treat as a wrong answer (same format, no reward).
      const timedEmbed = new EmbedBuilder()
        .setTitle(`The answer was **${entry.answer}**, you answered nothing.`)
        .setDescription('Better luck next time.')
        .setImage(`attachment://${MASKED_COVER_FILENAME}`)
        .setFooter({ text: `expired` })
        .setColor(embedColor);
      await response.edit({
        embeds: [timedEmbed],
        components: [],
        files: [cleanCoverAttachment]
      }).catch(() => {});
    });
  }
};
