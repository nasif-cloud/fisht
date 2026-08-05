// ─────────────────────────────────────────────
// TRIVIA COMMAND
// ─────────────────────────────────────────────
// A One Piece trivia mini-game. The bot shows a question and short answer
// buttons. True/false questions use two buttons; all others use four.
//
// Correct answer → green embed, 250 Berries
// Wrong answer   → red embed, 0 Berries
// Time runs out  → red embed, 0 Berries (counts as wrong)
//
// Cooldown: 20 minutes per player (rolling timer, not a global reset).
//
// Prefix: op trivia  |  Slash: /trivia

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const triviaPool = require('../../data/trivia');
const User       = require('../../models/user');
const {
  addXp,
  sendLevelUpNotifications,
  formatXpReward
} = require('../../utils/levels');
const { updateQuestProgress } = require('../../utils/quests');

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const COOLDOWN_MS  = 20 * 60 * 1000; // 20 minutes
const GAME_TIME_MS = 10_000;          // 10 seconds to press a button
const REWARD       = 250;             // Berries for a correct answer

// Embed colours
const COLOR_NEUTRAL  = 0xFFFFFF; // White — initial question
const COLOR_CORRECT  = 0x57F287; // Discord green — correct answer
const COLOR_WRONG    = 0xED4245; // Discord red — wrong answer / timeout

// Thumbnail shown on every embed
const THUMBNAIL_URL  = 'https://i.postimg.cc/8575kgsQ/b41d93df0c544bb40506153b8e7ce67a.jpg';

