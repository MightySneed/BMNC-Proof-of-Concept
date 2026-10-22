class Weapon {
  constructor({ name, hitMod, diceSides, scaling, flatDmg, ap }) {
    this.name = name;
    this.hitMod = hitMod;
    this.diceSides = diceSides;
    this.scaling = scaling;
    this.flatDmg = flatDmg;
    this.ap = ap;
  }
}

class Fighter {
  constructor(name, primaries, substats, weapon, armorMap, vitalsMap) {
    this.name = name;
    this.primaries = primaries; 
    this.substats = substats;   
    this.equippedWeapon = weapon;
    
    this.actions = { base: 1, quick: this.substats.quickActions || 0 };
    this.isUnconscious = false;
    this.isDead = false;
    this.statuses = { brokenDefense: false };

    // 7 Hit Locations (1-6 Physical, 7 Aura/System)
    // Custom Vital settings can be passed in
    this.bodyPlan = {
      1: { name: "Head", state: "untouched", armor: armorMap[1] || 0, isVital: vitalsMap ? vitalsMap[1] : true },
      2: { name: "Torso", state: "untouched", armor: armorMap[2] || 0, isVital: vitalsMap ? vitalsMap[2] : false },
      3: { name: "Left Arm", state: "untouched", armor: armorMap[3] || 0, isVital: vitalsMap ? vitalsMap[3] : false },
      4: { name: "Right Arm", state: "untouched", armor: armorMap[4] || 0, isVital: vitalsMap ? vitalsMap[4] : false },
      5: { name: "Left Leg", state: "untouched", armor: armorMap[5] || 0, isVital: vitalsMap ? vitalsMap[5] : false },
      6: { name: "Right Leg", state: "untouched", armor: armorMap[6] || 0, isVital: vitalsMap ? vitalsMap[6] : false },
      7: { name: "Aura/System", state: "untouched", armor: 0, isVital: vitalsMap ? vitalsMap[7] : false }
    };
  }

  get baseToughness() { return 5 + this.substats.toughness; }
  get baseHitClass() { return 10 + this.substats.hc; }
  get currentWoundCap() { return 1 + (this.substats.woundCap || 0); }

  get totalGrazes() { return Object.values(this.bodyPlan).filter(l => l.state === "grazed").length; }
  get totalInjuries() { return Object.values(this.bodyPlan).filter(l => l.state === "injured" || l.state === "destroyed").length; }
  get totalWoundsSum() { return this.totalGrazes + this.totalInjuries; }

  resetTurnActions() {
    this.actions.base = 1;
    this.actions.quick = this.substats.quickActions || 0;
  }

  // Fully restore character state for rematches
  resetFullState() {
    this.isDead = false;
    this.isUnconscious = false;
    this.statuses.brokenDefense = false;
    this.resetTurnActions();
    Object.values(this.bodyPlan).forEach(loc => loc.state = "untouched");
  }
}

let f1, f2, combatQueue = [], activeIndex = 0, currentRound = 1;

function d20() { return Math.floor(Math.random() * 20) + 1; }
function d10() { return Math.floor(Math.random() * 10) + 1; }
function d6() { return Math.floor(Math.random() * 6) + 1; }

function log(msg, cls = "") {
  const el = document.getElementById("combatLog");
  if (!el) return;
  const d = document.createElement("div");
  d.className = `log-entry ${cls}`;
  d.innerText = msg;
  el.appendChild(d);
  el.scrollTop = el.scrollHeight;
}

const subStatDefs = [
  { key: "strength", label: "Strength", parent: "body" },
  { key: "toughness", label: "Toughness", parent: "body", isDoubleCost: true },
  { key: "con", label: "Constitution", parent: "body" },
  { key: "woundCap", label: "Wound Capacity", parent: "body", isWoundCap: true, isDoubleCost: true },
  { key: "initiative", label: "Initiative Bonus", parent: "nerve" },
  { key: "hc", label: "Hit Class", parent: "nerve" },
  { key: "hitMod", label: "Hit Modifier", parent: "nerve" },
  { key: "finesse", label: "Finesse", parent: "nerve" },
  { key: "quickActions", label: "Quick Actions", parent: "nerve" },
  { key: "gumption", label: "Gumption", parent: "character" },
  { key: "charisma", label: "Charisma", parent: "character" }
];

