// ─────────────────────────────────────────────
// CONVERT COMMAND
// ─────────────────────────────────────────────
// This command supports both prefix and slash usage:
//   op convert D 10 Hanger  → D Clones into same-rank Hanger copies
//   op convert D all Hanger → all owned D Clones into Hanger copies
//   op convert 10            → Gems into Beli
//   /convert source:clones rank:D amount:10 card:Hanger
//   /convert source:gems amount:10
//
// Clone conversions require the clone rank and card rank to match. Every
// database update checks the current balance first so a user cannot overspend
// clones or Gems if two commands run at the same time.

const { SlashCommandBuilder } = require('discord.js');
const User = require('../../models/user');
const { cards, safeRank, rankEmojis } = require('../../data/cards');
const { CLONE_RANKS, INVENTORY_ITEMS } = require('../../data/inventoryItems');

const GEM = INVENTORY_ITEMS.gem;
const BELI = INVENTORY_ITEMS.beli;

function isSlash(interactionOrMessage) {
  return interactionOrMessage.isChatInputCommand?.();
}

function reply(interactionOrMessage, content) {
  return interactionOrMessage.reply({
    content,
    allowedMentions: { repliedUser: false },
    ...(isSlash(interactionOrMessage) ? { flags: 64 } : {})
  });
}

function isPositiveWholeNumber(value) {
  return /^[1-9]\d*$/.test(String(value));
}

function getCard(cardQuery) {
  const search = String(cardQuery || '').trim().toLowerCase();
  if (!search) return null;

  // Prefer exact names and aliases before partial matching.
  return (
    cards.find(card =>
      card.name.toLowerCase() === search ||
      (card.aliases || []).some(alias => alias && alias.toLowerCase() === search)
    ) ||
    cards.find(card =>
      card.name.toLowerCase().includes(search) ||
      (card.aliases || []).some(alias => alias && alias.toLowerCase().includes(search))
    ) ||
    null
  );
}

function getCloneAmount(args, owned) {
  const amountToken = args[1]?.toLowerCase();

  if (amountToken === 'all') {
    return owned;
  }

  // If the next token is not a number or `all`, it is the beginning of the
  // card name and the amount defaults to one Clone.
  if (amountToken === undefined || !/^-?\d+$/.test(amountToken)) {
    return 1;
  }

  return isPositiveWholeNumber(amountToken) ? Number(amountToken) : null;
}

function getGemAmount(args, owned) {
  const amountToken = args[0]?.toLowerCase() || '1';
  if (amountToken === 'all') return owned;
  return isPositiveWholeNumber(amountToken) ? Number(amountToken) : null;
}

function cloneCardCopiesUpdate(card, amount, cloneField, now) {
  // Use an update pipeline to increment the already-owned card entry as part
  // of the same atomic MongoDB update that spends the Clones.
  const copies = { $ifNull: ['$cardCopies', []] };
  const updatedCopies = {
    $map: {
      input: copies,
      as: 'copy',
      in: {
        $cond: [
          { $eq: ['$$copy.cardName', card.name] },
          {
            $mergeObjects: [
              '$$copy',
              {
                amount: {
                  $add: [{ $ifNull: ['$$copy.amount', 0] }, amount]
                },
                lastObtained: now
              }
            ]
          },
          '$$copy'
        ]
      }
    }
  };

  return [
    {
      $set: {
        [cloneField]: {
          $subtract: [{ $ifNull: [`$${cloneField}`, 0] }, amount]
        },
        cardCopies: updatedCopies
      }
    }
  ];
}

