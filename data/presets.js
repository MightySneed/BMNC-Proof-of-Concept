/*
 * Starter content for the BMNC proof of concept.
 * IDs are stable data keys so these presets can later move into JSON or a backend
 * without changing combat-resolution code.
 */
const CHARACTER_PRESETS = {
  guts: {
    name: "Guts",
    primaries: { body: 2, nerve: 1, character: 1 },
    substats: {
      strength: 2, toughness: 1, con: 1, woundCap: 1,
      dexterity: 1, initiative: 1, hc: 0, finesse: 0,
      quickActions: 0, gumption: 1, charisma: 0
    },
    armor: { 1: 1, 2: 2, 3: 1, 4: 1, 5: 1, 6: 1 },
    pegs: {
      1: { dexterity: 1 },
      2: { strength: 1, con: 1, gumption: 1 },
      3: { strength: 1 },
      5: { initiative: 1 }
    }
  },
  duelist: {
    name: "Agile Duelist",
    primaries: { body: 1, nerve: 3, character: 1 },
    substats: {
      strength: 1, toughness: 1, con: 0, woundCap: 0,
      dexterity: 2, initiative: 2, hc: 1, finesse: 2,
      quickActions: 2, gumption: 1, charisma: 0
    },
    armor: { 1: 1, 2: 1, 3: 0, 4: 0, 5: 1, 6: 1 },
    pegs: {
      1: { gumption: 1 },
      3: { finesse: 1, quickActions: 1 },
      4: { strength: 1, finesse: 1, quickActions: 1 },
      5: { dexterity: 1, initiative: 1 },
      6: { dexterity: 1 },
      7: { initiative: 1 }
    }
  },
  goblin: {
    name: "Goblin Bruiser",
    primaries: { body: 1, nerve: 1, character: 1 },
    substats: {
      strength: 1, toughness: 1, con: 0, woundCap: 0,
      dexterity: 1, initiative: 0, hc: 0, finesse: 0,
      quickActions: 0, gumption: 1, charisma: 0
    },
    armor: { 1: 1, 2: 1, 3: 0, 4: 0, 5: 0, 6: 0 },
    pegs: {
      1: { dexterity: 1, gumption: 1 },
      2: { strength: 1 }
    }
  },
  guard: {
    name: "Balanced Guard",
    primaries: { body: 2, nerve: 2, character: 1 },
    substats: {
      strength: 1, toughness: 1, con: 1, woundCap: 1,
      dexterity: 1, initiative: 1, hc: 1, finesse: 1,
      quickActions: 1, gumption: 1, charisma: 0
    },
    armor: { 1: 1, 2: 2, 3: 1, 4: 1, 5: 1, 6: 1 },
    pegs: {
      1: { dexterity: 1, gumption: 1 },
      2: { con: 1 },
      3: { quickActions: 1 },
      4: { strength: 1, finesse: 1 },
      5: { initiative: 1 },
      6: { }
    }
  }
};

const WEAPON_PRESETS = {
  greatsword: { name: "Greatsword", diceSides: 8, scaling: "strength", flatDmg: 2, ap: 3 },
  sabre: { name: "Sabre", diceSides: 6, scaling: "finesse", flatDmg: 1, ap: 1 },
  unarmed: { name: "Unarmed", diceSides: 4, scaling: "none", flatDmg: 0, ap: 0 },
  scrapClub: { name: "Scrap Club", diceSides: 6, scaling: "strength", flatDmg: 0, ap: 0 },
  spear: { name: "Spear", diceSides: 8, scaling: "strength", flatDmg: 1, ap: 1 }
};