function calcCumulativeXP(lvl) {
  return (lvl * (lvl + 1)) / 2;
}

function calculateTotalXP(id) {
  let totalXP = 0;

  const pBody = parseInt(document.getElementById(`f${id}-p-body`).value) || 0;
  const pNerve = parseInt(document.getElementById(`f${id}-p-nerve`).value) || 0;
  const pChar = parseInt(document.getElementById(`f${id}-p-char`).value) || 0;

  // Primary stats standard cost
  totalXP += calcCumulativeXP(pBody) + calcCumulativeXP(pNerve) + calcCumulativeXP(pChar);

  // Sub-stats cost check
  subStatDefs.forEach(s => {
    const el = document.getElementById(`f${id}-s-${s.key}`);
    if (el) {
      const val = parseInt(el.value) || 0;
      const multiplier = s.isDoubleCost ? 2 : 1;
      totalXP += calcCumulativeXP(val) * multiplier;
    }
  });

  const xpDisplay = document.getElementById(`f${id}-xp`);
  if (xpDisplay) xpDisplay.innerText = `Total XP Spent: ${totalXP}`;
}

function buildCreatorUI() {
  [1, 2].forEach(id => {
    const bodyCap = parseInt(document.getElementById(`f${id}-p-body`).value) || 0;
    const nerveCap = parseInt(document.getElementById(`f${id}-p-nerve`).value) || 0;
    const charCap = parseInt(document.getElementById(`f${id}-p-char`).value) || 0;

    const caps = { body: bodyCap, nerve: nerveCap, character: charCap };
    const container = document.getElementById(`f${id}-substats`);
    if (!container) return;
    container.innerHTML = "";

    subStatDefs.forEach(s => {
      let maxLevel = caps[s.parent];
      if (s.isWoundCap) maxLevel = Math.floor(bodyCap / 2);

      container.innerHTML += `
        <div class="stat-row">
          <span>${s.label} ${s.isDoubleCost ? "⚡(2x XP)" : ""} (Max ${maxLevel}):</span>
          <input type="number" id="f${id}-s-${s.key}" value="0" min="0" max="${maxLevel}" onchange="calculateTotalXP(${id})">
        </div>
      `;
    });

    calculateTotalXP(id);
  });
}

// Initial UI Build
buildCreatorUI();

function startBattle() {
  function readFighter(id) {
    const name = document.getElementById(`f${id}-name`).value;
    const primaries = {
      body: parseInt(document.getElementById(`f${id}-p-body`).value) || 0,
      nerve: parseInt(document.getElementById(`f${id}-p-nerve`).value) || 0,
      character: parseInt(document.getElementById(`f${id}-p-char`).value) || 0
    };

    const substats = {};
    subStatDefs.forEach(s => {
      substats[s.key] = parseInt(document.getElementById(`f${id}-s-${s.key}`).value) || 0;
    });

    const weapon = new Weapon({
      name: document.getElementById(`f${id}-w-name`).value,
      hitMod: parseInt(document.getElementById(`f${id}-w-hit`).value) || 0,
      diceSides: parseInt(document.getElementById(`f${id}-w-dice`).value) || 6,
      scaling: document.getElementById(`f${id}-w-scale`).value,
      flatDmg: parseInt(document.getElementById(`f${id}-w-flat`).value) || 0,
      ap: parseInt(document.getElementById(`f${id}-w-ap`).value) || 0
    });

    const armorMap = {};
    for (let i = 1; i <= 6; i++) {
      armorMap[i] = parseInt(document.getElementById(`f${id}-ar-${i}`).value) || 0;
    }

    return new Fighter(name, primaries, substats, weapon, armorMap);
  }

  f1 = readFighter(1);
  f2 = readFighter(2);

  document.getElementById("setupScreen").style.display = "none";
  document.getElementById("battleScreen").style.display = "block";

  restartMatch();
}

