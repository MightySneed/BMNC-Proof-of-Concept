class Weapon {
  constructor({ name, diceSides, scaling, flatDmg, ap }) {
    this.name = name;
    this.diceSides = diceSides;
    this.scaling = scaling;
    this.flatDmg = flatDmg;
    this.ap = ap;
  }
}

class Fighter {
  constructor(name, primaries, substats, weapon, armorMap, pegAllocations) {
    this.name = name;
    this.primaries = primaries; 
    this.substats = substats;   
    this.equippedWeapon = weapon;

    // 1. Initialize bodyPlan FIRST so getStatPenalty/getEffectiveStat have an object to read
    this.bodyPlan = {
      1: { name: "Head", state: "untouched", armor: armorMap[1] || 0, isVital: true, pegs: pegAllocations[1] || {} },
      2: { name: "Torso", state: "untouched", armor: armorMap[2] || 0, isVital: false, pegs: pegAllocations[2] || {} },
      3: { name: "Left Arm", state: "untouched", armor: armorMap[3] || 0, isVital: false, pegs: pegAllocations[3] || {} },
      4: { name: "Right Arm", state: "untouched", armor: armorMap[4] || 0, isVital: false, pegs: pegAllocations[4] || {} },
      5: { name: "Left Leg", state: "untouched", armor: armorMap[5] || 0, isVital: false, pegs: pegAllocations[5] || {} },
      6: { name: "Right Leg", state: "untouched", armor: armorMap[6] || 0, isVital: false, pegs: pegAllocations[6] || {} },
      7: { name: "Aura/System", state: "untouched", armor: 0, isVital: false, pegs: pegAllocations[7] || {} }
    };

    // 2. Initialize actions and combat state SECOND
    this.actions = { base: 1, quick: this.getEffectiveStat('quickActions') };
    this.isUnconscious = false;
    this.isDead = false;
    this.statuses = { brokenDefense: false };
  }

  get baseToughness() { return 5 + (this.substats.toughness || 0); }
  get baseHitClass() { return 10 + (this.substats.hc || 0); }
  get currentWoundCap() { return 1 + (this.substats.woundCap || 0); }

  getStatPenalty(statKey) {
    let penalty = 0;
    Object.values(this.bodyPlan).forEach(loc => {
      if ((loc.state === "injured" || loc.state === "destroyed") && loc.pegs && loc.pegs[statKey]) {
        penalty += loc.pegs[statKey];
      }
    });
    return penalty;
  }

  getEffectiveStat(statKey) {
    const baseVal = this.substats[statKey] || 0;
    return Math.max(0, baseVal - this.getStatPenalty(statKey));
  }

  getMovementSpeed() {
    let activeLegs = 0;
    if (this.bodyPlan[5].state !== "injured" && this.bodyPlan[5].state !== "destroyed") activeLegs++;
    if (this.bodyPlan[6].state !== "injured" && this.bodyPlan[6].state !== "destroyed") activeLegs++;
    return activeLegs * 3;
  }

  get totalGrazes() { return Object.values(this.bodyPlan).filter(l => l.state === "grazed").length; }
  get totalInjuries() { return Object.values(this.bodyPlan).filter(l => l.state === "injured" || l.state === "destroyed").length; }
  get totalWoundsSum() { return this.totalGrazes + this.totalInjuries; }

  resetTurnActions() {
    this.actions.base = 1;
    this.actions.quick = this.getEffectiveStat('quickActions');
  }

