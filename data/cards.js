// --- 1. VISUAL CONFIGURATION ---
// You can edit the hex colors and emojis here anytime.

// Make sure to export resolveStat alongside cards and rankConfig!

const statRanges = {
  D: {
    power: { min: 0, max: 10 },
    health: { min: 0, max: 50 },
    speed: { min: 0, max: 5 }
  },
  C: {
    power: { min: 10, max: 20 },
    health: { min: 50, max: 100 },
    speed: { min: 5, max: 10 }
  },
  B: {
    power: { min: 20, max: 50 },
    health: { min: 100, max: 250 },
    speed: { min: 10, max: 20 }
  },
  A: {
    power: { min: 50, max: 75 },
    health: { min: 250, max: 400 },
    speed: { min: 20, max: 30 }
  },
  S: {
    power: { min: 75, max: 90 },
    health: { min: 400, max: 500 },
    speed: { min: 30, max: 40 }
  },
  SS: {
    power: { min: 90, max: 100 },
    health: { min: 500, max: 580 },
    speed: { min: 40, max: 50 }
  },
  UR: {
    power: { min: 100, max: 125 },
    health: { min: 580, max: 700 },
    speed: { min: 50, max: 60 }
  }
};

const rankConfig = {
  D: {
    M1: { color: 0xB4B4B4, icon: 'https://files.catbox.moe/idv9j1.png' }, // grey
    M2: { color: 0xA6A6A6, icon: 'https://files.catbox.moe/de4kvq.png' },
    M3: { color: 0x737373, icon: 'https://files.catbox.moe/4aawoa.png' }
  },

  C: {
    M1: { color: 0xFFEB99, icon: 'https://files.catbox.moe/ae1xd0.png' }, // Yellow
    M2: { color: 0xFFEB99, icon: 'https://files.catbox.moe/rp6v9b.png' },
    M3: { color: 0xFFDE59, icon: 'https://files.catbox.moe/jv8krn.png' }
  },

  B: {
    M1: { color: 0x99ACFF, icon: 'https://files.catbox.moe/xdqege.png' }, // Blue
    M2: { color: 0x5271FF, icon: 'https://files.catbox.moe/emlr0x.png' },
    M3: { color: 0x2F55FF, icon: 'https://files.catbox.moe/cx05wu.png' }
  },

  A: {
    M1: { color: 0xCEA8F0, icon: 'https://i.postimg.cc/bwFyWyj6/10.png' }, // Purple
    M2: { color: 0xB174E7, icon: 'https://i.postimg.cc/NjPsSswC/11.png' },
    M3: { color: 0x9440DD, icon: 'https://i.postimg.cc/Z5Db2bhw/12.png' }
  },

  S: {
    M1: { color: 0xFFB6D4, icon: 'https://i.postimg.cc/rwqj3T9j/13.png' }, // Pink
    M2: { color: 0xFF4090, icon: 'https://i.postimg.cc/qvpwSrGj/14.png' },
    M3: { color: 0xFF2C97, icon: 'https://i.postimg.cc/mgVjGndC/15.png' }
  },

  SS: {
    M1: { color: 0xFA4538, icon: 'https://files.catbox.moe/5urgzt.png' }, // Orange
    M2: { color: 0xF8210D, icon: 'https://files.catbox.moe/x26s4d.png' },
    M3: { color: 0xFC3104, icon: 'https://files.catbox.moe/0irfa0.png' }
  },

  UR: {
    M1: { color: 0xFE5986, icon: 'https://files.catbox.moe/fr5wdg.png' }, // Rainbow
    M2: { color: 0xE4442B, icon: 'https://files.catbox.moe/wwfwi3.png' },
    M3: { color: 0xB560F5, icon: 'https://files.catbox.moe/ndi2le.png' }
  }
};

// --- SEEDED RANDOM NUMBER HELPERS ---
// These two functions let us produce a FIXED number from a card name + stat combo.
// Without seeding, Math.random() would give a different number every call, so Shanks
// might show 98 power one time and 99 the next. With seeding, the same card name +
// stat type + filter always produces the same number — for every user, forever.

// Turns any string into a stable integer (a "hash"). Same string → same integer.
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    // This bit-shifting formula is a classic string hash (djb2-style).
    // The important property is: different strings almost always give different numbers.
    hash = Math.imul(31, hash) + str.charCodeAt(i);
    hash |= 0; // Force it to a 32-bit integer so it doesn't grow forever
  }
  return Math.abs(hash); // We only want positive seeds
}