// ─────────────────────────────────────────────
// HELPER — format remaining cooldown as "Xm Ys"
// ─────────────────────────────────────────────
function formatCooldown(ms) {
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

// ─────────────────────────────────────────────
// HELPER — shuffle an array (Fisher-Yates)
// Returns a NEW array so the original is never mutated.
// ─────────────────────────────────────────────
function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ─────────────────────────────────────────────
// COMMAND EXPORT
// ─────────────────────────────────────────────
module.exports = {
  // Slash command definition (/trivia)
  data: new SlashCommandBuilder()
    .setName('trivia')
    .setDescription('Answer Trivia questions for rewards'),

  // Prefix command definition
  name: 'trivia',
  aliases: ['tr'],

  async execute(interactionOrMessage) {
    const user    = interactionOrMessage.user || interactionOrMessage.author;
    const isSlash = interactionOrMessage.isChatInputCommand?.();

    // ── STEP 1: COOLDOWN CHECK ──
    let userData = await User.findOne({ userId: user.id });
    if (!userData) {
      userData = new User({ userId: user.id });
    }

    if (userData?.lastTriviaClaim) {
      const elapsed   = Date.now() - userData.lastTriviaClaim.getTime();
      const remaining = COOLDOWN_MS - elapsed;

      if (remaining > 0) {
        const content = `You're on cooldown.\nAvailable in: \`${formatCooldown(remaining)}\``;
        if (isSlash) return interactionOrMessage.reply({ content, flags: 64 });
        return interactionOrMessage.channel.send(content);
      }
    }

    // ── STEP 2: SET COOLDOWN IMMEDIATELY ──
    // Stamp the cooldown before anything else so rapid re-runs can't slip through.
    if (userData) {
      userData.lastTriviaClaim = new Date();
      updateQuestProgress(userData, 'trivia_play', 1);
      await userData.save();
    }

    // ── STEP 3: PICK A RANDOM QUESTION ──
    const entry = triviaPool[Math.floor(Math.random() * triviaPool.length)];

    // Shuffle the options so the correct answer isn't always in the same slot.
    // We track the correct answer by its text, not its position.
    const shuffledOptions = shuffle(entry.options);
    const correctAnswer   = entry.answer; // e.g. "Aisa"

    // ── STEP 4: BUILD THE INITIAL EMBED ──
    const questionEmbed = new EmbedBuilder()
      .setTitle('Vegapunk\'s Trivia Challenge')
      .setDescription(entry.question)
      .setThumbnail(THUMBNAIL_URL)
      .setFooter({ text: `Answer correctly for ${REWARD} berries. You have 10 seconds.` })
      .setColor(COLOR_NEUTRAL);

    // ── STEP 5: BUILD THE GREY ANSWER BUTTONS ──
    // Each button's label is one of the shuffled answer options. A true/false
    // entry has two options, while the other entries have four.
    // The custom ID encodes the slot index (trivia_0 … trivia_3).
    const buttons = shuffledOptions.map((option, i) =>
      new ButtonBuilder()
        .setCustomId(`trivia_${i}`)
        .setLabel(option)
        .setStyle(ButtonStyle.Secondary) // Grey
    );

    // Discord allows up to 5 buttons per row, so both supported option counts
    // fit in a single row.
    const navRow = new ActionRowBuilder().addComponents(...buttons);

    // ── STEP 6: SEND THE MESSAGE ──
    const payload = { embeds: [questionEmbed], components: [navRow], fetchReply: true };
    let response;

    if (isSlash) {
      response = await interactionOrMessage.reply(payload);
    } else {
      response = await interactionOrMessage.channel.send(payload);
    }

    // ── STEP 7: WAIT FOR AN ANSWER ──
    let resolved = false;

    const collector = response.createMessageComponentCollector({ time: GAME_TIME_MS });

    collector.on('collect', async (interaction) => {
      // Only the command runner can press buttons
      if (interaction.user.id !== user.id) {
        return interaction.reply({ content: "This isn't yours", flags: 64 });
      }

      if (resolved) return;
      resolved = true;
      collector.stop('answered');

      // The label of the button they pressed is their answer
      const userAnswer = interaction.component.label;
      const isCorrect  = userAnswer === correctAnswer;
      let xpResult = null;

      // Acknowledge immediately to stay within Discord's 3-second window
      await interaction.deferUpdate();

      // Award Berries if correct
      if (isCorrect) {
        userData = await User.findOne({ userId: user.id }); // Re-fetch for fresh balance
        if (userData) {
          userData.balance += REWARD;
          updateQuestProgress(userData, 'trivia_correct', 1);
          xpResult = addXp(userData, 10);
          await userData.save();
        }
      }

      // Build the result embed
      const resultDesc = isCorrect
        ? `The answer was **${correctAnswer}**, you answered **${userAnswer}**.\n\n` +
          `<:whitearrow:1532531439445344547> You received **${REWARD}** <:money:1532532493578928178>\n` +
          formatXpReward(xpResult)
        : `The answer was **${correctAnswer}**, you answered **${userAnswer}**.\n\n` +
          `Better luck next time.`;

      const resultEmbed = new EmbedBuilder()
        .setTitle('Vegapunk\'s Trivia Challenge')
        .setDescription(resultDesc)
        .setThumbnail(THUMBNAIL_URL)
        .setColor(isCorrect ? COLOR_CORRECT : COLOR_WRONG);

      const resultMessage = await interaction.editReply({ embeds: [resultEmbed], components: [] });
      await sendLevelUpNotifications(
        user,
        userData,
        xpResult,
        interactionOrMessage.channel,
        resultMessage
      );
    });

    collector.on('end', async (collected, reason) => {
      // 'answered' means the player clicked a button — already handled above
      if (reason === 'answered') return;

      // Time ran out — treat as a wrong answer (no reward)
      const timeoutDesc =
        `The answer was **${correctAnswer}**, you answered nothing.\n\n` +
        `Better luck next time.`;

      const timeoutEmbed = new EmbedBuilder()
        .setTitle('Vegapunk\'s Trivia Challenge')
        .setDescription(timeoutDesc)
        .setThumbnail(THUMBNAIL_URL)
        .setFooter({ text: `expired` })
        .setColor(COLOR_WRONG);

      await response.edit({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
    });
  }
};
