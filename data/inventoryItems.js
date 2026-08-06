// ─────────────────────────────────────────────
// INVENTORY ITEM DEFINITIONS
// ─────────────────────────────────────────────
// Keeping item metadata in one place makes the inventory display, item-use
// commands, and owner grant commands agree on names, emojis, and DB fields.

const INVENTORY_ITEMS = {
  beli: {
    id: 'beli',
    field: 'balance',
    name: 'Beli',
    aliases: ['berries', 'berry', 'balance'],
    emoji: '<:SilverCoin:1534757841867374782>'
  },
  meat: {
    id: 'meat',
    field: 'meat',
    name: 'Meat',
    aliases: ['ham'],
    emoji: '<:Ham:1534995152605548585>'
  },
  wine: {
    id: 'wine',
    field: 'wine',
    name: 'Wine',
    aliases: [],
    emoji: '<:Wine:1534994973835923706>'
  },
  beer: {
    id: 'beer',
    field: 'beer',
    name: 'Beer',
    aliases: [],
    emoji: '<:Beer:1534994802385485896>'
  },
  chest: {
    id: 'chest',
    field: 'chests',
    name: 'Chest',
    aliases: ['chests'],
    emoji: '<:Chest:1534758406944985302>'
  }
};

// Clone ranks are stored separately because each rank is its own collectible
// item for now. They do not affect cards, teams, or combat yet.
const CLONE_RANKS = ['D', 'C', 'B', 'A', 'S', 'SS', 'UR'];
for (const rank of CLONE_RANKS) {
  const id = `clone${rank}`;
  INVENTORY_ITEMS[id] = {
    id,
    field: id,
    name: `${rank} Clone`,
    aliases: [`${rank.toLowerCase()} clone`, `${rank.toLowerCase()} clones`],
    emoji: null,
    rank
  };
}

function normalizeItemName(value) {
  return String(value || '').trim().toLowerCase();
}

function findInventoryItem(value) {
  const normalized = normalizeItemName(value);
  return Object.values(INVENTORY_ITEMS).find(item =>
    item.id === normalized ||
    item.name.toLowerCase() === normalized ||
    item.aliases.includes(normalized)
  ) || null;
}

module.exports = {
  INVENTORY_ITEMS,
  CLONE_RANKS,
  findInventoryItem,
  normalizeItemName
};