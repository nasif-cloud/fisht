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
    M1: { color: 0x5A5B5A, icon: 'https://files.catbox.moe/kenmyv.png' }, // dark Grey
    M2: { color: 0x5A5B5A, icon: 'https://files.catbox.moe/eg0wb5.png' },
    M3: { color: 0x5A5B5A, icon: 'https://files.catbox.moe/wxv1gy.png' }
  },

  C: {
    M1: { color: 0x8C6F47, icon: 'https://files.catbox.moe/9iyo0q.png' }, // Bronze
    M2: { color: 0x8C6F47, icon: 'https://files.catbox.moe/644ohm.png' },
    M3: { color: 0x8C6F47, icon: 'https://files.catbox.moe/mc9iga.png' }
  },

  B: {
    M1: { color: 0x9CA4A2, icon: 'https://files.catbox.moe/s3k992.png' }, // White silverish
    M2: { color: 0x9CA4A2, icon: 'https://files.catbox.moe/3u9v5m.png' },
    M3: { color: 0x9CA4A2, icon: 'https://files.catbox.moe/ohhtfv.png' }
  },

  A: {
    M1: { color: 0x3697A7, icon: 'https://files.catbox.moe/o2k4dl.png' }, // Light blue
    M2: { color: 0x3697A7, icon: 'https://files.catbox.moe/6je064.png' },
    M3: { color: 0x3697A7, icon: 'https://files.catbox.moe/5op31h.png' }
  },

  S: {
    M1: { color: 0x8C6BBD, icon: 'https://files.catbox.moe/bx9psr.png' }, // Light purple
    M2: { color: 0x8C6BBD, icon: 'https://files.catbox.moe/77hvxf.png' },
    M3: { color: 0x8C6BBD, icon: 'https://files.catbox.moe/nacr7l.png' }
  },

  SS: {
    M1: { color: 0x0D522E, icon: 'https://files.catbox.moe/je61w4.png' }, // Emerald green
    M2: { color: 0x0D522E, icon: 'https://files.catbox.moe/xcu1xi.png' },
    M3: { color: 0x0D522E, icon: 'https://files.catbox.moe/z9ok4x.png' }
  },

  UR: {
    M1: { color: 0x7D376B, icon: 'https://files.catbox.moe/2cqyoo.png' }, // Ruby
    M2: { color: 0x7D376B, icon: 'https://files.catbox.moe/c10sc7.png' },
    M3: { color: 0x7D376B, icon: 'https://files.catbox.moe/g137vf.png' }
  }
};

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
//   A RANDOM value is picked inside the matching zone, so two cards
//   with the same rank and filter will still have slightly different stats.
//
// SPECIAL RULE FOR HEALTH:
//   Health values are always rounded UP to the nearest 5 (e.g. 173 → 175).
//   This keeps HP clean and avoids awkward numbers like 173 or 181.
function resolveStat(rank, statType, value) {
  // If the stat is already a plain number, just return it as-is
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

  // Pick a random number within the zone and round it to the nearest whole number
  let result = Math.round(Math.random() * (zoneMax - zoneMin) + zoneMin);

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
  UR: '', // ← paste your UR emoji here
  SS: '', // ← paste your SS emoji here
  S:  '', // ← paste your S  emoji here
  A:  '', // ← paste your A  emoji here
  B:  '', // ← paste your B  emoji here
  C:  '', // ← paste your C  emoji here
  D:  ''  // ← paste your D  emoji here
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
  
    id: 'MDL', 
    name: 'Monkey D. Luffy',
    aliases: ['Sun god Nika', 'Warrior of liberation', 'strawhat', 'luffy',],


    title: 'Strawhat Luffy',
    rank: 'B',
    health: 175,
    power: 35,
    speed: 15,
    image: 'https://files.catbox.moe/nhv0lv.png', 
    
  
    M2: {
      title: 'Captain of the Strawhat Pirates',
      rank: 'S', 
      health: 460,
      power: 84,
      speed: 34,
      image: 'https://files.catbox.moe/fkfmh2.png'
    },
    
 
    M3: {
      title: 'Warrior of Libration',
      rank: 'UR',
      health: 660,
      power: 113,
      speed: 53,
      image: 'https://files.catbox.moe/6yvdik.png'
    }
  },
  {
  
    name: 'Gill Bastar',
    aliases: ['Gill Bastar',],


    title: 'Pirate - Wanted!',
    rank: 'A',
    health: '-',
    power: '+',
    speed: '-',
    image: 'https://files.catbox.moe/c1glfx.webp', 
    
  
    M2: {
      title: 'Outlaw - Wanted!',
      rank: 'A', 
      health: '=',
      power: '+',
      speed: '=',
      image: 'https://files.catbox.moe/lkabpg.webp'
    },
    
 
    M3: {
      title: 'Thriller Bark Zombie',
      rank: 'S',
      health: '-',
      power: '+',
      speed: '-',
      image: 'https://files.catbox.moe/1bzw7m.webp'
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
    image: 'https://files.catbox.moe/sqyrkz.webp', 
    
  
    M2: {
      title: 'Swordsman - MONSTERS',
      rank: 'B', 
      health: '=',
      power: '++',
      speed: '+',
      image: 'https://files.catbox.moe/53ggt1.webp'
    },
    
 
    M3: {
      title: 'Swordsman',
      rank: 'A',
      health: '-',
      power: '+',
      speed: '=',
      image: 'https://files.catbox.moe/90xqrv.webp'
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
    image: 'https://files.catbox.moe/vwj7qy.webp', 
    
  
    M2: {
      title: 'Waitress - MONSTERS',
      rank: 'D', 
      health: '=',
      power: '=',
      speed: '=',
      image: 'https://files.catbox.moe/rtznsh.webp'
    },
    
 
    M3: {
      title: 'Waitress',
      rank: 'C',
      health: '-',
      power: '-',
      speed: '-',
      image: 'https://files.catbox.moe/pgf05l.webp'
    }
  },
  {
  
    name: 'Shimotsuki Ryuma',
    aliases: ['Ryuma',],


    title: 'Legendary Samurai - MONSTERS',
    rank: 'S',
    health: '-',
    power: '+',
    speed: '=',
    image: 'https://files.catbox.moe/sd79uc.webp', 
    
  
    M2: {
      title: 'Thriller Bark Zombie',
      rank: 'S', 
      health: '=',
      power: '++',
      speed: '+',
      image: 'https://files.catbox.moe/2ua0en.webp'
    },
    
 
    M3: {
      title: 'God of the Blade',
      rank: 'SS',
      health: '-',
      power: '+',
      speed: '=',
      image: 'https://files.catbox.moe/jqj853.webp'
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
    image: 'https://files.catbox.moe/m6khxi.webp', 
    
    M2: {
      title: 'Swordsman - MONSTERS',
      rank: 'B', 
      health: '=',
      power: '+',
      speed: '=',
      image: 'https://files.catbox.moe/uu2mwh.webp'
    }, 
  
    M3: {
      title: 'Swordsman',
      rank: 'A',
      health: '-',
      power: '=',
      speed: '-',
      image: 'https://files.catbox.moe/stalzr.webp',
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
    image: 'https://files.catbox.moe/6di7he.webp', 
    
    M2: {
      title: 'Buggy Pirates',
      rank: 'B', 
      health: '-',
      power: '=',
      speed: '-',
      image: 'https://files.catbox.moe/95714k.webp'
    }, 
  
    M3: {
      title: 'Cross Guild',
      rank: 'A',
      health: '-',
      power: '-',
      speed: '-',
      image: 'https://files.catbox.moe/rv7sjr.webp',
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
    image: 'https://files.catbox.moe/1nqenf.webp', 
    
    M2: {
      title: 'Zoro\'s Friend',
      rank: 'C', 
      health: '=',
      power: '++',
      speed: '+',
      image: 'https://files.catbox.moe/sxai2t.webp'
    }, 
  
    M3: {
      title: 'Swordswoman',
      rank: 'B',
      health: '-',
      power: '+',
      speed: '=',
      image: 'https://files.catbox.moe/7hhfao.webp',
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
    image: 'https://files.catbox.moe/07xxir.webp', 
    
    M2: {
      title: 'Marine Lieutenant Commander',
      rank: 'B', 
      health: '=',
      power: '=',
      speed: '-',
      image: 'https://files.catbox.moe/degsdc.webp'
    }, 
  
    M3: {
      title: 'Marine Captain',
      rank: 'B',
      health: '+',
      power: '+',
      speed: '=',
      image: 'https://files.catbox.moe/x1g8vp.webp',
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
    image: 'https://files.catbox.moe/1p1q2l.webp', 
    
    M2: {
      title: 'Rika\'s Mother',
      rank: 'D', 
      health: '=',
      power: '=',
      speed: '=',
      image: 'https://files.catbox.moe/lp6zrk.webp'
    }, 
  
    M3: {
      title: 'Rika\'s Mother',
      rank: 'D',
      health: '+',
      power: '+',
      speed: '+',
      image: 'https://files.catbox.moe/hb598j.webp',
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
    image: 'https://files.catbox.moe/vn8lmp.webp', 
    
    M2: {
      title: 'Chore boy',
      rank: 'C', 
      health: '=',
      power: '=',
      speed: '=',
      image: 'https://files.catbox.moe/uihqgj.webp'
    }, 
  
    M3: {
      title: 'Lieutenant Commander',
      rank: 'B',
      health: '=',
      power: '=',
      speed: '=',
      image: 'https://files.catbox.moe/pi2dzs.webp',
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
    image: 'https://files.catbox.moe/4wo6qd.webp', 
    
    M2: {
      title: 'Young Girl from Shells Town',
      rank: 'D', 
      health: '=',
      power: '=',
      speed: '=',
      image: 'https://files.catbox.moe/c625pg.webp'
    }, 
  
    M3: {
      title: 'Marine Waitress',
      rank: 'C',
      health: '-',
      power: '-',
      speed: '-',
      image: 'https://files.catbox.moe/oory1k.webp',
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
    image: 'https://files.catbox.moe/m205vb.webp', 
  },
  {
    name: 'Roronoa Zoro',
    aliases: ['Zoro',],

    title: 'Pirate Hunter',
    rank: 'B',
    health: '=',
    power: '+',
    speed: '=',
    image: 'https://files.catbox.moe/6ba6xr.webp', 
    
    M2: {
      title: 'Worst Generation Pirate',
      rank: 'A', 
      health: '=',
      power: '+',
      speed: '=',
      image: 'https://files.catbox.moe/7wsd4b.webp'
    }, 
  
    M3: {
      title: 'King of Hell',
      rank: 'SS',
      health: '=',
      power: '=',
      speed: '=',
      image: 'https://files.catbox.moe/wi5mbm.webp',
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
    image: 'https://files.catbox.moe/nhz48j.webp', 
    
    M2: {
      title: 'Alvida Pirates',
      rank: 'D', 
      health: '=',
      power: '=',
      speed: '=',
      image: 'https://files.catbox.moe/33ped9.webp'
    }, 
  
    M3: {
      title: 'Alvida Pirates',
      rank: 'D',
      health: '+',
      power: '+',
      speed: '+',
      image: 'https://files.catbox.moe/5ybxy6.webp',
    }
  },
  {
    name: 'Hoppoko',
    aliases: ['Hoppoko',],

    title: 'Alvida Pirates',
    rank: 'D',
    health: '-',
    power: '-',
    speed: '-',
    image: 'https://files.catbox.moe/sdxqvv.webp', 
    
    M2: {
      title: 'Alvida Pirates',
      rank: 'D', 
      health: '=',
      power: '=',
      speed: '=',
      image: 'https://files.catbox.moe/jiatfo.webp'
    }, 
  
    M3: {
      title: 'Alvida Pirates',
      rank: 'D',
      health: '+',
      power: '+',
      speed: '+',
      image: 'https://files.catbox.moe/3jnd8e.webp',
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
    image: 'https://files.catbox.moe/xj8ca0.webp', 
    
    M2: {
      title: 'Alvida Pirates',
      rank: 'D', 
      health: '=',
      power: '=',
      speed: '=',
      image: 'https://files.catbox.moe/2c6hv9.webp'
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
    image: 'https://files.catbox.moe/gwd0gv.webp', 
    
    M2: {
      title: 'Master Chief Petty Officer',
    rank: 'C',
    health: '-',
    power: '=',
    speed: '-',
    image: 'https://files.catbox.moe/widrsk.webp', 
    }, 
  
    M3: {
      title: 'Marine Captain',
      rank: 'A', 
      health: '-',
      power: '+',
      speed: '-',
      image: 'https://files.catbox.moe/mai8dm.webp'
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
    image: 'https://files.catbox.moe/iyik88.webp', 
    
    M2: {
      title: 'Strawhat Pirates',
      rank: 'A', 
      health: '-',
      power: '-',
      speed: '-',
      image: 'https://files.catbox.moe/daq37n.webp'
    }, 
  
    M3: {
      title: 'Strawhat Pirates',
      rank: 'S',
      health: '-',
      power: '=',
      speed: '-',
      image: 'https://files.catbox.moe/tennjq.webp',
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
    image: 'https://files.catbox.moe/dea0pm.webp', 
    
    M2: {
    title: 'Partys Bar Owner',
    rank: 'C',
    health: '=',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/oqhpqz.webp', 
    }, 
  
    M3: {
    title: 'Partys Bar Owner',
    rank: 'B',
    health: '-',
    power: '-',
    speed: '-',
    image: 'https://files.catbox.moe/8e7bgd.webp', 
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
    image: 'https://files.catbox.moe/qvwrtl.webp', 
    
    M2: {
    title: 'Red Hair Pirates',
    rank: 'B',
    health: '+',
    power: '+',
    speed: '+',
    image: 'https://files.catbox.moe/6ks07l.webp', 
    }, 
  
    M3: {
    title: 'Red Hair Pirates',
    rank: 'A',
    health: '=',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/50qrqp.webp', 
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
    image: 'https://files.catbox.moe/jqqnfp.webp', 
    
    M2: {
    title: 'Red Hair Pirates',
    rank: 'B',
    health: '++',
    power: '+',
    speed: '=',
    image: 'https://files.catbox.moe/ri2f40.webp', 
    }, 
  
    M3: {
    title: 'Red Hair Pirates',
    rank: 'A',
    health: '+',
    power: '=',
    speed: '-',
    image: 'https://files.catbox.moe/bhb723.webp', 
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
    image: 'https://files.catbox.moe/yx6q71.webp', 
    
    M2: {
    title: 'Buggy Pirates',
    rank: 'D',
    health: '=',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/cwxrug.webp', 
    }, 
  
    M3: {
    title: 'Buggy Pirates',
    rank: 'D',
    health: '+',
    power: '+',
    speed: '+',
    image: 'https://files.catbox.moe/2lta03.webp', 
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
    image: 'https://files.catbox.moe/ka2l8d.webp', 
    
    M2: {
    title: 'Buggy Pirates',
    rank: 'D',
    health: '=',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/xhlmd9.webp', 
    }, 
  
    M3: {
    title: 'Buggy Pirates',
    rank: 'D',
    health: '+',
    power: '+',
    speed: '+',
    image: 'https://files.catbox.moe/wnysfl.webp', 
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
    image: 'https://files.catbox.moe/bxqvhl.webp', 
    
    M2: {
    title: 'Buggy Pirates',
    rank: 'D',
    health: '=',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/ttqukw.webp', 
    }, 
  
    M3: {
    title: 'Buggy Pirates',
    rank: 'D',
    health: '+',
    power: '+',
    speed: '+',
    image: 'https://files.catbox.moe/97vp14.webp', 
    }
  },
  {
    name: 'Figarland Shanks',
    aliases: ['Shanks', 'Red Hair'],

    title: 'Red Hair Pirates Captain',
    rank: 'S',
    health: '=',
    power: '+',
    speed: '+',
    image: 'https://files.catbox.moe/nzudbg.webp', 
    
    M2: {
    title: 'Emperor of the Sea',
    rank: 'SS',
    health: '=',
    power: '+',
    speed: '+',
    image: 'https://files.catbox.moe/dgaouc.webp', 
    }, 
  
    M3: {
    title: 'Emperor of the New World',
    rank: 'UR',
    health: '=',
    power: '+',
    speed: '+',
    image: 'https://files.catbox.moe/y890nm.webp', 
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
    image: 'https://files.catbox.moe/jcx816.webp', 
    
    M2: {
    title: 'Marine Commander',
    rank: 'C',
    health: '+',
    power: '+',
    speed: '+',
    image: 'https://files.catbox.moe/76hqqr.webp', 
    }, 
  
    M3: {
    title: 'Marine Commander',
    rank: 'B',
    health: '=',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/r6bmxp.webp', 
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
    image: 'https://files.catbox.moe/se16rt.webp', 
    
    M2: {
    title: 'The Genius Jester',
    rank: 'A',
    health: '=',
    power: '-',
    speed: '=',
    image: 'https://files.catbox.moe/7g2ix3.webp', 
    }, 
  
    M3: {
    title: 'Emperor of the New World',
    rank: 'S',
    health: '=',
    power: '-',
    speed: '=',
    image: 'https://files.catbox.moe/9qm48f.webp', 
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
    image: 'https://files.catbox.moe/cb2vkx.webp', 
    
    M2: {
    title: 'Marine Seasman Recruit',
    rank: 'D',
    health: '+',
    power: '+',
    speed: '+',
    image: 'https://files.catbox.moe/w7o90r.webp', 
    }, 
  
    M3: {
    title: 'Marine Seasman Recruit',
    rank: 'D',
    health: '++',
    power: '++',
    speed: '++',
    image: 'https://files.catbox.moe/g4vgzs.webp', 
    }
  },
  {
    name: '',
    aliases: ['',],

    title: 'Marine Lieutenant Junior Grade',
    rank: 'D',
    health: '=',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/mlj0bt.webp', 
    
    M2: {
    title: 'Marine Lieutenant Junior Grade',
    rank: 'D',
    health: '+',
    power: '+',
    speed: '+',
    image: 'https://files.catbox.moe/69af0r.webp', 
    }, 
  
    M3: {
    title: 'Marine Lieutenant Junior Grade',
    rank: 'C',
    health: '=',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/0dv3nk.webp', 
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
    image: 'https://files.catbox.moe/l2swfd.webp', 
    
    M2: {
    title: 'Foosha Village Mayor',
    rank: 'C',
    health: '=',
    power: '=',
    speed: '=',
    image: 'https://files.catbox.moe/v31bqm.webp', 
    }, 
  
    M3: {
    title: 'Foosha Village Mayor',
    rank: 'B',
    health: '-',
    power: '-',
    speed: '-',
    image: 'https://files.catbox.moe/z3zahn.webp', 
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
    image: 'https://files.catbox.moe/7h7kv5.webp', 
    
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
    rank: 'A',
    health: '=',
    power: '+',
    speed: '=',
    image: 'https://files.catbox.moe/nklm96.webp', 
    
    M2: {
    title: 'Red Hair Pirates',
    rank: 'S',
    health: '-',
    power: '+',
    speed: '=',
    image: 'https://files.catbox.moe/5im0b6.webp', 
    }, 
  
    M3: {
    title: 'Red Hair Pirates',
    rank: 'S',
    health: '=',
    power: '++',
    speed: '+',
    image: 'https://files.catbox.moe/ho9b7z.webp', 
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
