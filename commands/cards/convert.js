// ─────────────────────────────────────────────
// CONVERT COMMAND
// ─────────────────────────────────────────────
// This prefix-only command converts:
//   op convert D 10 Hanger  → D Clones into same-rank Hanger copies
//   op convert D all Hanger → all owned D Clones into Hanger copies
//   op convert 10            → Gems into Beli
//
// Clone conversions require the clone rank and card rank to match. Every
// database update checks the current balance first so a user cannot overspend
// clones or Gems if two commands run at the same time.

const mongoose = require('mongoose');
const User = require('../../models/user');
const { cards, safeRank, rankEmojis } = require('../../data/cards');
const { CLONE_RANKS, INVENTORY_ITEMS } = require('../../data/inventoryItems');

const GEM = INVENTORY_ITEMS.gem;
const BELI = INVENTORY_ITEMS.beli;

function reply(message, content) {
  return message.reply({
    content,
    allowedMentions: { repliedUser: false }
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
  // Use an update pipeline so an existing card entry is incremented, or a new
  // entry is appended, as part of the same atomic MongoDB update.
  const copies = { $ifNull: ['$cardCopies', []] };
  const cardNames = {
    $map: {
      input: copies,
      as: 'copy',
      in: '$$copy.cardName'
    }
  };

  const updatedCopies = {
    $let: {
      vars: { copies },
      in: {
        $cond: [
          { $in: [card.name, cardNames] },
          {
            $map: {
              input: '$$copies',
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
          },
          {
            $concatArrays: [
              '$$copies',
              [{
                _id: new mongoose.Types.ObjectId(),
                cardName: card.name,
                amount,
                mastery: 1,
                lastObtained: now,
                shiny: false
              }]
            ]
          }
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
  name: 'convert',

  async execute(message, args) {
    const userData = await User.findOne({ userId: message.author.id });
    if (!userData) {
      return reply(message, 'You do not have an account yet');
    }

    const firstArgument = String(args[0] || '').trim().toUpperCase();

    // A conversion with a number or `all` as its first argument converts Gems.
    if (!firstArgument || firstArgument === 'ALL' || isPositiveWholeNumber(firstArgument)) {
      const owned = Number(userData.gems) || 0;
      const amount = getGemAmount(args, owned);

      if (amount === null) {
        return reply(message, 'Please provide a positive whole number or `all`');
      }
      if (amount < 1 || owned < amount) {
        if (amount === 0) {
          return reply(message, `You do not have any ${GEM.emoji} Gems`);
        }
        return reply(message, `You do not have **${amount}** ${GEM.emoji} Gems`);
      }

      const beli = amount * 1000;
      const result = await User.collection.updateOne(
        { userId: message.author.id, gems: { $gte: amount } },
        { $inc: { gems: -amount, balance: beli } }
      );

      if (result.matchedCount !== 1) {
        return reply(message, 'Your Gem count changed, please try again');
      }

      return reply(
        message,
        `Converted **${GEM.emoji} ${amount}x Gems** to **${beli.toLocaleString('en-US')} ${BELI.emoji}**`
      );
    }

    const rank = firstArgument;
    if (!CLONE_RANKS.includes(rank)) {
      return reply(
        message,
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
      return reply(message, 'Please provide a positive whole number or `all`');
    }
    if (!cardQuery) {
      return reply(message, `Please provide a ${rank}-rank card to convert into`);
    }
    if (amount < 1 || owned < amount) {
      if (amount === 0) {
        return reply(message, `You do not have any ${rank} Clones`);
      }
      return reply(message, `You do not have **${amount}** ${rank} Clones`);
    }

    const card = getCard(cardQuery);
    if (!card) {
      return reply(message, `No card found matching **${cardQuery}**`);
    }

    const cardRank = safeRank(card.rank);
    if (cardRank !== rank) {
      return reply(
        message,
        `**${card.name}** is rank ${cardRank}, so it cannot receive ${rank} Clone conversions`
      );
    }

    const result = await User.collection.updateOne(
      { userId: message.author.id, [cloneField]: { $gte: amount } },
      cloneCardCopiesUpdate(card, amount, cloneField, new Date())
    );

    if (result.matchedCount !== 1) {
      return reply(message, `Your ${rank} Clone count changed, please try again`);
    }

    const cloneLabel = amount === 1 ? `${rank} Clone` : `${rank} Clones`;
    const copyLabel = amount === 1 ? 'copy' : 'copies';
    return reply(
      message,
      `Converted **${amount}x ${cloneLabel}** to **${amount} ${rankEmojis[rank] || ''} ${card.name} ${copyLabel}**`
    );
  }
};