// A simple "pseudo-random" function that always returns the same output for the same seed.
// Output is always a decimal between 0 (inclusive) and 1 (exclusive), just like Math.random().
function seededRandom(seed) {
  // Mulberry32 algorithm — fast, good distribution, no dependencies needed
  let t = (seed + 0x6D2B79F5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// --- STAT RESOLVER HELPER ---
// This function turns a card's stat filter (like '-', '=', '++') into a real number.
//
// HOW THE ZONES WORK:
//   Each rank has a stat range (e.g. B-rank health is 100–250).
//   That range is split into 5 equal zones:
//     -- = bottom zone  (lowest possible)
//     -  = second zone
//     =  = middle zone
//     +  = fourth zone
//     ++ = top zone     (highest possible)
//
// WHY STATS ARE NOW FIXED:
//   We use cardName + mastery + statType + filter as a seed for the random number.
//   This means the same card always produces the same stat — for all users, across
//   all time — so running "op info shanks" 100 times always shows the same numbers.
//
// SPECIAL RULE FOR HEALTH:
//   Health values are always rounded UP to the nearest 5 (e.g. 173 → 175).
//   This keeps HP clean and avoids awkward numbers like 173 or 181.
//
// PARAMETERS:
//   rank     — the card's rank string, e.g. 'B', 'SS'
//   statType — 'health', 'power', or 'speed'
//   value    — the filter string ('--', '-', '=', '+', '++') or a plain number
//   cardName — the card's name, used to seed the RNG so the result is always the same
//   mastery  — 1, 2, or 3 — different masteries get different (but still fixed) numbers
function resolveStat(rank, statType, value, cardName = '', mastery = 1) {
  // If the stat is already a plain number, just return it as-is (no randomness needed)
  if (typeof value === 'number') return value;

  // Look up the min/max range for this rank + stat type
  const range = statRanges[rank]?.[statType];
  if (!range) return 0; // If the rank/stat doesn't exist, return 0 as a safe default

  const { min, max } = range;
  const fifth = (max - min) / 5; // Size of each of the 5 zones

  // Figure out which zone the filter maps to
  let zoneMin, zoneMax;
  if      (value === '--') { zoneMin = min;             zoneMax = min + fifth; }
  else if (value === '-')  { zoneMin = min + fifth;     zoneMax = min + 2 * fifth; }
  else if (value === '=')  { zoneMin = min + 2 * fifth; zoneMax = min + 3 * fifth; }
  else if (value === '+')  { zoneMin = min + 3 * fifth; zoneMax = min + 4 * fifth; }
  else if (value === '++') { zoneMin = min + 4 * fifth; zoneMax = max; }
  else return min; // Unknown filter — fall back to the minimum value

  // Build a seed string that is unique to this exact card + mastery + stat + filter combo.
  // Changing ANY of these parts gives a completely different fixed number.
  const seedStr  = `${cardName}|M${mastery}|${statType}|${value}`;
  const seedNum  = hashString(seedStr);

  // Use the seeded RNG to pick a fixed point inside the zone
  let result = Math.round(seededRandom(seedNum) * (zoneMax - zoneMin) + zoneMin);

  // Health is always rounded UP to the nearest 5 for cleaner numbers (e.g. 173 → 175)
  if (statType === 'health') result = Math.ceil(result / 5) * 5;

  return result;
}

// --- RANK EMOJIS ---
// These emojis appear next to card ranks in the copies command.
// Fill in your custom Discord emoji strings here.
// Example format: '<:ur_rank:1234567890123456789>' or just a plain emoji like '💜'
// Leave blank ('') and the emoji simply won't show — nothing will break.
const rankEmojis = {
  UR: '<:UR1:1532557985312931921>', // ← paste your UR emoji here
  SS: '<:SS1:1532557981743583414>', // ← paste your SS emoji here
  S:  '<:S1:1532809299695501464>', // ← paste your S  emoji here
  A:  '<:A1:1532809220729208942>', // ← paste your A  emoji here
  B:  '<:B1:1532557972407062558>', // ← paste your B  emoji here
  C:  '<:C1:1532557969085173850>', // ← paste your C  emoji here
  D:  '<:D1:1532557966501220482>'  // ← paste your D  emoji here
};

// --- CARD VALIDATION ---
const VALID_RANKS = new Set(['D', 'C', 'B', 'A', 'S', 'SS', 'UR']);
const VALID_STAT_FILTERS = new Set(['--', '-', '=', '+', '++']);

function validateCardData(cardName, data, label) {
  if (!data.rank || !VALID_RANKS.has(data.rank)) {
    console.warn(`[Card Validation] "${cardName}" (${label}) — invalid rank: "${data.rank}". A placeholder rank will be used.`);
  }
  for (const stat of ['health', 'power', 'speed']) {
    const val = data[stat];
    if (typeof val !== 'number' && !VALID_STAT_FILTERS.has(val)) {
      console.warn(`[Card Validation] "${cardName}" (${label}) — invalid ${stat}: "${val}". A placeholder stat will be used.`);
    }
  }
}

function validateAllCards(cardList) {
  for (const card of cardList) {
    const name = card.name || '(unnamed)';
    if (!card.name) {
      console.warn(`[Card Validation] A card has no name field. Check cards.js.`);
    }
    validateCardData(name, card, 'M1');
    if (card.M2) validateCardData(name, card.M2, 'M2');
    if (card.M3) validateCardData(name, card.M3, 'M3');
  }
}

// Safely resolves a rank — falls back to 'D' so the bot never crashes on bad data
function safeRank(rank) {
  return VALID_RANKS.has(rank) ? rank : 'D';
}

// Safely resolves a stat value — falls back to '=' so the bot never crashes on bad data
function safeStat(value) {
  if (typeof value === 'number') return value;
  return VALID_STAT_FILTERS.has(value) ? value : '=';
}

// --- RANK CONFIG & CARDS ... (keep your existing rankConfig and cards array here) ---



/* D:
Power: 0 - 10
Health: 0 - 50
Speed: 0 - 5

C: 
power: 10 - 20
health: 50 - 100
speed: 5 - 10

B: 
power: 20 - 50
health: 100 - 250
speed: 10 - 20

A: 
power: 50 - 75
health: 250 - 400
speed: 20 - 30

S:
power: 75 - 90
health: 400 - 500
speed: 30 - 40

SS: 
power: 90 - 100
health: 500 - 580
speed: 40 - 50

UR:
power:
100 - 125
health: 580 - 700
speed: 50 - 60 */

// --- 2. CARD LIBRARY ---
const cards = [
  
  {
  
    name: 'Gill Bastar',
    aliases: ['Gill Bastar',],


    title: 'Thriller Bark Zombie',
    rank: 'B',
    health: '-',
    power: '=',
    speed: '-',
    image: 'https://i.postimg.cc/bY0XF90f/6.png', 
    
  
    M2: {
      title: 'Outlaw - Wanted!',
      rank: 'A', 
      health: '-',
      power: '=',
      speed: '-',
      image: 'https://i.postimg.cc/yxywg76L/4.png'
    },
    
 
    M3: {
      title: 'Criminal - Wanted!',
      rank: 'A',
      health: '=',
      power: '+',
      speed: '=',
      image: 'https://i.postimg.cc/GtxZ8b3q/5.png'
    }
  },
  {
  
    name: 'Cyrano',
    aliases: ['Cyrano',],


    title: 'Swordsman - MONSTERS',
    rank: 'B',
    health: '-',
    power: '+',
    speed: '=',
    image: 'https://i.postimg.cc/66Vs1fVt/7.png', 
    
  
    M2: {
      title: 'Swordsman - MONSTERS',
      rank: 'B', 
      health: '=',
      power: '++',
      speed: '+',
      image: 'https://i.postimg.cc/DfQVYPQ2/8.png'
    },
    
 
    M3: {
      title: 'Swordsman',
      rank: 'A',
      health: '-',
      power: '+',
      speed: '=',
      image: 'https://i.postimg.cc/RC1rbL1Z/9.png'
    }
  },
  {
  
    name: 'Flare',
    aliases: ['Flare',],


    title: 'Waitress - MONSTERS',
    rank: 'D',
    health: '-',
    power: '-',
    speed: '-',
    image: 'https://i.postimg.cc/J73wd53t/13.png', 
    
  
    M2: {
      title: 'Waitress - MONSTERS',
      rank: 'D', 
      health: '=',
      power: '=',
      speed: '=',
      image: 'https://i.postimg.cc/1R0xYr0N/14.png'
    },
    
 
    M3: {
      title: 'Waitress',
      rank: 'C',
      health: '-',
      power: '-',
      speed: '-',
      image: 'https://i.postimg.cc/v87RSt7V/15.png'
    }
  },
  {
    name: 'D.R.',
    aliases: ['DR', 'D.R', 'DR.'],

    title: 'Criminal - MONSTERS',
    rank: 'B',
    health: '-',
    power: '=',
    speed: '-',
    image: 'https://i.postimg.cc/QNgLnJgt/10.png', 
    
    M2: {
      title: 'Swordsman - MONSTERS',
      rank: 'B', 
      health: '=',
      power: '+',
      speed: '=',
      image: 'https://i.postimg.cc/3rjMbFjk/11.png'
    }, 
  
    M3: {
      title: 'Swordsman - MONSTERS',
      rank: 'A',
      health: '-',
      power: '=',
      speed: '-',
      image: 'https://i.postimg.cc/WpmRfwmD/12.png',
    }
    },

  {
    name: 'Alvida',
    aliases: ['Alvida',],

    title: 'Iron Mace',
    rank: 'C',
    health: '=',
    power: '=',
    speed: '-',
    image: 'https://i.postimg.cc/zDwmPFwS/19.png', 
    
    M2: {
      title: 'Buggy Pirates',
      rank: 'B', 
      health: '-',
      power: '=',
      speed: '-',
      image: 'https://i.postimg.cc/MZ0krm0m/20.png'
    }, 
  
    M3: {
      title: 'Cross Guild',
      rank: 'A',
      health: '-',
      power: '-',
      speed: '-',
      image: 'https://i.postimg.cc/pVQN1JQB/21.png',
    }
  },
  {
    name: 'Shimotsuki Kuina',
    aliases: ['Kuina',],

    title: 'Zoro\'s Rival',
    rank: 'C',
    health: '-',
    power: '+',
    speed: '=',
    image: 'https://i.postimg.cc/pLLpdTVC/53.png', 
    
    M2: {
      title: 'Zoro\'s Friend',
      rank: 'C', 
      health: '=',
      power: '++',
      speed: '+',
      image: 'https://i.postimg.cc/HkkVLxWB/54.png'
    }, 
  
    M3: {
      title: 'Swordswoman',
      rank: 'B',
      health: '-',
      power: '+',
      speed: '=',
      image: 'https://i.postimg.cc/httfGj42/55.png',
    }
  },
  {
    name: 'Morgan',
    aliases: ['Axe hand', 'Morgan', 'Axe-hand'],

    title: 'Axe-Hand',
    rank: 'C',
    health: '=',
    power: '=',
    speed: '-',
    image: 'https://i.postimg.cc/MppvGTZY/50.png', 
    
    M2: {
      title: 'Marine Lieutenant Commander',
      rank: 'B', 
      health: '=',
      power: '=',
      speed: '-',
      image: 'https://i.postimg.cc/8zzjC5km/51.png'
    }, 
  
    M3: {
      title: 'Marine Captain',
      rank: 'B',
      health: '+',
      power: '+',
      speed: '=',
      image: 'https://i.postimg.cc/t44YgTR5/52.png',
    }
  },
  {
    name: 'Ririka',
    aliases: ['Ririka',],

    title: 'Shell\'s Town Bartender',
    rank: 'D',
    health: '-',
    power: '-',
    speed: '-',
    image: 'https://i.postimg.cc/VkkdN6sM/47.png', 
    
    M2: {
      title: 'Rika\'s Mother',
      rank: 'D', 
      health: '=',
      power: '=',
      speed: '=',
      image: 'https://i.postimg.cc/5226t098/48.png'
    }, 
  
    M3: {
      title: 'Rika\'s Mother',
      rank: 'D',
      health: '+',
      power: '+',
      speed: '+',
      image: 'https://i.postimg.cc/zGGVfBDC/49.png',
    }
  },
  {
    name: 'Helmeppo',
    aliases: ['Helmeppo',],

    title: 'Son of Axe-Hand Morgan',
    rank: 'C',
    health: '-',
    power: '-',
    speed: '-',
    image: 'https://i.postimg.cc/SxxJKsQX/43.png', 
    
    M2: {
      title: 'Chief Petty Officer',
      rank: 'C', 
      health: '=',
      power: '=',
      speed: '=',
      image: 'https://i.postimg.cc/Njj50MGr/44.png'
    }, 
  
    M3: {
      title: 'Lieutenant Commander',
      rank: 'B',
      health: '=',
      power: '=',
      speed: '=',
      image: 'https://i.postimg.cc/T33pPw2b/45.png',
    }
  },
  {
    name: 'Rika',
    aliases: ['Rika',],

    title: 'Young Girl from Shells Town',
    rank: 'D',
    health: '-',
    power: '-',
    speed: '-',
    image: 'https://i.postimg.cc/CLNRYD0b/40.png', 
    
    M2: {
      title: 'Young Girl from Shells Town',
      rank: 'D', 
      health: '=',
      power: '=',
      speed: '=',
      image: 'https://i.postimg.cc/bNTZ8bPQ/41.png'
    }, 
  
    M3: {
      title: 'Marine Waitress',
      rank: 'C',
      health: '-',
      power: '-',
      speed: '-',
      image: 'https://i.postimg.cc/x11cdCjc/42.png',
    }
  },
  {
    name: 'Soro',
    aliases: ['Soro',],

    title: 'Helmeppo\'s Pet Wolf',
    rank: 'D',
    health: '-',
    power: '+',
    speed: '=',
    image: 'https://i.postimg.cc/zGGVfBDg/46.png', 
  },
  {
    name: 'Roronoa Zoro',
    aliases: ['Zoro',],

    title: 'Pirate Hunter',
    rank: 'B',
    health: '=',
    power: '+',
    speed: '=',
    image: 'https://i.postimg.cc/dtBhvdFk/37.png', 
    
    M2: {
      title: 'Worst Generation Pirate',
      rank: 'A', 
      health: '=',
      power: '+',
      speed: '=',
      image: 'https://i.postimg.cc/J4qsmJ8k/38.png'
    }, 
  
    M3: {
      title: 'King of Hell',
      rank: 'SS',
      health: '=',
      power: '=',
      speed: '=',
      image: 'https://i.postimg.cc/6508wRKr/39.png',
    }
  },
  {
    name: 'Heppoko',
    aliases: ['Heppoko',],

    title: 'Alvida Pirates',
    rank: 'D',
    health: '-',
    power: '-',
    speed: '-',
    image: 'https://i.postimg.cc/zXjy5WNf/34.png', 
    
    M2: {
      title: 'Alvida Pirates',
      rank: 'D', 
      health: '=',
      power: '=',
      speed: '=',
      image: 'https://i.postimg.cc/7YV5D74C/35.png'
    }, 
  
    M3: {
      title: 'Alvida Pirates',
      rank: 'D',
      health: '+',
      power: '+',
      speed: '+',
      image: 'https://i.postimg.cc/QxbFs5DW/36.png',
    }
  },
  {
    name: 'Poppoko',
    aliases: ['Hoppoko',],

    title: 'Alvida Pirates',
    rank: 'D',
    health: '-',
    power: '-',
    speed: '-',
    image: 'https://i.postimg.cc/5N3X1vJb/31.png', 
    
    M2: {
      title: 'Alvida Pirates',
      rank: 'D', 
      health: '=',
      power: '=',
      speed: '=',
      image: 'https://i.postimg.cc/m2wPRM4b/32.png'
    }, 
  
    M3: {
      title: 'Alvida Pirates',
      rank: 'D',
      health: '+',
      power: '+',
      speed: '+',
      image: 'https://i.postimg.cc/9FpDVT2F/33.png',
    }
  },
  {
    name: 'Peppoko',
    aliases: ['Peppoko',],

    title: 'Alvida Pirates',
    rank: 'D',
    health: '-',
    power: '-',
    speed: '-',
    image: 'https://i.postimg.cc/159xxVM0/28.png', 
    
    M2: {
      title: 'Alvida Pirates',
      rank: 'D', 
      health: '=',
      power: '=',
      speed: '=',
      image: 'https://i.postimg.cc/ZKTkkvjF/30.png'
    }, 
  
    M3: {
      title: 'Alvida Pirates',
      rank: 'D',
      health: '+',
      power: '+',
      speed: '+',
      image: 'https://files.catbox.moe/weqir3.webp',
    }
  },
  {
    name: 'Koby',
    aliases: ['Coby',],

    title: 'Alvida Pirates',
    rank: 'D',
    health: '-',
    power: '-',
    speed: '-',
    image: 'https://i.postimg.cc/L6HddgvP/25.png', 
    
    M2: {
      title: 'Master Chief Petty Officer',
    rank: 'B',
    health: '-',
    power: '=',
    speed: '-',
    image: 'https://i.postimg.cc/vHQRRxXf/26.png', 
    }, 
  
    M3: {
      title: 'Marine Captain',
      rank: 'S', 
      health: '-',
      power: '+',
      speed: '-',
      image: 'https://i.postimg.cc/28zppLTn/27.png'
    }
  },
  {
    name: 'Nami',
    aliases: ['',],

    title: 'Cat Burglar',
    rank: 'C',
    health: '-',
    power: '-',
    speed: '-',
    image: 'https://i.postimg.cc/X7VMMBxB/22.png', 
    
    M2: {
      title: 'Strawhat Pirates',
      rank: 'A', 
      health: '-',
      power: '-',
      speed: '-',
      image: 'https://i.postimg.cc/KvZXX3Qg/23.png'
    }, 
  
    M3: {
      title: 'Strawhat Pirates',
      rank: 'S',
      health: '-',
      power: '=',
      speed: '-',
      image: 'https://i.postimg.cc/J41wwHKk/24.png',
    }
  },
  {
    name: 'Makino',
    aliases: ['Makino',],

    title: 'Partys Bar Owner',
    rank: 'C',
    health: '-',
    power: '-',
    speed: '-',
    image: 'https://i.postimg.cc/s2tXK4YS/86.png', 
    
    M2: {
    title: 'Partys Bar Owner',
    rank: 'C',
    health: '=',
    power: '=',
    speed: '=',
    image: 'https://i.postimg.cc/VN364WqB/87.png', 
    }, 
  
    M3: {
    title: 'Partys Bar Owner',
    rank: 'B',
    health: '-',
    power: '-',
    speed: '-',
    image: 'https://i.postimg.cc/rpvmgN1f/88.png', 
    }
  },
  {
    name: 'Limejuice',
    aliases: ['Lime juice',],

    title: 'Red Hair Pirates',
    rank: 'B',
    health: '=',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/aih8k3.png', 
    
    M2: {
    title: 'Red Hair Pirates',
    rank: 'B',
    health: '+',
    power: '+',
    speed: '+',
    image: 'https://i.postimg.cc/5tZ0pSBz/84.png', 
    }, 
  
    M3: {
    title: 'Red Hair Pirates',
    rank: 'A',
    health: '=',
    power: '=',
    speed: '=',
    image: 'https://i.postimg.cc/pdgTkJff/85.png', 
    }
  },
  {
    name: 'Lucky Roux',
    aliases: ['',],

    title: 'Red Hair Pirates',
    rank: 'B',
    health: '+',
    power: '=',
    speed: '-',
    image: 'https://i.postimg.cc/0N6jpBwY/80.png', 
    
    M2: {
    title: 'Red Hair Pirates',
    rank: 'B',
    health: '++',
    power: '+',
    speed: '=',
    image: 'https://i.postimg.cc/QMBCpyTg/81.png', 
    }, 
  
    M3: {
    title: 'Red Hair Pirates',
    rank: 'A',
    health: '+',
    power: '=',
    speed: '-',
    image: 'https://i.postimg.cc/7LChgW2n/82.png', 
    }
  },
  {
    name: 'Thightrope Walking Funan Bro 1',
    aliases: ['Funan Bro 1',],

    title: 'Buggy Pirates',
    rank: 'D',
    health: '-',
    power: '-',
    speed: '-',
    image: 'https://i.postimg.cc/g0wjvTZh/77.png', 
    
    M2: {
    title: 'Buggy Pirates',
    rank: 'D',
    health: '=',
    power: '=',
    speed: '=',
    image: 'https://i.postimg.cc/cJKCQbnw/78.png', 
    }, 
  
    M3: {
    title: 'Buggy Pirates',
    rank: 'D',
    health: '+',
    power: '+',
    speed: '+',
    image: 'https://i.postimg.cc/XvZqwzC9/79.png', 
    }
  },
  {
    name: 'Thightrope Walking Funan Bro 2',
    aliases: ['Funan Bro 2',],

    title: 'Buggy Pirates',
    rank: 'D',
    health: '-',
    power: '-',
    speed: '-',
    image: 'https://i.postimg.cc/25qy4KZy/74.png', 
    
    M2: {
    title: 'Buggy Pirates',
    rank: 'D',
    health: '=',
    power: '=',
    speed: '=',
    image: 'https://i.postimg.cc/3wyNgcvW/75.png', 
    }, 
  
    M3: {
    title: 'Buggy Pirates',
    rank: 'D',
    health: '+',
    power: '+',
    speed: '+',
    image: 'https://i.postimg.cc/9f40Gn7q/76.png', 
    }
  },
  {
    name: 'Thightrope Walking Funan Bro 3',
    aliases: ['Funan Bro 3',],

    title: 'Buggy Pirates',
    rank: 'D',
    health: '-',
    power: '-',
    speed: '-',
    image: 'https://i.postimg.cc/Bv8bxVK0/71.png', 
    
    M2: {
    title: 'Buggy Pirates',
    rank: 'D',
    health: '=',
    power: '=',
    speed: '=',
    image: 'https://i.postimg.cc/q7tq853p/72.png', 
    }, 
  
    M3: {
    title: 'Buggy Pirates',
    rank: 'D',
    health: '+',
    power: '+',
    speed: '+',
    image: 'https://i.postimg.cc/8CFch06C/73.png', 
    }
  },
  {
    name: 'Figarland Shanks',
    aliases: ['Shanks', 'Red Hair'],

    title: 'Red Hair Pirates Captain',
    rank: 'SS',
    health: '=',
    power: '+',
    speed: '+',
    image: 'https://files.catbox.moe/m9r917.png', 
    
    M2: {
    title: 'Emperor of the Sea',
    rank: 'SS',
    health: '+',
    power: '++',
    speed: '++',
    image: 'https://files.catbox.moe/j0roco.png', 
    }, 
  
    M3: {
    title: 'Emperor of the New World',
    rank: 'UR',
    health: '=',
    power: '++',
    speed: '+',
    image: 'https://files.catbox.moe/1gh9hk.png', 
    }
  },
  {
    name: 'Ripper',
    aliases: ['',],

    title: 'Marine Commander',
    rank: 'C',
    health: '=',
    power: '=',
    speed: '=',
    image: 'https://i.postimg.cc/L8Qhgpnd/65.png', 
    
    M2: {
    title: 'Marine Commander',
    rank: 'C',
    health: '+',
    power: '+',
    speed: '+',
    image: 'https://i.postimg.cc/Mp3XfSvS/66.png', 
    }, 
  
    M3: {
    title: 'Marine Commander',
    rank: 'B',
    health: '=',
    power: '=',
    speed: '=',
    image: 'https://i.postimg.cc/XY1XBbpV/67.png', 
    }
  },
  {
    name: 'Buggy',
    aliases: ['Clown',],

    title: 'The Clown',
    rank: 'B',
    health: '=',
    power: '=',
    speed: '=',
    image: 'https://i.postimg.cc/T3Nh56hN/62.png', 
    
    M2: {
    title: 'The Genius Jester',
    rank: 'A',
    health: '=',
    power: '-',
    speed: '=',
    image: 'https://i.postimg.cc/x1pqN2qB/63.png', 
    }, 
  
    M3: {
    title: 'Emperor of the New World',
    rank: 'S',
    health: '=',
    power: '-',
    speed: '=',
    image: 'https://i.postimg.cc/Hkvj8gjq/64.png', 
    }
  },
  {
    name: 'Ukkari',
    aliases: ['',],

    title: 'Marine Seasman Recruit',
    rank: 'D',
    health: '=',
    power: '=',
    speed: '=',
    image: 'https://i.postimg.cc/P55Pqxf0/59.png', 
    
    M2: {
    title: 'Marine Seasman Recruit',
    rank: 'D',
    health: '+',
    power: '+',
    speed: '+',
    image: 'https://i.postimg.cc/RZpqJBqX/60.png', 
    }, 
  
    M3: {
    title: 'Marine Seasman Recruit',
    rank: 'D',
    health: '++',
    power: '++',
    speed: '++',
    image: 'https://i.postimg.cc/htZhQBh2/61.png', 
    }
  },
  {
    name: 'Rokkaku',
    aliases: ['',],

    title: 'Marine Lieutenant Junior Grade',
    rank: 'D',
    health: '=',
    power: '=',
    speed: '=',
    image: 'https://i.postimg.cc/7ZZfL6PB/56.png', 
    
    M2: {
    title: 'Marine Lieutenant Junior Grade',
    rank: 'D',
    health: '+',
    power: '+',
    speed: '+',
    image: 'https://i.postimg.cc/P55PqxfF/57.png', 
    }, 
  
    M3: {
    title: 'Marine Lieutenant Junior Grade',
    rank: 'C',
    health: '=',
    power: '=',
    speed: '=',
    image: 'https://i.postimg.cc/kggB54Mz/58.png',
    }
  },
  {
    name: 'Woop Slap',
    aliases: ['woopslap',],

    title: 'Foosha Village Mayor',
    rank: 'C',
    health: '-',
    power: '-',
    speed: '-',
    image: 'https://i.postimg.cc/d1r0fZnk/98.png', 
    
    M2: {
    title: 'Foosha Village Mayor',
    rank: 'C',
    health: '=',
    power: '=',
    speed: '=',
    image: 'https://i.postimg.cc/D0hz3fYz/99.png', 
    }, 
  
    M3: {
    title: 'Foosha Village Mayor',
    rank: 'B',
    health: '-',
    power: '-',
    speed: '-',
    image: 'https://i.postimg.cc/yxKNC6r8/100.png', 
    }
  },
  {
    name: 'Higuma',
    aliases: ['',],

    title: 'Higuma Bandits leader',
    rank: 'C',
    health: '-',
    power: '=',
    speed: '-',
    image: 'https://files.catbox.moe/713jan.webp', 
    
    M2: {
    title: 'Higuma Bandits leader',
    rank: 'C',
    health: '=',
    power: '+',
    speed: '=',
    image: 'https://files.catbox.moe/qpqrbg.webp', 
    }, 
  
    M3: {
    title: 'Higuma Bandits leader',
    rank: 'C',
    health: '+',
    power: '++',
    speed: '+',
    image: 'https://files.catbox.moe/lqktfv.webp', 
    }
  },
  {
    name: 'Bonk Punch',
    aliases: ['Bonk', 'Punch'],

    title: 'Red Hair Pirates',
    rank: 'B',
    health: '-',
    power: '-',
    speed: '-',
    image: 'https://i.postimg.cc/pdgTkJf7/89.png', 
    
    M2: {
    title: 'Red Hair Pirates',
    rank: 'B',
    health: '=',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/ri8tf4.webp', 
    }, 
  
    M3: {
    title: 'Red Hair Pirates',
    rank: 'A',
    health: '-',
    power: '-',
    speed: '-',
    image: 'https://files.catbox.moe/cb84k1.webp', 
    }
  },
  {
    name: 'Benn Beckman',
    aliases: ['Ben', 'Beckman',],

    title: 'Red Hair Pirates',
    rank: 'SS',
    health: 500,
    power: 90,
    speed: 40,
    image: 'https://files.catbox.moe/7w06ob.jpg', 
    
    M2: {
    title: 'Red Hair Pirates',
    rank: 'SS',
    health: 510,
    power: 92,
    speed: 41,
    image: 'https://files.catbox.moe/5im0b6.webp', 
    }, 
  
    M3: {
    title: 'Red Hair Pirates',
    rank: 'SS',
    health: 520,
    power: 94,
    speed: 42,
    image: 'https://files.catbox.moe/ho9b7z.webp', 
    }
  },
  
  {
    name: 'Acrobatic Fuwa 1',
    aliases: ['',],

    title: 'Buggy Pirates',
    rank: 'D',
    health: '-',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/lfq6s6.png', 
    
    M2: {
    title: 'Buggy Pirates',
    rank: 'D',
    health: '=',
    power: '+',
    speed: '+',
    image: 'https://files.catbox.moe/0klqia.png', 
    }, 
  
    M3: {
    title: 'Buggy Pirates',
    rank: 'C',
    health: '-',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/ot9zpx.png', 
    }
  },
  {
    name: 'Acrobatic Fuwa 2',
    aliases: ['',],

    title: 'Buggy Pirates',
    rank: 'D',
    health: '-',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/0o3whl.png', 
    
    M2: {
    title: 'Buggy Pirates',
    rank: 'D',
    health: '=',
    power: '+',
    speed: '+',
    image: 'https://files.catbox.moe/orxg5a.png', 
    }, 
  
    M3: {
    title: 'Buggy Pirates',
    rank: 'C',
    health: '-',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/tym0ly.png', 
    }
  },
  {
    name: 'Acrobatic Fuwa 3',
    aliases: ['',],

    title: 'Buggy Pirates',
    rank: 'D',
    health: '-',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/yh46hk.png', 
    
    M2: {
    title: 'Buggy Pirates',
    rank: 'D',
    health: '=',
    power: '+',
    speed: '+',
    image: 'https://files.catbox.moe/h4c0aj.png', 
    }, 
  
    M3: {
    title: 'Buggy Pirates',
    rank: 'C',
    health: '-',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/yt3ycm.png', 
    }
  },
  {
    name: 'Acrobatic Fuwa 4',
    aliases: ['',],

    title: 'Buggy Pirates',
    rank: 'D',
    health: '-',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/uyszd1.png', 
    
    M2: {
    title: 'Buggy Pirates',
    rank: 'D',
    health: '=',
    power: '+',
    speed: '+',
    image: 'https://files.catbox.moe/i4rhj5.png', 
    }, 
  
    M3: {
    title: 'Buggy Pirates',
    rank: 'C',
    health: '-',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/kxpec1.png', 
    }
  },
  {
    name: 'Banchina',
    aliases: ['',],

    title: 'Usopp\'s Mother',
    rank: 'D',
    health: '--',
    power: '-',
    speed: '-',
    image: 'https://files.catbox.moe/7eaa9e.png', 
    
    M2: {
    title: 'Usopp\'s Mother',
    rank: 'D',
    health: '-',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/fov3dp.png', 
    }, 
  },
  {
    name: 'Boodle',
    aliases: ['',],

    title: 'Mayor of Orange town',
    rank: 'C',
    health: '-',
    power: '-',
    speed: '-',
    image: 'https://files.catbox.moe/u0vao2.png', 
    
    M2: {
    title: 'Mayor of Orange town',
    rank: 'C',
    health: '=',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/e3918i.png', 
    }, 
  
    M3: {
    title: 'Mayor of Orange town',
    rank: 'B',
    health: '-',
    power: '-',
    speed: '-',
    image: 'https://files.catbox.moe/1l7e64.png', 
    }
  },
  {
    name: 'Sham',
    aliases: ['Siam',],

    title: 'Black Cat Pirates',
    rank: 'C',
    health: '=',
    power: '+',
    speed: '+',
    image: 'https://files.catbox.moe/ga132i.png', 
    
    M2: {
    title: 'Black Cat Pirates',
    rank: 'C',
    health: '+',
    power: '++',
    speed: '++',
    image: 'https://files.catbox.moe/2s8lbf.png', 
    }, 
  
    M3: {
    title: 'Black Cat Pirates',
    rank: 'B',
    health: '=',
    power: '+',
    speed: '+',
    image: 'https://files.catbox.moe/y6ccno.png', 
    }
  },
  {
    name: 'Building Snake',
    aliases: ['',],

    title: 'Red Hair Pirates',
    rank: 'B',
    health: '=',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/1787of.png', 
    
    M2: {
    title: 'Red Hair Pirates',
    rank: 'A',
    health: '=',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/dvgi02.png', 
    }, 
  
    M3: {
    title: 'Red Hair Pirates',
    rank: 'A',
    health: '+',
    power: '+',
    speed: '+',
    image: 'https://files.catbox.moe/v4f3vn.png', 
    }
  },
  {
    name: 'Cabaji',
    aliases: ['',],

    title: 'The Acrobat',
    rank: 'B',
    health: '-',
    power: '=',
    speed: '-',
    image: 'https://files.catbox.moe/97lpbi.png', 
    
    M2: {
    title: 'Buggy Pirates',
    rank: 'B',
    health: '=',
    power: '+',
    speed: '+',
    image: 'https://files.catbox.moe/z0wumw.png', 
    }, 
  
    M3: {
    title: 'Cross Guild',
    rank: 'A',
    health: '-',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/oalo77.png', 
    }
  },
  {
    name: 'Chouchou',
    aliases: ['Shushu', 'Chou-Chou'],

    title: 'Pet Shop Keeper',
    rank: 'D',
    health: '=',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/04gx4w.png', 
    
    M2: {
    title: 'Pet Shop Keeper',
    rank: 'D',
    health: '+',
    power: '+',
    speed: '+',
    image: 'https://files.catbox.moe/tbnxs5.png', 
    }, 
  
    M3: {
    title: 'Pet Shop Keeper',
    rank: 'C',
    health: '=',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/pmhz48.png', 
    }
  },
  {
    name: 'Buchi',
    aliases: ['Butchie',],

    title: 'Nyaban Brother',
    rank: 'C',
    health: '-',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/050jwf.png', 
    
    M2: {
    title: 'Black Cat Pirates',
    rank: 'C',
    health: '=',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/93qnsv.png', 
    }, 
  
    M3: {
    title: 'Black Cat Pirates',
    rank: 'B',
    health: '-',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/l0j5c9.png', 
    }
  },
  {
    name: 'Hocker',
    aliases: ['',],

    title: 'Pet Shop Owner',
    rank: 'D',
    health: '-',
    power: '-',
    speed: '-',
    image: 'https://files.catbox.moe/hz6wyj.png', 
    
    M2: {
    title: 'Pet Shop Owner',
    rank: 'D',
    health: '=',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/mu40gf.png', 
    }, 
  
    M3: {
    title: 'Pet Shop Owner',
    rank: 'D',
    health: '+',
    power: '+',
    speed: '+',
    image: 'https://files.catbox.moe/0va7qz.png', 
    }
  },
  {
    name: 'Jango',
    aliases: ['Django',],

    title: 'The turncoat',
    rank: 'B',
    health: '-',
    power: '+',
    speed: '-',
    image: 'https://files.catbox.moe/wh81on.png', 
    
    M2: {
    title: '"One Two" Django',
    rank: 'B',
    health: '=',
    power: '++',
    speed: '=',
    image: 'https://files.catbox.moe/n6n1dy.png', 
    }, 
  
    M3: {
    title: 'Marine Lieutenant',
    rank: 'A',
    health: '-',
    power: '=',
    speed: '-',
    image: 'https://files.catbox.moe/edqvmp.png', 
    }
  },
  {
    name: 'Kaya',
    aliases: ['',],

    title: 'Syrup Village',
    rank: 'C',
    health: '--',
    power: '-',
    speed: '-',
    image: 'https://files.catbox.moe/f7a8xv.png', 
    
    M2: {
    title: 'Syrup Village',
    rank: 'C',
    health: '=',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/av6jol.png', 
    }, 
  
    M3: {
    title: 'Medical Student',
    rank: 'B',
    health: '-',
    power: '-',
    speed: '-',
    image: 'https://files.catbox.moe/55m1rv.png', 
    }
  },
  {
    name: 'Kuro',
    aliases: ['',],

    title: 'Of a Hundred Plans',
    rank: 'B',
    health: '=',
    power: '+',
    speed: '+',
    image: 'https://files.catbox.moe/niu5k9.jpg', 
    
    M2: {
    title: 'Captain of the Black Cat Pirates',
    rank: 'B',
    health: '+',
    power: '++',
    speed: '++',
    image: 'https://files.catbox.moe/fq03jl.jpg', 
    }, 
  
    M3: {
    title: 'Captain of the Black Cat Pirates',
    rank: 'A',
    health: '-',
    power: '=',
    speed: '+',
    image: 'https://files.catbox.moe/rsnmri.jpg', 
    }
  },
  {
    name: 'Lord of the Coast',
    aliases: ['Lord Sea Monster', 'Master of the Near Sea', ],

    title: 'Take D. Arm',
    rank: 'C',
    health: '+',
    power: '+',
    speed: '=',
    image: 'https://files.catbox.moe/s36ner.png', 
    
    M2: {
    title: 'Foosha Village\'s local Sea King',
    rank: 'C',
    health: '++',
    power: '++',
    speed: '+',
    image: 'https://files.catbox.moe/qqcx96.png', 
    }, 
  
    M3: {
    title: 'Foosha Village\'s local Sea King',
    rank: 'B',
    health: '=',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/2ikxhx.png', 
    }
  },
  {
    name: 'Mansion Guard 1',
    aliases: ['',],

    title: 'Kaya\'s security Guard',
    rank: 'D',
    health: '=',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/lt0c2h.png', 
    
    M2: {
    title: 'Kaya\'s security Guard',
    rank: 'D',
    health: '+',
    power: '+',
    speed: '+',
    image: 'https://files.catbox.moe/icjvii.png', 
    }, 
  
    M3: {
    title: 'Kaya\'s security Guard',
    rank: 'D',
    health: '++',
    power: '++',
    speed: '++',
    image: 'https://files.catbox.moe/1utn61.png', 
    }
  },
  {
    name: 'Mansion Guard 2',
    aliases: ['',],

    title: 'Kaya\'s security Guard',
    rank: 'D',
    health: '=',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/haxqrd.png', 
    
    M2: {
    title: 'Kaya\'s security Guard',
    rank: 'D',
    health: '+',
    power: '+',
    speed: '+',
    image: 'https://files.catbox.moe/ne1clc.png', 
    }, 
  
    M3: {
    title: 'kaya\'s security Guard',
    rank: 'D',
    health: '++',
    power: '++',
    speed: '++',
    image: 'https://files.catbox.moe/40zfcb.png', 
    }
  },
  {
    name: 'Merry',
    aliases: ['',],

    title: 'Butler',
    rank: 'C',
    health: '=',
    power: '-',
    speed: '-',
    image: 'https://files.catbox.moe/w1zwcm.png', 
    
    M2: {
    title: 'Butler',
    rank: 'C',
    health: '+',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/bx7jlm.png', 
    }, 
  
    M3: {
    title: 'Butler',
    rank: 'B',
    health: '-',
    power: '-',
    speed: '-',
    image: 'https://files.catbox.moe/wk665q.png', 
    }
  },
  {
    name: 'Mohji',
    aliases: ['Morji',],

    title: 'The Beast Tamer',
    rank: 'B',
    health: '-',
    power: '=',
    speed: '-',
    image: 'https://files.catbox.moe/y8zkf7.png', 
    
    M2: {
    title: 'Buggy Pirates',
    rank: 'B',
    health: '=',
    power: '+',
    speed: '=',
    image: 'https://files.catbox.moe/nrbinf.png', 
    }, 
  
    M3: {
    title: 'Cross Guild - Fat Chud',
    rank: 'B',
    health: '-',
    power: '-',
    speed: '--',
    image: 'https://files.catbox.moe/gbvcfu.png', 
    }
  },
  {
    name: 'Ninjin',
    aliases: ['Carrot',],

    title: 'Usopp Pirates',
    rank: 'D',
    health: '-',
    power: '=',
    speed: '-',
    image: 'https://files.catbox.moe/sbns17.png', 
    
    M2: {
    title: 'Usopp Security Force',
    rank: 'D',
    health: '=',
    power: '+',
    speed: '=',
    image: 'https://files.catbox.moe/99hsmz.png', 
    }, 
  
    M3: {
    title: 'Usopp Security Force',
    rank: 'C',
    health: '-',
    power: '-',
    speed: '-',
    image: 'https://files.catbox.moe/xvcoih.png', 
    }
  },
  {
    name: 'Nugire Yainu',
    aliases: ['',],

    title: 'Black Cat Pirates',
    rank: 'D',
    health: '-',
    power: '-',
    speed: '-',
    image: 'https://files.catbox.moe/84vwz6.png', 
  },
  {
    name: 'Piiman',
    aliases: ['Pepper',],

    title: 'Usopp Pirates',
    rank: 'D',
    health: '-',
    power: '=',
    speed: '-',
    image: 'https://files.catbox.moe/qbioo7.png', 
    
    M2: {
    title: 'Usopp security Force',
    rank: 'D',
    health: '=',
    power: '+',
    speed: '=',
    image: 'https://files.catbox.moe/g27sa9.png', 
    }, 
  
    M3: {
    title: 'Security Force',
    rank: 'C',
    health: '-',
    power: '-',
    speed: '-',
    image: 'https://files.catbox.moe/v3eqrt.png', 
    }
  },
  {
    name: 'Pinky',
    aliases: ['',],

    title: 'Monstrous Bird',
    rank: 'D',
    health: '-',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/h5e1cr.png', 
    
    M2: {
    title: 'Monstrous Bird',
    rank: 'D',
    health: '=',
    power: '+',
    speed: '+',
    image: 'https://files.catbox.moe/7zdukf.png', 
    }, 
  
    M3: {
    title: 'Monstrous Bird',
    rank: 'D',
    health: '+',
    power: '++',
    speed: '++',
    image: 'https://files.catbox.moe/tgcs21.png', 
    }
  },
  {
    name: 'Poro',
    aliases: ['',],

    title: 'Bookstore Owner',
    rank: 'D',
    health: '-',
    power: '-',
    speed: '-',
    image: 'https://files.catbox.moe/d24drj.png', 
    
    M2: {
    title: 'Bookstore Owner',
    rank: 'D',
    health: '=',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/m649yu.png', 
    }, 
  
    M3: {
    title: 'Bookstore Owner',
    rank: 'C',
    health: '-',
    power: '-',
    speed: '-',
    image: 'https://files.catbox.moe/ax1yok.png', 
    }
  },
  {
    name: 'Silvers Rayleigh',
    aliases: ['',],

    title: 'Coating Mechanic',
    rank: 'SS',
    health: '=',
    power: '+',
    speed: '+',
    image: 'https://files.catbox.moe/l8gfu8.png', 
    
    M2: {
    title: 'Dark King',
    rank: 'SS',
    health: '=',
    power: '++',
    speed: '++',
    image: 'https://files.catbox.moe/z8o8bw.png', 
    }, 
  
    M3: {
    title: 'Right Hand of the Pirate King',
    rank: 'UR',
    health: '+',
    power: '+',
    speed: '+',
    image: 'https://files.catbox.moe/tc2763.png', 
    }
  },
  {
    name: 'Richie',
    aliases: ['Richy',],

    title: 'Buggy Pirates',
    rank: 'B',
    health: '=',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/afyit4.jpg', 
    
    M2: {
    title: 'Buggy Pirates',
    rank: 'B',
    health: '+',
    power: '+',
    speed: '+',
    image: 'https://files.catbox.moe/snvibu.jpg', 
    }, 
  
    M3: {
    title: 'Cross Guild - Fat chud',
    rank: 'B',
    health: '-',
    power: '-',
    speed: '--',
    image: 'https://files.catbox.moe/ir5bt3.jpg', 
    }
  },
  {
    name: 'Superhuman Domingo 1',
    aliases: ['',],

    title: 'Buggy Pirates',
    rank: 'D',
    health: '=',
    power: '=',
    speed: '-',
    image: 'https://files.catbox.moe/ook9sn.png', 
    
    M2: {
    title: 'Buggy Pirates',
    rank: 'D',
    health: '+',
    power: '+',
    speed: '=',
    image: 'https://files.catbox.moe/hv10w2.png', 
    }, 
  
    M3: {
    title: 'Buggy Pirates',
    rank: 'D',
    health: '++',
    power: '++',
    speed: '+',
    image: 'https://files.catbox.moe/234cc5.png', 
    }
  },
  {
    name: 'Superhuman Domingo 2',
    aliases: ['',],

    title: 'Buggy Pirates',
    rank: 'D',
    health: '=',
    power: '=',
    speed: '-',
    image: 'https://files.catbox.moe/uz3l3g.png', 
    
    M2: {
    title: 'Buggy Pirates',
    rank: 'D',
    health: '+',
    power: '+',
    speed: '=',
    image: 'https://files.catbox.moe/usrvvg.png', 
    }, 
  
    M3: {
    title: 'Buggy Pirates',
    rank: 'D',
    health: '++',
    power: '++',
    speed: '+',
    image: 'https://files.catbox.moe/imbp7b.png', 
    }
  },
  {
    name: 'Superhuman Domingo 3',
    aliases: ['',],

    title: 'Buggy Pirates',
    rank: 'D',
    health: '=',
    power: '=',
    speed: '-',
    image: 'https://files.catbox.moe/ncxm3i.png', 
    
    M2: {
    title: 'Buggy Pirates',
    rank: 'D',
    health: '+',
    power: '+',
    speed: '=',
    image: 'https://files.catbox.moe/8yzt8l.png', 
    }, 
  
    M3: {
    title: 'Buggy Pirates',
    rank: 'D',
    health: '++',
    power: '++',
    speed: '+',
    image: 'https://files.catbox.moe/0qimab.png', 
    }
  },
  {
    name: 'Tamanegi',
    aliases: ['Onion',],

    title: 'Usopp Pirates',
    rank: 'D',
    health: '-',
    power: '=',
    speed: '-',
    image: 'https://files.catbox.moe/wpn841.png', 
    
    M2: {
    title: 'Usopp Security Force',
    rank: 'D',
    health: '=',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/9viijb.png', 
    }, 
  
    M3: {
    title: 'Usopp Security Force',
    rank: 'C',
    health: '-',
    power: '-',
    speed: '-',
    image: 'https://files.catbox.moe/0trnf8.png', 
    }
  },
  {
    name: 'Usopp',
    aliases: ['',],

    title: 'Usopp Pirates',
    rank: 'C',
    health: '-',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/tfbf2x.png', 
    
    M2: {
    title: 'Sogeking',
    rank: 'B',
    health: '-',
    power: '=',
    speed: '-',
    image: 'https://files.catbox.moe/w24pj8.png', 
    }, 
  
    M3: {
    title: 'Strawhat Pirates',
    rank: 'A',
    health: '-',
    power: '=',
    speed: '-',
    image: 'https://files.catbox.moe/g670b4.png', 
    }
  },
  {
    name: 'Joy Boy',
    aliases: ['joy boy', 'joyboy'],

    title: 'Pirate',
    rank: 'UR',
    health: 650,
    power: 120,
    speed: 52,
    image: 'https://files.catbox.moe/utdyht.png',

    M2: {
      title: 'Pirate',
      rank: 'UR',
      health: 665,
      power: 123,
      speed: 54,
      image: 'https://files.catbox.moe/7q0bj2.png'
    },

    M3: {
      title: 'Pirate',
      rank: 'UR',
      health: 670,
      power: 125,
      speed: 56,
      image: 'https://files.catbox.moe/c5fyzi.png'
    }
  },
  {
    name: 'St. Nerona Imu',
    aliases: ['imu'],

    title: 'King of the World',
    rank: 'UR',
    health: 690,
    power: 120,
    speed: 52,
    image: 'https://files.catbox.moe/tb2da9.png',

    M2: {
      title: 'King of the World',
      rank: 'UR',
      health: 695,
      power: 123,
      speed: 54,
      image: 'https://files.catbox.moe/djtq0l.png'
    },

    M3: {
      title: 'King of the World',
      rank: 'UR',
      health: 700,
      power: 125,
      speed: 56,
      image: 'https://files.catbox.moe/i9b7vg.png'
    }
  },
  {
    name: 'Rocks D. Xebec',
    aliases: ['rocks', 'rocks d. xebec', 'xebec', 'Davy d. Xebec',],

    title: 'Captain of the Rocks Pirates',
    rank: 'UR',
    health: 650,
    power: 118,
    speed: 50,
    image: 'https://files.catbox.moe/9twef1.png',

    M2: {
      title: 'Captain of the Rocks Pirates',
      rank: 'UR',
      health: 670,
      power: 120,
      speed: 52,
      image: 'https://files.catbox.moe/pfci2q.png'
    },

    M3: {
      title: 'Captain of the Rocks Pirates',
      rank: 'UR',
      health: 680,
      power: 122,
      speed: 55,
      image: 'https://files.catbox.moe/ucwtwi.png'
    }
  },
  {
    name: 'Gol D. Roger',
    aliases: ['roger', 'gol d. roger'],

    title: 'Captain of the Roger Pirates',
    rank: 'UR',
    health: 580,
    power: 115,
    speed: 50,
    image: 'https://files.catbox.moe/zt7crw.png',

    M2: {
      title: 'Captain of the Roger Pirates',
      rank: 'UR',
      health: 650,
      power: 118,
      speed: 52,
      image: 'https://files.catbox.moe/ywz5io.png'
    },

    M3: {
      title: 'Pirate King',
      rank: 'UR',
      health: 665,
      power: 120,
      speed: 54,
      image: 'https://files.catbox.moe/k4nfn6.png'
    }
  },
  {
    name: 'Edward Newgate',
    aliases: ['whitebeard', 'edward newgate'],

    title: 'Strongest Man in the World',
    rank: 'SS',
    health: 500,
    power: 97,
    speed: 43,
    image: 'https://files.catbox.moe/1kezbr.png',

    M2: {
      title: 'Captain of the Whitebeard Pirates',
      rank: 'SS',
      health: 520,
      power: 99,
      speed: 44,
      image: 'https://files.catbox.moe/png58a.png'
    },

    M3: {
      title: 'Strongest Man in the World',
      rank: 'UR',
      health: 680,
      power: 120,
      speed: 54,
      image: 'https://files.catbox.moe/azabt9.png'
    }
  },
  {
    name: 'Monkey D. Garp',
    aliases: ['garp', 'monkey d. garp'],

    title: 'Hero of the Marines',
    rank: 'SS',
    health: 555,
    power: 95,
    speed: 44,
    image: 'https://files.catbox.moe/vpmnja.png',

    M2: {
      title: 'Vice Admiral',
      rank: 'SS',
      health: 570,
      power: 98,
      speed: 45,
      image: 'https://files.catbox.moe/a3q39i.png'
    },

    M3: {
      title: 'Garp "the fist"',
      rank: 'UR',
      health: 670,
      power: 120,
      speed: 54,
      image: 'https://files.catbox.moe/ekecyd.png'
    }
  },
  {
    name: 'Figarland Garling',
    aliases: ['garling', 'figarland garling'],

    title: 'Supreme Commander of the Holy Knights',
    rank: 'UR',
    health: 580,
    power: 100,
    speed: 50,
    image: 'https://files.catbox.moe/hf368x.png',

    M2: {
      title: 'Gorosei',
      rank: 'UR',
      health: 680,
      power: 115,
      speed: 52,
      image: 'https://files.catbox.moe/8a6r70.png'
    },

    M3: {
      title: 'Gorosei',
      rank: 'UR',
      health: 700,
      power: 117,
      speed: 54,
      image: 'https://files.catbox.moe/ifxbfq.png'
    }
  },
  {
    name: 'Kaido',
    aliases: ['kaido', 'kaidou'],

    title: 'King of the Beasts',
    rank: 'UR',
    health: 670,
    power: 111,
    speed: 50,
    image: 'https://files.catbox.moe/852d4p.png',

    M2: {
      title: 'The Strongest Creature',
      rank: 'UR',
      health: 680,
      power: 112,
      speed: 52,
      image: 'https://files.catbox.moe/kl3poy.png'
    },

    M3: {
      title: 'Yonko of the sea',
      rank: 'UR',
      health: 695,
      power: 115,
      speed: 54,
      image: 'https://files.catbox.moe/pgi3k6.png'
    }
  },
  {
    name: 'Ryuma',
    aliases: ['ryuma', 'shimotsuki ryuma'],

    title: 'Thriller Bark Zombie',
    rank: 'A',
    health: 300,
    power: 70,
    speed: 28,
    image: 'https://files.catbox.moe/v6573v.png',

    M2: {
      title: 'Legendary Samurai - Wanted!',
      rank: 'SS',
      health: 505,
      power: 97,
      speed: 47,
      image: 'https://files.catbox.moe/ymqtsx.png'
    },

    M3: {
      title: 'God of the Blade',
      rank: 'UR',
      health: 580,
      power: 116,
      speed: 56,
      image: 'https://files.catbox.moe/k1gkh1.png'
    }
  },
  {
    name: 'Figarland Shamrock',
    aliases: ['shamrock', 'figarland shamrock'],

    title: 'Commander of Knights of God',
    rank: 'SS',
    health: 510,
    power: 95,
    speed: 45,
    image: 'https://files.catbox.moe/lwzf3l.png',

    M2: {
      title: 'Commander of Knights of God',
      rank: 'UR',
      health: 590,
      power: 115,
      speed: 54,
      image: 'https://files.catbox.moe/en9nbq.png'
    },

    M3: {
      title: 'Commander of Knights of God',
      rank: 'UR',
      health: 600,
      power: 117,
      speed: 55,
      image: 'https://files.catbox.moe/w3nmp7.png'
    }
  },
  {
    name: 'Dracule Mihawk',
    aliases: ['mihawk', 'dracule mihawk'],

    title: 'Strongest Swordsman in the World',
    rank: 'UR',
    health: 580,
    power: 113,
    speed: 52,
    image: 'https://files.catbox.moe/pk08dt.png',

    M2: {
      title: 'Warlord of the Sea',
      rank: 'UR',
      health: 590,
      power: 115,
      speed: 54,
      image: 'https://files.catbox.moe/r12lw2.png'
    },

    M3: {
      title: 'Cross Guild',
      rank: 'UR',
      health: 600,
      power: 118,
      speed: 56,
      image: 'https://files.catbox.moe/o9v79y.png'
    }
  },
  {
    name: 'Monkey D. Dragon',
    aliases: ['dragon', 'monkey d. dragon'],

    title: "World's Worst Criminal",
    rank: 'UR',
    health: 600,
    power: 114,
    speed: 52,
    image: 'https://files.catbox.moe/aoae8y.png',

    M2: {
      title: "Supreme Commander of the Revolutionary Army",
      rank: 'UR',
      health: 610,
      power: 116,
      speed: 53,
      image: 'https://files.catbox.moe/g375sj.png'
    },

    M3: {
      title: "Supreme Commander of the Revolutionary Army",
      rank: 'UR',
      health: 620,
      power: 119,
      speed: 55,
      image: 'https://files.catbox.moe/b3ps8t.png'
    }
  },
  {
    name: 'Monkey D. Luffy',
    aliases: ['luffy', 'monkey d. luffy'],

    title: 'Foosha Village',
    rank: 'B',
    health: 200,
    power: 40,
    speed: 15,
    image: 'https://files.catbox.moe/yegzbg.png',

    M2: {
      title: 'Worst Generation Pirate',
      rank: 'S',
      health: 460,
      power: 85,
      speed: 37,
      image: 'https://files.catbox.moe/hy6w44.png'
    },

    M3: {
      title: 'Joy Boy',
      rank: 'UR',
      health: 650,
      power: 113,
      speed: 57,
      image: 'https://files.catbox.moe/egnfql.png'
    }
  },
  {
    name: 'Marshall D. Teach',
    aliases: ['teach', 'blackbeard', 'marshall d. teach'],

    title: 'Blackbeard',
    rank: 'SS',
    health: 530,
    power: 94,
    speed: 41,
    image: 'https://files.catbox.moe/w4vqn3.png',

    M2: {
      title: 'Captain of the Blackbeard Pirates',
      rank: 'SS',
      health: 540,
      power: 100,
      speed: 42,
      image: 'https://files.catbox.moe/xq60yo.png'
    },

    M3: {
      title: 'Emperor of the New World',
      rank: 'UR',
      health: 630,
      power: 112,
      speed: 51,
      image: 'https://files.catbox.moe/93ymhp.png'
    }
  },
  {
    name: 'Sakazuki',
    aliases: ['sakazuki', 'akainu'],

    title: 'Admiral',
    rank: 'UR',
    health: 600,
    power: 106,
    speed: 52,
    image: 'https://files.catbox.moe/9cgpa9.png',

    M2: {
      title: 'Admiral',
      rank: 'UR',
      health: 610,
      power: 108,
      speed: 53,
      image: 'https://files.catbox.moe/fdule0.png'
    },

    M3: {
      title: 'Fleet Admiral',
      rank: 'UR',
      health: 620,
      power: 111,
      speed: 55,
      image: 'https://files.catbox.moe/s0xnu9.png'
    }
  },
  {
    name: 'Kuzan',
    aliases: ['kuzan', 'aokiji'],

    title: 'Admiral',
    rank: 'UR',
    health: 595,
    power: 106,
    speed: 53,
    image: 'https://files.catbox.moe/j9g39c.png',

    M2: {
      title: 'Admiral',
      rank: 'UR',
      health: 605,
      power: 108,
      speed: 54,
      image: 'https://files.catbox.moe/ydd1ni.png'
    },

    M3: {
      title: 'Blackbeard Pirates',
      rank: 'UR',
      health: 615,
      power: 111,
      speed: 56,
      image: 'https://files.catbox.moe/w91f9d.png'
    }
  },
  {
    name: 'Charlotte Linlin',
    aliases: ['linlin', 'big mom', 'charlotte linlin'],

    title: 'Big Mom',
    rank: 'UR',
    health: 660,
    power: 106,
    speed: 50,
    image: 'https://files.catbox.moe/vqj472.png',

    M2: {
      title: 'Big Mom',
      rank: 'UR',
      health: 670,
      power: 108,
      speed: 51,
      image: 'https://files.catbox.moe/u01vx0.png'
    },

    M3: {
      title: 'Emperor of the Sea',
      rank: 'UR',
      health: 680,
      power: 110,
      speed: 52,
      image: 'https://files.catbox.moe/z3p7zd.png'
    }
  },
  {
    name: 'Loki',
    aliases: ['loki'],

    title: 'Prince of Elbaf',
    rank: 'UR',
    health: 650,
    power: 104,
    speed: 50,
    image: 'https://files.catbox.moe/z9y293.png',

    M2: {
      title: 'Prince of Elbaf',
      rank: 'UR',
      health: 660,
      power: 106,
      speed: 51,
      image: 'https://files.catbox.moe/0wtg4e.png'
    },

    M3: {
      title: 'Prince of Elbaf',
      rank: 'UR',
      health: 670,
      power: 108,
      speed: 52,
      image: 'https://files.catbox.moe/0edviq.png'
    }
  },
  /*
  {
    name: '',
    aliases: ['',],

    title: '',
    rank: '',
    health: '=',
    power: '=',
    speed: '=',
    image: '', 
    
    M2: {
    title: '',
    rank: '',
    health: '=',
    power: '=',
    speed: '=',
    image: '', 
    }, 
  
    M3: {
    title: '',
    rank: '',
    health: '=',
    power: '=',
    speed: '=',
    image: '', 
    }
  },
  {
    name: '',
    aliases: ['',],

    title: '',
    rank: '',
    health: '=',
    power: '=',
    speed: '=',
    image: '', 
    
    M2: {
    title: '',
    rank: '',
    health: '=',
    power: '=',
    speed: '=',
    image: '', 
    }, 
  
    M3: {
    title: '',
    rank: '',
    health: '=',
    power: '=',
    speed: '=',
    image: '', 
    }
  },
  {
    name: '',
    aliases: ['',],

    title: '',
    rank: '',
    health: '=',
    power: '=',
    speed: '=',
    image: '', 
    
    M2: {
    title: '',
    rank: '',
    health: '=',
    power: '=',
    speed: '=',
    image: '', 
    }, 
  
    M3: {
    title: '',
    rank: '',
    health: '=',
    power: '=',
    speed: '=',
    image: '', 
    }
  },

  {
    name: '',
    aliases: ['',],

    title: '',
    rank: '',
    health: '=',
    power: '=',
    speed: '=',
    image: '', 
    
    M2: {
    title: '',
    rank: '',
    health: '=',
    power: '=',
    speed: '=',
    image: '', 
    }, 
  
    M3: {
    title: '',
    rank: '',
    health: '=',
    power: '=',
    speed: '=',
    image: '', 
    }
  },
  {
    name: '',
    aliases: ['',],

    title: '',
    rank: '',
    health: '=',
    power: '=',
    speed: '=',
    image: '', 
    
    M2: {
    title: '',
    rank: '',
    health: '=',
    power: '=',
    speed: '=',
    image: '', 
    }, 
  
    M3: {
    title: '',
    rank: '',
    health: '=',
    power: '=',
    speed: '=',
    image: '', 
    }
  },
  {
    name: '',
    aliases: ['',],

    title: '',
    rank: '',
    health: '=',
    power: '=',
    speed: '=',
    image: '', 
    
    M2: {
    title: '',
    rank: '',
    health: '=',
    power: '=',
    speed: '=',
    image: '', 
    }, 
  
    M3: {
    title: '',
    rank: '',
    health: '=',
    power: '=',
    speed: '=',
    image: '', 
    }
  },
  
  */
];

// Run validation once at startup — logs warnings for any bad card data
validateAllCards(cards);

// --- 3. EXPORT ---
// This allows other files (like your gacha command) to read this data
// Export everything so other command files can import what they need
module.exports = { rankConfig, cards, resolveStat, safeRank, safeStat, rankEmojis };