  resetFullState() {
    this.isDead = false;
    this.isUnconscious = false;
    this.statuses.brokenDefense = false;
    Object.values(this.bodyPlan).forEach(loc => loc.state = "untouched");
    this.resetTurnActions();
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
  { key: "strength", label: "Strength", parent: "body", validLocs: [2, 3, 4, 5, 6] },
  { key: "toughness", label: "Toughness", parent: "body", isDoubleCost: true, isUnpegged: true },
  { key: "con", label: "Constitution", parent: "body", validLocs: [1, 2] },
  { key: "woundCap", label: "Wound Capacity", parent: "body", isWoundCap: true, isDoubleCost: true, isUnpegged: true },
  { key: "dexterity", label: "Dexterity", parent: "nerve", validLocs: [1, 2, 3, 4, 5, 6] },
  { key: "initiative", label: "Initiative Bonus", parent: "nerve", validLocs: [1, 5, 6, 7] },
  { key: "hc", label: "Hit Class (HC)", parent: "nerve", isDoubleCost: true, isUnpegged: true },
  { key: "finesse", label: "Finesse", parent: "nerve", validLocs: [3, 4, 5, 6] },
  { key: "quickActions", label: "Quick Actions", parent: "nerve", validLocs: [3, 4] },
  { key: "gumption", label: "Gumption", parent: "character", validLocs: [1, 2, 7] },
  { key: "charisma", label: "Charisma", parent: "character", validLocs: [1, 2, 7] }
];

const locationNames = { 1: "Head", 2: "Torso", 3: "L.Arm", 4: "R.Arm", 5: "L.Leg", 6: "R.Leg", 7: "Aura" };

function calcCumulativeXP(lvl) {
  return (lvl * (lvl + 1)) / 2;
}

function calculateTotalXP(id) {
  let totalXP = 0;
  const pBody = parseInt(document.getElementById(`f${id}-p-body`).value) || 0;
  const pNerve = parseInt(document.getElementById(`f${id}-p-nerve`).value) || 0;
  const pChar = parseInt(document.getElementById(`f${id}-p-char`).value) || 0;

  totalXP += calcCumulativeXP(pBody) + calcCumulativeXP(pNerve) + calcCumulativeXP(pChar);

  subStatDefs.forEach(s => {
    const el = document.getElementById(`f${id}-s-${s.key}`);
    if (el) {
      const val = parseInt(el.value) || 0;
      const multiplier = s.isDoubleCost ? 2 : 1;
      totalXP += calcCumulativeXP(val) * multiplier;
    }
  });

  const xpDisplay = document.getElementById(`f${id}-xp`);
  if (xpDisplay) xpDisplay.innerText = `XP Spent: ${totalXP}`;

  renderPeggingTable(id);
}

function autoDistributePegs(id, key, totalVal, validLocs) {
  // Read existing manual overrides if present, otherwise calculate auto-peg
  let allocated = 0;
  const inputs = validLocs.map(locId => document.getElementById(`f${id}-peg-${key}-${locId}`));
  const hasExistingValues = inputs.some(i => i && i.value !== "");

  if (hasExistingValues) return; // Keep manual user inputs

  // Distribute points round-robin across valid locations by default
  let remaining = totalVal;
  let idx = 0;
  const distribution = {};
  validLocs.forEach(l => distribution[l] = 0);

  while (remaining > 0 && validLocs.length > 0) {
    distribution[validLocs[idx % validLocs.length]]++;
    remaining--;
    idx++;
  }

  validLocs.forEach(locId => {
    const el = document.getElementById(`f${id}-peg-${key}-${locId}`);
    if (el) el.value = distribution[locId];
  });
}

function validatePegRow(id, key, totalVal, validLocs) {
  let sum = 0;
  validLocs.forEach(locId => {
    const el = document.getElementById(`f${id}-peg-${key}-${locId}`);
    if (el) sum += parseInt(el.value) || 0;
  });

  const statusEl = document.getElementById(`f${id}-peg-status-${key}`);
  const rowEl = document.getElementById(`f${id}-peg-row-${key}`);

  if (sum === totalVal) {
    if (statusEl) statusEl.innerHTML = `<span class="peg-valid">✓ (${sum}/${totalVal})</span>`;
    if (rowEl) rowEl.classList.remove("peg-row-error");
  } else {
    const diff = totalVal - sum;
    const msg = diff > 0 ? `${diff} unallocated` : `${Math.abs(diff)} over allocated!`;
    if (statusEl) statusEl.innerHTML = `<span class="peg-warning">⚠️ (${sum}/${totalVal} - ${msg})</span>`;
    if (rowEl) rowEl.classList.add("peg-row-error");
  }
}

function renderPeggingTable(id) {
  const container = document.getElementById(`f${id}-pegging-container`);
  if (!container) return;

  // Preserve existing inputs before re-render
  const currentInputs = {};
  subStatDefs.filter(s => !s.isUnpegged).forEach(s => {
    s.validLocs.forEach(locId => {
      const el = document.getElementById(`f${id}-peg-${s.key}-${locId}`);
      if (el) currentInputs[`${s.key}-${locId}`] = el.value;
    });
  });

  let html = `<table class="peg-table"><thead><tr><th>Sub-Stat</th><th>Total</th><th>Status</th>`;
  for (let l = 1; l <= 7; l++) html += `<th>${locationNames[l]}</th>`;
  html += `</tr></thead><tbody>`;

  subStatDefs.filter(s => !s.isUnpegged).forEach(s => {
    const val = parseInt(document.getElementById(`f${id}-s-${s.key}`)?.value) || 0;
    html += `<tr id="f${id}-peg-row-${s.key}">
      <td><strong>${s.label}</strong></td>
      <td>${val}</td>
      <td id="f${id}-peg-status-${s.key}"></td>`;

    for (let locId = 1; locId <= 7; locId++) {
      if (s.validLocs.includes(locId)) {
        const savedVal = currentInputs[`${s.key}-${locId}`];
        const displayVal = savedVal !== undefined ? savedVal : "";
        html += `<td><input type="number" class="peg-input" id="f${id}-peg-${s.key}-${locId}" value="${displayVal}" min="0" max="${val}" oninput="validatePegRow(${id}, '${s.key}', ${val}, [${s.validLocs.join(',')}])"></td>`;
      } else {
        html += `<td style="color:#444;">-</td>`;
      }
    }
    html += `</tr>`;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;

  // Auto-fill defaults and run validation checks on rows
  subStatDefs.filter(s => !s.isUnpegged).forEach(s => {
    const val = parseInt(document.getElementById(`f${id}-s-${s.key}`)?.value) || 0;
    autoDistributePegs(id, s.key, val, s.validLocs);
    validatePegRow(id, s.key, val, s.validLocs);
  });
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
          <input type="number" id="f${id}-s-${s.key}" value="${s.key === 'dexterity' ? 1 : 0}" min="0" max="${maxLevel}" onchange="calculateTotalXP(${id})">
        </div>
      `;
    });

    calculateTotalXP(id);
  });
}

buildCreatorUI();

function startBattle() {
  function readFighter(id) {
    const name = document.getElementById(`f${id}-name`)?.value || `Fighter ${id}`;
    const primaries = {
      body: parseInt(document.getElementById(`f${id}-p-body`)?.value) || 0,
      nerve: parseInt(document.getElementById(`f${id}-p-nerve`)?.value) || 0,
      character: parseInt(document.getElementById(`f${id}-p-char`)?.value) || 0
    };

    const substats = {};
    subStatDefs.forEach(s => {
      const el = document.getElementById(`f${id}-s-${s.key}`);
      substats[s.key] = el ? (parseInt(el.value) || 0) : 0;
    });

    const weapon = new Weapon({
      name: document.getElementById(`f${id}-w-name`)?.value || "Unarmed",
      diceSides: parseInt(document.getElementById(`f${id}-w-dice`)?.value) || 6,
      scaling: document.getElementById(`f${id}-w-scale`)?.value || "none",
      flatDmg: parseInt(document.getElementById(`f${id}-w-flat`)?.value) || 0,
      ap: parseInt(document.getElementById(`f${id}-w-ap`)?.value) || 0
    });

    const armorMap = {};
    for (let i = 1; i <= 6; i++) {
      armorMap[i] = parseInt(document.getElementById(`f${id}-ar-${i}`)?.value) || 0;
    }

    const pegAllocations = { 1: {}, 2: {}, 3: {}, 4: {}, 5: {}, 6: {}, 7: {} };
    subStatDefs.filter(s => !s.isUnpegged).forEach(s => {
      s.validLocs.forEach(locId => {
        const inputEl = document.getElementById(`f${id}-peg-${s.key}-${locId}`);
        if (inputEl) {
          const count = parseInt(inputEl.value) || 0;
          if (count > 0) pegAllocations[locId][s.key] = count;
        }
      });
    });

    return new Fighter(name, primaries, substats, weapon, armorMap, pegAllocations);
  }

  try {
    f1 = readFighter(1);
    f2 = readFighter(2);

    document.getElementById("setupScreen").style.display = "none";
    document.getElementById("battleScreen").style.display = "block";

    restartMatch();
  } catch (err) {
    console.error("Start Battle Error:", err);
    alert("Could not start battle! Check browser console (F12) for details.");
  }
}

function restartMatch() {
  f1.resetFullState();
  f2.resetFullState();

  document.getElementById("combatLog").innerHTML = "";

  combatQueue = [f1, f2].sort((a, b) => b.getEffectiveStat('initiative') - a.getEffectiveStat('initiative'));
  activeIndex = 0;
  currentRound = 1;

  log(`========================================`, "log-round");
  log(`--- ROUND 1 START ---`, "log-round");
  log(`Turn Order: ${combatQueue[0].name} (Init +${combatQueue[0].getEffectiveStat('initiative')}) -> ${combatQueue[1].name} (Init +${combatQueue[1].getEffectiveStat('initiative')})`, "log-round");

  startTurn(combatQueue[0]);
}

function startTurn(char) {
  char.resetTurnActions();

  if (char.isDead || char.isUnconscious) {
    log(`⏭️ ${char.name} is incapacitated and skips their turn.`);
    updateUI();
    return;
  }

  log(`\n▶️ ${char.name}'s Activation Start.`);

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

  const injuries = char.totalInjuries;
  const woundsSum = char.totalWoundsSum;
  const effectiveGumption = char.getEffectiveStat('gumption');

  if (injuries > char.currentWoundCap) {
    char.isUnconscious = true;
    log(`💤 ${char.name} has ${injuries} Injuries (Exceeds Wound Cap of ${char.currentWoundCap}) and passes out!`, "log-damage");
  } else if (injuries >= char.currentWoundCap) {
    const roll = d20();
    const total = roll + effectiveGumption - woundsSum;
    log(`🧠 Gumption Check: d20(${roll}) + Gump(${effectiveGumption}) - Wounds(${woundsSum}) = ${total} (Needs > 10)`, "log-check");

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

  if (attacker.actions.base <= 0) {
    log(`⚠️ No base action remaining for Break!`);
    return;
  }
  attacker.actions.base--;

  const targetWounds = defender.totalWoundsSum;
  const attRoll = d20() + attacker.getEffectiveStat('strength') + targetWounds;
  const defRoll = d20() + defender.getEffectiveStat('gumption');

  log(`🛡️ ${attacker.name} attempts a BREAK on ${defender.name}...`);
  if (attRoll > defRoll) {
    defender.statuses.brokenDefense = true;
    log(`💥 SUCCESS! ${defender.name}'s defense is broken (+1 damage tier)!`, "log-damage");
  } else {
    log(`❌ FAILED! ${defender.name} holds ground.`);
  }
  updateUI();
}

function executeAttack(isQuick = false) {
  const attacker = combatQueue[activeIndex];
  const defender = attacker === f1 ? f2 : f1;

  if (attacker.isUnconscious || attacker.isDead) return;

  const actionType = isQuick ? "quick" : "base";
  if (attacker.actions[actionType] <= 0) {
    log(`⚠️ No ${actionType} actions left!`);
    return;
  }
  attacker.actions[actionType]--;

  log(`💥 ${attacker.name} strikes ${defender.name} with [${attacker.equippedWeapon.name}] (${actionType.toUpperCase()})...`);

  const roll = isQuick ? d10() : d20();
  const hitBonus = attacker.getEffectiveStat('dexterity');
  const totalHit = roll + hitBonus;
  const isNat20 = (!isQuick && roll === 20);

  if (!isNat20 && totalHit < defender.baseHitClass) {
    log(`❌ Miss! Roll ${roll} [${isQuick ? 'd10' : 'd20'}] (+${hitBonus} Dex) = ${totalHit} vs HC ${defender.baseHitClass}`);
    updateUI();
    return;
  }

  const locRoll = d6();
  const location = defender.bodyPlan[locRoll];

  let scalingVal = 0;
  if (attacker.equippedWeapon.scaling === 'strength') scalingVal = attacker.getEffectiveStat('strength');
  if (attacker.equippedWeapon.scaling === 'finesse') scalingVal = attacker.getEffectiveStat('finesse');

  const rawDamage = Math.floor(Math.random() * attacker.equippedWeapon.diceSides) + 1 + scalingVal + attacker.equippedWeapon.flatDmg;
  const effectiveArmor = Math.max(0, location.armor - attacker.equippedWeapon.ap);
  const damageAfterArmor = rawDamage - effectiveArmor;

  log(`🎯 HIT on ${location.name}! Roll ${roll} [${isQuick ? 'd10' : 'd20'}]. Raw Dmg: ${rawDamage} (Armor: ${location.armor} - AP: ${attacker.equippedWeapon.ap} = Eff. Armor ${effectiveArmor})`);

  if (damageAfterArmor <= 0) {
    log(`🛡️ Armor absorbed the entire hit!`);
  } else {
    let newTier = "grazed";
    if (damageAfterArmor >= (defender.baseToughness * 2)) {
      newTier = "destroyed";
    } else if (damageAfterArmor >= defender.baseToughness) {
      newTier = "injured";
    }

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
  const slotMap = { 1: "head", 2: "torso", 3: "larm", 4: "rarm", 5: "lleg", 6: "rleg", 7: "aura" };

  let paperDollHTML = `<div class="paper-doll">`;
  Object.entries(char.bodyPlan).forEach(([locId, loc]) => {
    const areaClass = `doll-slot-${slotMap[locId]}`;
    
    let pegsSummary = "";
    if (loc.pegs && Object.keys(loc.pegs).length > 0) {
      pegsSummary = `<div style="font-size:0.7em; color:#aaa; margin-top:2px;">` + 
        Object.entries(loc.pegs).map(([k, v]) => `${k.substring(0,4)}:${v}`).join(" | ") + 
        `</div>`;
    }

    paperDollHTML += `
      <div class="doll-slot ${areaClass} loc-${loc.state}">
        <div class="loc-name">${loc.name} ${loc.isVital ? "💔" : ""}</div>
        <div class="loc-armor">🛡️ Arm: ${loc.armor}</div>
        <div class="loc-status">${loc.state.toUpperCase()}</div>
        ${pegsSummary}
      </div>
    `;
  });
  paperDollHTML += `</div>`;

  el.style.borderColor = isActive ? "#e9c46a" : "var(--border)";

  const convertBaseButton = char.actions.base > 0
    ? `<button class="btn" style="padding:2px 6px;font-size:0.7em;" onclick="convertAction('base','quick')">Base → 2x Quick</button>`
    : "";
  const convertQuickButton = char.actions.quick >= 2
    ? `<button class="btn" style="padding:2px 6px;font-size:0.7em;" onclick="convertAction('quick','base')">2x Quick → Base</button>`
    : "";

  const scaleStatVal = char.equippedWeapon.scaling === 'strength' ? char.getEffectiveStat('strength') : char.equippedWeapon.scaling === 'finesse' ? char.getEffectiveStat('finesse') : 0;

  el.innerHTML = `
    <h2>${char.name} ${char.isDead ? "☠️ (DEAD)" : char.isUnconscious ? "💤 (UNCONSCIOUS)" : ""} ${isActive ? "⭐" : ""}</h2>
    <div style="font-size:0.85em; margin-bottom:8px; line-height:1.5;">
      <strong>Weapon:</strong> ${char.equippedWeapon.name} (d${char.equippedWeapon.diceSides}+${scaleStatVal}, AP:${char.equippedWeapon.ap})<br>
      <strong>Stats:</strong> Toughness: ${char.baseToughness} | HC: ${char.baseHitClass} | Wound Cap: ${char.currentWoundCap}<br>
      <strong>Speed:</strong> ${char.getMovementSpeed()}m (5ft) per Quick Action<br>
      <strong>Actions:</strong> Base [${char.actions.base}] | Quick [${char.actions.quick}]<br>
      <div style="margin-top:6px; display:flex; gap:4px; flex-wrap:wrap;">
        ${convertBaseButton}
        ${convertQuickButton}
      </div>
      <div style="margin-top:4px;">
        <strong>Wounds:</strong> Grazes (${char.totalGrazes}) | Injuries (${char.totalInjuries}) ${char.statuses.brokenDefense ? "| 💥 [DEFENSE BROKEN]" : ""}
      </div>
    </div>

    <h4>Anatomical Status Map</h4>
    ${paperDollHTML}

    <h4 style="margin-top:10px;">Combat Actions</h4>
    <div style="display:flex; gap:6px; flex-wrap:wrap;">
      <button class="btn" ${!isActive || char.isUnconscious || char.isDead ? "disabled" : ""} onclick="executeAttack(false)">⚔️ Base Attack (d20)</button>
      <button class="btn" ${!isActive || char.isUnconscious || char.isDead ? "disabled" : ""} onclick="executeAttack(true)">⚡ Quick Attack (d10)</button>
      <button class="btn" ${!isActive || char.isUnconscious || char.isDead ? "disabled" : ""} onclick="executeBreak()">🛡️ Break Stance</button>
    </div>
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