// Resets fight and restarts Round 1 with same characters
function restartMatch() {
  if (!f1 || !f2) return;

  f1.resetFullState();
  f2.resetFullState();

  document.getElementById("combatLog").innerHTML = "";

  combatQueue = [f1, f2].sort((a, b) => b.substats.initiative - a.substats.initiative);
  activeIndex = 0;
  currentRound = 1;

  log(`========================================`, "log-round");
  log(`--- ROUND 1 START ---`, "log-round");
  log(`Turn Order: ${combatQueue[0].name} (Init +${combatQueue[0].substats.initiative}) -> ${combatQueue[1].name} (Init +${combatQueue[1].substats.initiative})`, "log-round");

  startTurn(combatQueue[0]);
}

// TURN ACTIVATION: Handles Vital Death and Consciousness Checks at Start of Turn
function startTurn(char) {
  char.resetTurnActions();

  if (char.isDead || char.isUnconscious) {
    log(`⏭️ ${char.name} is incapacitated and skips their turn.`);
    updateUI();
    return;
  }

  log(`\n▶️ ${char.name}'s Activation Start.`);

  // 1. Check Vital Location Death
  let vitalDestroyed = false;
  Object.values(char.bodyPlan).forEach(loc => {
    if (loc.isVital && loc.state === "destroyed") vitalDestroyed = true;
  });

  if (vitalDestroyed) {
    char.isDead = true;
    log(`☠️ FATAL INJURY RESOLVED! ${char.name} suffered a destroyed vital location and succumbs at turn start!`, "log-damage");
    updateUI();
    return;
  }

  // 2. Check Gumption Consciousness Check
  const injuries = char.totalInjuries;
  const woundsSum = char.totalWoundsSum;

  if (injuries > char.currentWoundCap) {
    char.isUnconscious = true;
    log(`💤 ${char.name} has ${injuries} Injuries (Exceeds Wound Cap of ${char.currentWoundCap}) and passes out!`, "log-damage");
  } else if (injuries >= char.currentWoundCap) {
    const roll = d20();
    const total = roll + char.substats.gumption - woundsSum;
    log(`🧠 Gumption Check: d20(${roll}) + Gump(${char.substats.gumption}) - Wounds(${woundsSum}) = ${total} (Needs > 10)`, "log-check");

    if (total <= 10) {
      char.isUnconscious = true;
      log(`💤 CHECK FAILED! ${char.name} falls UNCONSCIOUS!`, "log-damage");
    } else {
      log(`✨ CHECK PASSED! ${char.name} stays on their feet!`);
    }
  }

  updateUI();
}

function nextTurn() {
  if (!combatQueue.length) return;

  activeIndex++;
  if (activeIndex >= combatQueue.length) {
    activeIndex = 0;
    currentRound++;
    log(`\n========================================`, "log-round");
    log(`--- ROUND ${currentRound} START ---`, "log-round");
    log(`========================================`, "log-round");
  }
  startTurn(combatQueue[activeIndex]);
}

function convertAction(fromType, toType) {
  const char = combatQueue[activeIndex];
  if (!char) return;

  if (fromType === "base" && toType === "quick") {
    if (char.actions.base >= 1) {
      char.actions.base -= 1;
      char.actions.quick += 2;
      log(`⚡ ${char.name} converted 1 Base Action into 2 Quick Actions.`);
    }
  } else if (fromType === "quick" && toType === "base") {
    if (char.actions.quick >= 2) {
      char.actions.quick -= 2;
      char.actions.base += 1;
      log(`⚡ ${char.name} converted 2 Quick Actions into 1 Base Action.`);
    }
  }
  updateUI();
}

