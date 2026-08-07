// ─────────────────────────────────────────────
// RAID BOSS DATA
// ─────────────────────────────────────────────
// Each entry describes one raid a player can spend keys on. The raid is built
// from the card the raid is based on (Card + CardMastery). The boss image/icon
// and rewards are stored here for the future raid battle implementation —
// right now only the key shop uses this data.
//
// Fields:
//   id          — short stable identifier used in button custom ids
//   title       — the raid boss title shown at the top of the shop page
//   image       — full (transparent) artwork used in the media gallery
//   icon        — small thumbnail, kept here for the future boss battle
//   cardName    — which card this raid is based on (must exist in data/cards.js)
//   mastery     — which mastery tier of that card the raid uses (1/2/3)
//   rewards     — fragments + chests the boss will drop (used later)
module.exports = [
  {
    id: 'luffy_m3',
    title: 'Monkey D. Luffy - Beating Drum of Liberation',
    image: 'https://2shankz.github.io/optc-db.github.io/api/images/full/transparent/3/900/3957.png',
    icon: 'https://2shankz.github.io/optc-db.github.io/api/images/thumbnail/glo/3/900/3957.png',
    cardName: 'Monkey D. Luffy',
    mastery: 3,
    rewards: { fragments: 30, chests: 3 }
  },
  {
    id: 'zoro_m3',
    title: 'Zorojuro - Fearsome Ronin',
    image: 'https://2shankz.github.io/optc-db.github.io/api/images/full/transparent/3/200/3225.png',
    icon: 'https://2shankz.github.io/optc-db.github.io/api/images/thumbnail/glo/3/200/3225.png',
    cardName: 'Roronoa Zoro',
    mastery: 3,
    rewards: { fragments: 25, chests: 3 }
  }
];