module.exports = {
  // Slash usage:
  // /convert source:gems amount:10
  // /convert source:clones rank:D amount:10 card:Hanger
  data: new SlashCommandBuilder()
    .setName('convert')
    .setDescription('Convert Gems to Beli or Clones to card copies')
    .addStringOption(option =>
      option
        .setName('source')
        .setDescription('What you want to convert')
        .setRequired(true)
        .addChoices(
          { name: 'Gems to Beli', value: 'gems' },
          { name: 'Clones to card copies', value: 'clones' }
        )
    )
    .addStringOption(option =>
      option
        .setName('rank')
        .setDescription('Clone rank, required when converting Clones')
        .setRequired(false)
        .addChoices(...CLONE_RANKS.map(rank => ({ name: rank, value: rank })))
    )
    .addStringOption(option =>
      option
        .setName('amount')
        .setDescription('How many to convert, or all')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('card')
        .setDescription('Card name or alias, required when converting Clones')
        .setRequired(false)
    ),

  name: 'convert',

  async execute(interactionOrMessage, args = []) {
    const slash = isSlash(interactionOrMessage);
    const user = slash ? interactionOrMessage.user : interactionOrMessage.author;

    // Slash options are converted into the same small argument format used by
    // the prefix command, so both command versions share all validation and
    // reward logic below.
    if (slash) {
      const source = interactionOrMessage.options.getString('source');
      const amount = interactionOrMessage.options.getString('amount');

      if (source === 'gems') {
        args = [amount || '1'];
      } else {
        args = [
          interactionOrMessage.options.getString('rank') || '',
          amount || '1',
          interactionOrMessage.options.getString('card') || ''
        ];
      }
    }

    const userData = await User.findOne({ userId: user.id });
    if (!userData) {
      return reply(interactionOrMessage, 'You do not have an account yet');
    }

    const firstArgument = String(args[0] || '').trim().toUpperCase();

    // A conversion with a number or `all` as its first argument converts Gems.
    if (!firstArgument || firstArgument === 'ALL' || isPositiveWholeNumber(firstArgument)) {
      const owned = Number(userData.gems) || 0;
      const amount = getGemAmount(args, owned);

      if (amount === null) {
        return reply(interactionOrMessage, 'Please provide a positive whole number or `all`');
      }
      if (amount < 1 || owned < amount) {
        if (amount === 0) {
          return reply(interactionOrMessage, `You do not have any ${GEM.emoji} Gems`);
        }
        return reply(interactionOrMessage, `You do not have **${amount}** ${GEM.emoji} Gems`);
      }

      const beli = amount * 1000;
      const result = await User.collection.updateOne(
        { userId: user.id, gems: { $gte: amount } },
        { $inc: { gems: -amount, balance: beli } }
      );

      if (result.matchedCount !== 1) {
        return reply(interactionOrMessage, 'Your Gem count changed, please try again');
      }

      return reply(
        interactionOrMessage,
        `Converted **${GEM.emoji} ${amount}x Gems** to **${beli.toLocaleString('en-US')} ${BELI.emoji}**`
      );
    }

    const rank = firstArgument;
    if (!CLONE_RANKS.includes(rank)) {
      return reply(
        interactionOrMessage,
        'Use `op convert [rank] [amount|all] [card]` for Clones or `op convert [amount|all]` for Gems'
      );
    }

    const cloneField = `clone${rank}`;
    const owned = Number(userData[cloneField]) || 0;
    const amount = getCloneAmount(args, owned);
    const amountWasSpecified = args[1] !== undefined &&
      (args[1].toLowerCase() === 'all' || /^-?\d+$/.test(args[1]));
    const cardStartIndex = amountWasSpecified
      ? 2
      : 1;
    const cardQuery = args.slice(cardStartIndex).join(' ').trim();

    if (amount === null) {
      return reply(interactionOrMessage, 'Please provide a positive whole number or `all`');
    }
    if (!cardQuery) {
      return reply(interactionOrMessage, `Please provide a ${rank}-rank card to convert into`);
    }
    if (amount < 1 || owned < amount) {
      if (amount === 0) {
        return reply(interactionOrMessage, `You do not have any ${rank} Clones`);
      }
      return reply(interactionOrMessage, `You do not have **${amount}** ${rank} Clones`);
    }

    const card = getCard(cardQuery);
    if (!card) {
      return reply(interactionOrMessage, `No card found matching **${cardQuery}**`);
    }

    const cardRank = safeRank(card.rank);
    if (cardRank !== rank) {
      return reply(
        interactionOrMessage,
        `**${card.name}** is rank ${cardRank}, so it cannot receive ${rank} Clone conversions`
      );
    }

    const ownedCard = userData.cardCopies?.some(copy =>
      copy.cardName === card.name && Number(copy.amount) > 0
    );
    if (!ownedCard) {
      return reply(interactionOrMessage, `You do not own **${card.name}** yet`);
    }

    const result = await User.collection.updateOne(
      {
        userId: user.id,
        [cloneField]: { $gte: amount },
        cardCopies: {
          $elemMatch: {
            cardName: card.name,
            amount: { $gt: 0 }
          }
        }
      },
      cloneCardCopiesUpdate(card, amount, cloneField, new Date())
    );

    if (result.matchedCount !== 1) {
      return reply(interactionOrMessage, `Your ${rank} Clone count changed, please try again`);
    }

    const cloneLabel = amount === 1 ? `${rank} Clone` : `${rank} Clones`;
    const copyLabel = amount === 1 ? 'copy' : 'copies';
    return reply(
      interactionOrMessage,
      `Converted **${amount}x ${cloneLabel}** to **${amount}x ${rankEmojis[rank] || ''} ${card.name}** ${copyLabel}`
    );
  }
};