function executeBreak() {
  const attacker = combatQueue[activeIndex];
  const defender = attacker === f1 ? f2 : f1;

  if (!attacker || !defender) return;

  if (attacker.actions.base <= 0) {
    log(`⚠️ No base action remaining for Break!`);
    return;
  }
  attacker.actions.base--;

  const targetWounds = defender.totalWoundsSum;
  const attRoll = d20() + attacker.substats.strength + targetWounds;
  const defRoll = d20() + defender.substats.gumption;

  log(`🛡️ ${attacker.name} attempts a BREAK on ${defender.name}...`);
  if (attRoll > defRoll) {
    defender.statuses.brokenDefense = true;
    log(`💥 SUCCESS! ${defender.name}'s defense is broken (+1 damage tier)!`, "log-damage");
  } else {
    log(`❌ FAILED! ${defender.name} holds ground.`);
  }
  updateUI();
}

// ATTACK RESOLUTION: Only d20 Base Attacks can Critical
function executeAttack(isQuick = false) {
  const attacker = combatQueue[activeIndex];
  const defender = attacker === f1 ? f2 : f1;

  if (!attacker || !defender) return;
  if (attacker.isUnconscious || attacker.isDead) return;

  const actionType = isQuick ? "quick" : "base";
  if (attacker.actions[actionType] <= 0) {
    log(`⚠️ No ${actionType} actions left!`);
    return;
  }
  attacker.actions[actionType]--;

  log(`💥 ${attacker.name} strikes ${defender.name} with [${attacker.equippedWeapon.name}] (${actionType.toUpperCase()})...`);

  // Base Attack = d20 | Quick Attack = d10
  const roll = isQuick ? d10() : d20();
  const hitBonus = attacker.substats.hitMod + attacker.equippedWeapon.hitMod;
  const totalHit = roll + hitBonus;
  
  // ONLY d20 Base Attacks can roll a Natural 20 Critical
  const isNat20 = (!isQuick && roll === 20);

  if (!isNat20 && totalHit < defender.baseHitClass) {
    log(`❌ Miss! Roll ${roll} [${isQuick ? 'd10' : 'd20'}] (+${hitBonus}) = ${totalHit} vs HC ${defender.baseHitClass}`);
    updateUI();
    return;
  }

  const locRoll = d6();
  const location = defender.bodyPlan[locRoll];

  let scalingVal = 0;
  if (attacker.equippedWeapon.scaling === 'strength') scalingVal = attacker.substats.strength;
  if (attacker.equippedWeapon.scaling === 'finesse') scalingVal = attacker.substats.finesse;

  const rawDamage = Math.floor(Math.random() * attacker.equippedWeapon.diceSides) + 1 + scalingVal + attacker.equippedWeapon.flatDmg;
  const effectiveArmor = Math.max(0, location.armor - attacker.equippedWeapon.ap);
  const damageAfterArmor = rawDamage - effectiveArmor;

  log(`🎯 HIT on ${location.name}! Roll ${roll} [${isQuick ? 'd10' : 'd20'}]. Raw Dmg: ${rawDamage} (Armor: ${location.armor} - AP: ${attacker.equippedWeapon.ap} = Eff. Armor ${effectiveArmor})`);

 if (damageAfterArmor <= 0) {
    log(`🛡️ Armor absorbed the entire hit!`);
  } else {
    // 1. Determine base hit tier from Net Damage vs Toughness
    let newTier = "grazed";
    if (damageAfterArmor >= (defender.baseToughness * 2)) {
      newTier = "destroyed";
    } else if (damageAfterArmor >= defender.baseToughness) {
      newTier = "injured";
    }

    // 2. Apply Stacked Upgrades (Nat 20 on d20 + Broken Defense)
    let upgradeSteps = 0;
    if (defender.statuses.brokenDefense) { upgradeSteps++; defender.statuses.brokenDefense = false; }
    if (isNat20) { upgradeSteps++; }

    if (upgradeSteps > 0) {
      const tiers = ["grazed", "injured", "destroyed"];
      let idx = tiers.indexOf(newTier);
      idx = Math.min(tiers.length - 1, idx + upgradeSteps);
      newTier = tiers[idx];
      log(`⚡ STACKED CRITICAL/BREAK upgrade applied (+${upgradeSteps} tiers)!`);
    }

    // 3. Apply Severity Hierarchy (Prevent lesser wounds from overwriting severe ones)
    const tierSeverity = { "untouched": 0, "grazed": 1, "injured": 2, "destroyed": 3 };
    const currentSeverity = tierSeverity[location.state] || 0;
    const incomingSeverity = tierSeverity[newTier];

    if (incomingSeverity > currentSeverity) {
      location.state = newTier;
      log(`🩸 Result: ${location.name} is now [${newTier.toUpperCase()}]`, "log-damage");
    } else {
      log(`🩸 Result: ${location.name} takes a [${newTier.toUpperCase()}] hit, but remains [${location.state.toUpperCase()}]`, "log-damage");
    }
  }

  updateUI();
}

function renderCard(char, elId) {
  const el = document.getElementById(elId);
  if (!el || !char) return;

  const isActive = combatQueue[activeIndex] === char;

  const slotMap = {
    1: "head",
    2: "torso",
    3: "larm",
    4: "rarm",
    5: "lleg",
    6: "rleg",
    7: "aura"
  };

  let paperDollHTML = `<div class="paper-doll">`;
  Object.entries(char.bodyPlan).forEach(([locId, loc]) => {
    const areaClass = `doll-slot-${slotMap[locId]}`;
    paperDollHTML += `
      <div class="doll-slot ${areaClass} loc-${loc.state}">
        <div class="loc-name">${loc.name} ${loc.isVital ? "💔" : ""}</div>
        <div class="loc-armor">🛡️ Arm: ${loc.armor}</div>
        <div class="loc-status">${loc.state.toUpperCase()}</div>
      </div>
    `;
  });
  paperDollHTML += `</div>`;

  el.style.borderColor = isActive ? "#e9c46a" : "var(--border)";

  const convertBaseButton = char.actions.base > 0
    ? `<button class="btn" style="padding:2px 6px;font-size:0.7em;" onclick="convertAction('base','quick')">Base → Quick</button>`
    : "";
  const convertQuickButton = char.actions.quick >= 2
    ? `<button class="btn" style="padding:2px 6px;font-size:0.7em;" onclick="convertAction('quick','base')">Quick → Base</button>`
    : "";

  el.innerHTML = `
    <h2>${char.name} ${char.isDead ? "☠️ (DEAD)" : char.isUnconscious ? "💤 (UNCONSCIOUS)" : ""} ${isActive ? "⭐" : ""}</h2>
    <div style="font-size:0.85em; margin-bottom:8px; line-height:1.5;">
      <strong>Weapon:</strong> ${char.equippedWeapon.name} (d${char.equippedWeapon.diceSides}+${char.equippedWeapon.scaling === 'strength' ? char.substats.strength : char.equippedWeapon.scaling === 'finesse' ? char.substats.finesse : 0}, AP:${char.equippedWeapon.ap})<br>
      <strong>Stats:</strong> Toughness: ${char.baseToughness} | HC: ${char.baseHitClass} | Wound Cap: ${char.currentWoundCap}<br>
      <strong>Actions:</strong> Base [${char.actions.base}] | Quick [${char.actions.quick}]<br>
      <div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">
        ${convertBaseButton}
        ${convertQuickButton}
      </div>
    </div>
    ${paperDollHTML}
  `;
}

function updateUI() {
  if (!f1 || !f2) return;
  renderCard(f1, "f1-card");
  renderCard(f2, "f2-card");

  const active = combatQueue[activeIndex];
  const turnBanner = document.getElementById("turnBanner");
  if (turnBanner) {
    turnBanner.innerText = active
      ? `Active Turn: Round ${currentRound} -> ${active.name}`
      : `Combat Ended`;
  }
}