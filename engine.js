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
  constructor(name, primaries, substats, weapon, armorMap, pegAllocations, team = "A") {
    this.name = name;
    this.team = team;
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

    // Wound counts are tracked separately from location state. Repeated injuries
    // count toward trauma, but do not multiply the stat penalty for a disabled limb.
    Object.values(this.bodyPlan).forEach(loc => {
      loc.grazeCount = 0;
      loc.injuryCount = 0;
    });

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
    return activeLegs * 5; // feet; 5 ft per functional leg
  }

  get totalGrazes() {
    return Object.values(this.bodyPlan).reduce((sum, loc) => sum + loc.grazeCount, 0);
  }
  get totalInjuries() {
    return Object.values(this.bodyPlan).reduce((sum, loc) => sum + loc.injuryCount, 0);
  }
  get totalWoundsSum() { return this.totalGrazes + this.totalInjuries; }

  resetTurnActions() {
    this.actions.base = 1;
    this.actions.quick = this.getEffectiveStat('quickActions');
  }

  resetFullState() {
    this.isDead = false;
    this.isUnconscious = false;
    this.statuses.brokenDefense = false;
    Object.values(this.bodyPlan).forEach(loc => {
      loc.state = "untouched";
      loc.grazeCount = 0;
      loc.injuryCount = 0;
    });
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

function buildCreatorUI(preserveExisting = true) {
  // Primary-stat edits rebuild the generated controls. Keep the user's current
  // allocations instead of silently resetting both characters.
  const savedStats = {};
  if (preserveExisting) {
    [1, 2].forEach(id => {
      savedStats[id] = {};
      subStatDefs.forEach(stat => {
        const el = document.getElementById(`f${id}-s-${stat.key}`);
        if (el) savedStats[id][stat.key] = parseInt(el.value) || 0;
      });
    });
  }

  [1, 2].forEach(id => {
    const bodyCap = Math.max(0, parseInt(document.getElementById(`f${id}-p-body`)?.value) || 0);
    const nerveCap = Math.max(0, parseInt(document.getElementById(`f${id}-p-nerve`)?.value) || 0);
    const charCap = Math.max(0, parseInt(document.getElementById(`f${id}-p-char`)?.value) || 0);
    const caps = { body: bodyCap, nerve: nerveCap, character: charCap };
    const container = document.getElementById(`f${id}-substats`);
    if (!container) return;
    container.innerHTML = "";

    subStatDefs.forEach(stat => {
      let maxLevel = caps[stat.parent];
      if (stat.isWoundCap) maxLevel = Math.floor(bodyCap / 2);
      const previous = savedStats[id]?.[stat.key];
      const initial = previous === undefined ? (stat.key === "dexterity" ? 1 : 0) : previous;
      const value = Math.min(Math.max(0, initial), maxLevel);

      container.insertAdjacentHTML("beforeend", `
        <div class="stat-row">
          <label for="f${id}-s-${stat.key}">${stat.label} ${stat.isDoubleCost ? "⚡ (2× XP)" : ""} <span class="stat-cap">(max ${maxLevel})</span></label>
          <input type="number" id="f${id}-s-${stat.key}" value="${value}" min="0" max="${maxLevel}" step="1" onchange="calculateTotalXP(${id})">
        </div>
      `);
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

function isCombatCapable(char) {
  return !!char && !char.isDead && !char.isUnconscious;
}

function hasRemainingActions(char) {
  return isCombatCapable(char) && (char.actions.base > 0 || char.actions.quick > 0);
}

function checkEncounterComplete() {
  const teams = [...new Set(combatQueue.map(char => char.team))];
  const activeTeams = teams.filter(team =>
    combatQueue.some(char => char.team === team && isCombatCapable(char))
  );

  // Team-aware so that a future multi-character side can still intervene when
  // one member is unconscious. In this two-fighter prototype, each side has one fighter.
  if (activeTeams.length <= 1 && teams.length > 1) {
    combatEnded = true;
    const winner = activeTeams.length === 1
      ? combatQueue.find(char => char.team === activeTeams[0] && isCombatCapable(char))
      : null;
    log(winner
      ? `🏆 ${winner.name} wins! The opposing side has no combat-capable fighters.`
      : "⚔️ The encounter has ended with no combat-capable fighters remaining.",
      "log-round");
    return true;
  }
  return false;
}

function restartMatch() {
  combatEnded = false;
  f1.resetFullState();
  f2.resetFullState();
  document.getElementById("combatLog").innerHTML = "";

  combatQueue = [f1, f2].sort((a, b) =>
    b.getEffectiveStat("initiative") - a.getEffectiveStat("initiative")
  );
  currentRound = 1;
  activeIndex = combatQueue.length - 1;
  combatQueue.forEach(char => char.resetTurnActions());

  log("========================================", "log-round");
  log("--- ROUND 1 START ---", "log-round");
  log(`Initiative: ${combatQueue.map(char =>
    `${char.name} (+${char.getEffectiveStat("initiative")})`
  ).join(" → ")}`, "log-round");

  advanceToNextActor();
}

function startTurn(char) {
  if (combatEnded || !char) {
    updateUI();
    return;
  }

  if (!isCombatCapable(char)) {
    char.actions.base = 0;
    char.actions.quick = 0;
    advanceToNextActor();
    return;
  }

  // Gumption is checked when the character's activation comes up, before an
  // action is chosen. This deliberately leaves room for allies to intervene
  // between activations in the future multi-character encounter mode.
  log(`\n▶️ ${char.name}'s activation begins.`);

  const vitalDestroyed = Object.values(char.bodyPlan).some(
    loc => loc.isVital && loc.state === "destroyed"
  );
  if (vitalDestroyed) {
    char.isDead = true;
    char.actions.base = 0;
    char.actions.quick = 0;
    log(`☠️ ${char.name} has suffered a destroyed vital location and dies.`, "log-damage");
    if (!checkEncounterComplete()) advanceToNextActor();
    else updateUI();
    return;
  }

  const injuries = char.totalInjuries;
  const woundsSum = char.totalWoundsSum;
  const effectiveGumption = char.getEffectiveStat("gumption");

  if (injuries > char.currentWoundCap) {
    char.isUnconscious = true;
    char.actions.base = 0;
    char.actions.quick = 0;
    log(`💤 ${char.name} has ${injuries} injuries, exceeding Wound Cap ${char.currentWoundCap}; they collapse.`, "log-damage");
    if (!checkEncounterComplete()) advanceToNextActor();
    else updateUI();
    return;
  }

  if (injuries >= char.currentWoundCap) {
    const roll = d20();
    const total = roll + effectiveGumption - woundsSum;
    log(`🧠 Gumption check: d20(${roll}) + Gump(${effectiveGumption}) − Wounds(${woundsSum}) = ${total} (needs > 10)`, "log-check");
    if (total <= 10) {
      char.isUnconscious = true;
      char.actions.base = 0;
      char.actions.quick = 0;
      log(`💤 Check failed: ${char.name} falls unconscious.`, "log-damage");
      if (!checkEncounterComplete()) advanceToNextActor();
      else updateUI();
      return;
    }
    log(`✨ ${char.name} remains conscious and can act.`);
  }

  updateUI();
}

function advanceToNextActor() {
  if (combatEnded) {
    updateUI();
    return;
  }
  if (checkEncounterComplete()) {
    updateUI();
    return;
  }

  const count = combatQueue.length;
  for (let offset = 1; offset <= count; offset++) {
    const idx = (activeIndex + offset) % count;
    const char = combatQueue[idx];
    if (!isCombatCapable(char)) {
      char.actions.base = 0;
      char.actions.quick = 0;
      continue;
    }
    if (hasRemainingActions(char)) {
      activeIndex = idx;
      startTurn(char);
      return;
    }
  }

  // Everyone has spent their action pool. Start a new round and begin again
  // at the top of the fixed initiative order.
  currentRound++;
  combatQueue.forEach(char => char.resetTurnActions());
  activeIndex = count - 1;
  log("========================================", "log-round");
  log(`--- ROUND ${currentRound} START ---`, "log-round");
  advanceToNextActor();
}

function nextTurn() {
  // "End Turn" now means voluntarily forfeit remaining actions and pass the
  // interleaved queue to the next combatant.
  const char = combatQueue[activeIndex];
  if (!char || combatEnded) return;
  char.actions.base = 0;
  char.actions.quick = 0;
  log(`⏭️ ${char.name} passes and forfeits remaining actions.`);
  advanceToNextActor();
}

function convertAction(fromType, toType) {
  const char = combatQueue[activeIndex];
  if (!char || combatEnded || !isCombatCapable(char)) return;

  if (fromType === "base" && toType === "quick") {
    if (char.actions.base >= 1) {
      char.actions.base -= 1;
      char.actions.quick += 2;
      log(`⚡ ${char.name} converts 1 Base Action into 2 Quick Actions.`);
    }
  } else if (fromType === "quick" && toType === "base") {
    if (char.actions.quick >= 2) {
      char.actions.quick -= 2;
      char.actions.base += 1;
      log(`⚡ ${char.name} converts 2 Quick Actions into 1 Base Action.`);
    }
  }
  updateUI();
}

function executeBreak() {
  const attacker = combatQueue[activeIndex];
  const defender = attacker === f1 ? f2 : f1;
  if (!attacker || combatEnded || !isCombatCapable(attacker)) return;
  if (!isCombatCapable(defender)) {
    log("⚠️ There is no combat-capable target for Break Stance.");
    return;
  }
  if (attacker.actions.base <= 0) {
    log("⚠️ No Base Action remaining for Break Stance.");
    return;
  }
  attacker.actions.base--;

  const targetWounds = defender.totalWoundsSum;
  const attRoll = d20() + attacker.getEffectiveStat("strength") + targetWounds;
  const defRoll = d20() + defender.getEffectiveStat("gumption");
  log(`🛡️ ${attacker.name} attempts to break ${defender.name}'s stance...`);
  if (attRoll > defRoll) {
    defender.statuses.brokenDefense = true;
    log(`💥 Success! ${defender.name}'s defence is broken; the next damaging hit gains +1 tier.`, "log-damage");
  } else {
    log(`❌ Failed: ${defender.name} holds their ground.`);
  }
  advanceToNextActor();
}

function applyLocationHit(location, tier) {
  if (tier === "grazed") {
    location.grazeCount++;
    if (location.state === "untouched") location.state = "grazed";
    return;
  }

  // Injury count stacks even on an already-disabled location. The state/penalty
  // does not stack: a broken arm is already non-functional. A hit whose own
  // damage meets the destruction threshold can still destroy the location.
  location.injuryCount++;
  if (tier === "destroyed") {
    location.state = "destroyed";
  } else if (location.state !== "destroyed") {
    location.state = "injured";
  }
}

function executeAttack(isQuick = false) {
  const attacker = combatQueue[activeIndex];
  const defender = attacker === f1 ? f2 : f1;

  if (!attacker || combatEnded || !isCombatCapable(attacker)) return;
  if (!isCombatCapable(defender)) {
    log("⚠️ The target is no longer combat-capable.");
    return;
  }

  const actionType = isQuick ? "quick" : "base";
  if (attacker.actions[actionType] <= 0) {
    log(`⚠️ No ${actionType} actions remaining.`);
    return;
  }
  attacker.actions[actionType]--;

  log(`💥 ${attacker.name} attacks ${defender.name} with [${attacker.equippedWeapon.name}] (${actionType.toUpperCase()})...`);

  // Quick attacks deliberately trade accuracy for speed, not damage.
  const roll = isQuick ? d10() : d20();
  const hitBonus = attacker.getEffectiveStat("dexterity");
  const totalHit = roll + hitBonus;
  const isNat20 = !isQuick && roll === 20;

  if (!isNat20 && totalHit < defender.baseHitClass) {
    log(`❌ Miss: ${roll} [${isQuick ? "d10" : "d20"}] + ${hitBonus} Dex = ${totalHit} vs HC ${defender.baseHitClass}.`);
    advanceToNextActor();
    return;
  }

  // Physical attacks target only the six physical locations. Aura/System is
  // reserved for non-physical targeting rules/modules.
  const locRoll = d6();
  const location = defender.bodyPlan[locRoll];
  let scalingVal = 0;
  if (attacker.equippedWeapon.scaling === "strength") scalingVal = attacker.getEffectiveStat("strength");
  if (attacker.equippedWeapon.scaling === "finesse") scalingVal = attacker.getEffectiveStat("finesse");

  const rawDamage =
    Math.floor(Math.random() * attacker.equippedWeapon.diceSides) + 1 +
    scalingVal + attacker.equippedWeapon.flatDmg;
  const effectiveArmor = Math.max(0, location.armor - attacker.equippedWeapon.ap);
  const damageAfterArmor = rawDamage - effectiveArmor;

  log(`🎯 Hit on ${location.name} (d6=${locRoll}). Raw damage: ${rawDamage}; armour ${location.armor} − AP ${attacker.equippedWeapon.ap} = ${effectiveArmor} effective armour.`);

  if (damageAfterArmor <= 0) {
    log("🛡️ Armour absorbs the entire hit.");
  } else {
    let newTier = "grazed";
    if (damageAfterArmor >= defender.baseToughness * 2) newTier = "destroyed";
    else if (damageAfterArmor >= defender.baseToughness) newTier = "injured";

    let upgradeSteps = 0;
    if (defender.statuses.brokenDefense) {
      upgradeSteps++;
      defender.statuses.brokenDefense = false;
    }
    if (isNat20) upgradeSteps++;

    if (upgradeSteps > 0) {
      const tiers = ["grazed", "injured", "destroyed"];
      const idx = tiers.indexOf(newTier);
      newTier = tiers[Math.min(tiers.length - 1, idx + upgradeSteps)];
      log(`⚡ Critical/broken-defence effect increases this hit by ${upgradeSteps} tier(s).`);
    }

    applyLocationHit(location, newTier);
    log(`🩸 Result: ${location.name} receives a ${newTier.toUpperCase()} hit. Location state: ${location.state.toUpperCase()} (graze count ${location.grazeCount}, injury count ${location.injuryCount}).`, "log-damage");

    if (location.isVital && location.state === "destroyed") {
      defender.isDead = true;
      defender.actions.base = 0;
      defender.actions.quick = 0;
      log(`☠️ Fatal injury: ${defender.name}'s vital location is destroyed.`, "log-damage");
    }
  }

  if (!checkEncounterComplete()) advanceToNextActor();
  else updateUI();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
}

function renderInitiativeTracker() {
  const el = document.getElementById("initiativeTracker");
  if (!el) return;

  if (!combatQueue.length) {
    el.innerHTML = "";
    return;
  }

  let nextIdx = -1;
  if (!combatEnded) {
    for (let offset = 1; offset <= combatQueue.length; offset++) {
      const idx = (activeIndex + offset) % combatQueue.length;
      if (idx !== activeIndex && hasRemainingActions(combatQueue[idx])) {
        nextIdx = idx;
        break;
      }
    }
  }

  el.innerHTML = `
    <div class="initiative-heading">
      <div>
        <span class="eyebrow">ROUND ${currentRound}</span>
        <h3>${combatEnded ? "ENCOUNTER ENDED" : "INITIATIVE TRACKER"}</h3>
      </div>
      <span class="queue-hint">${combatEnded ? "Combat is over" : "One action at a time · initiative order"}</span>
    </div>
    <div class="initiative-list">
      ${combatQueue.map((char, idx) => {
        const isActive = idx === activeIndex && !combatEnded;
        const isNext = idx === nextIdx && !isActive && !combatEnded;
        const status = char.isDead ? "DEAD" : char.isUnconscious ? "UNCONSCIOUS" : isActive ? "ACTING NOW" : isNext ? "UP NEXT" : "IN QUEUE";
        const base = char.actions.base;
        const quick = char.actions.quick;
        return `
          <div class="initiative-entry ${isActive ? "is-active" : ""} ${isNext ? "is-next" : ""} ${!isCombatCapable(char) ? "is-out" : ""}">
            <div class="initiative-rank">${idx + 1}</div>
            <div class="initiative-person">
              <strong>${escapeHtml(char.name)}</strong>
              <span>${status} · INIT +${char.getEffectiveStat("initiative")}</span>
            </div>
            <div class="initiative-actions">
              <span class="action-chip ${base > 0 ? "available" : ""}">BASE ${base}</span>
              <span class="action-chip ${quick > 0 ? "available" : ""}">QUICK ${quick}</span>
            </div>
          </div>`;
      }).join("")}
    </div>`;
}

function renderCard(char, elId) {
  const el = document.getElementById(elId);
  if (!el || !char) return;

  const isActive = combatQueue[activeIndex] === char && !combatEnded;
  const canAct = isActive && isCombatCapable(char);
  const slotMap = { 1: "head", 2: "torso", 3: "larm", 4: "rarm", 5: "lleg", 6: "rleg", 7: "aura" };

  let paperDollHTML = `<div class="paper-doll">`;
  Object.entries(char.bodyPlan).forEach(([locId, loc]) => {
    const areaClass = `doll-slot-${slotMap[locId]}`;
    const pegsSummary = loc.pegs && Object.keys(loc.pegs).length > 0
      ? `<div class="peg-summary">${Object.entries(loc.pegs).map(([k, v]) => `${escapeHtml(k.substring(0,4))}:${v}`).join(" | ")}</div>`
      : "";
    paperDollHTML += `
      <div class="doll-slot loc-${loc.state} ${loc.state === "injured" || loc.state === "destroyed" ? "is-disabled" : ""}">
        <div class="loc-name">${escapeHtml(loc.name)} ${loc.isVital ? "💔" : ""}</div>
        <div class="loc-armor">🛡️ Armour: ${loc.armor}</div>
        <div class="loc-status">${loc.state.toUpperCase()}</div>
        <div class="loc-wounds">G ${loc.grazeCount} · I ${loc.injuryCount}</div>
        ${pegsSummary}
      </div>`;
  });
  paperDollHTML += "</div>";

  el.classList.toggle("fighter-active", canAct);
  const scaleStatVal = char.equippedWeapon.scaling === "strength"
    ? char.getEffectiveStat("strength")
    : char.equippedWeapon.scaling === "finesse"
      ? char.getEffectiveStat("finesse") : 0;
  const convertBaseButton = canAct && char.actions.base > 0
    ? `<button class="btn btn-small" onclick="convertAction('base','quick')">Base → 2 Quick</button>` : "";
  const convertQuickButton = canAct && char.actions.quick >= 2
    ? `<button class="btn btn-small" onclick="convertAction('quick','base')">2 Quick → Base</button>` : "";

  el.innerHTML = `
    <div class="fighter-card-head">
      <div>
        <div class="eyebrow">${canAct ? "YOUR ACTION" : char.isDead ? "DEAD" : char.isUnconscious ? "UNCONSCIOUS" : "COMBATANT"}</div>
        <h2>${escapeHtml(char.name)} ${char.isDead ? "☠️" : char.isUnconscious ? "💤" : ""}</h2>
      </div>
      ${canAct ? '<span class="acting-pill">ACTING NOW</span>' : ""}
    </div>
    <div class="fighter-summary">
      <strong>Weapon:</strong> ${escapeHtml(char.equippedWeapon.name)} (d${char.equippedWeapon.diceSides} + ${scaleStatVal} stat + ${char.equippedWeapon.flatDmg} flat, AP ${char.equippedWeapon.ap})<br>
      <strong>Stats:</strong> Toughness ${char.baseToughness} · HC ${char.baseHitClass} · Wound Cap ${char.currentWoundCap}<br>
      <strong>Movement:</strong> ${char.getMovementSpeed()} ft per Quick Action<br>
      <strong>Wounds:</strong> Grazes ${char.totalGrazes} · Injuries ${char.totalInjuries} ${char.statuses.brokenDefense ? "· 💥 DEFENCE BROKEN" : ""}
      <div class="action-conversions">${convertBaseButton}${convertQuickButton}</div>
    </div>

    <h4>Anatomical status</h4>
    ${paperDollHTML}

    <h4 class="combat-actions-heading">Combat actions</h4>
    <div class="combat-actions">
      <button class="btn" ${!canAct || char.actions.base <= 0 ? "disabled" : ""} onclick="executeAttack(false)">⚔️ Base attack · d20</button>
      <button class="btn" ${!canAct || char.actions.quick <= 0 ? "disabled" : ""} onclick="executeAttack(true)">⚡ Quick attack · d10</button>
      <button class="btn" ${!canAct || char.actions.base <= 0 ? "disabled" : ""} onclick="executeBreak()">🛡️ Break stance · Base</button>
    </div>`;
}

function updateUI() {
  if (!f1 || !f2) return;
  renderCard(f1, "f1-card");
  renderCard(f2, "f2-card");
  renderInitiativeTracker();

  const active = combatQueue[activeIndex];
  const turnBanner = document.getElementById("turnBanner");
  if (turnBanner) {
    turnBanner.innerText = combatEnded
      ? "Encounter ended"
      : active
        ? `ROUND ${currentRound} — ${active.name} is acting`
        : `ROUND ${currentRound}`;
  }

  const endButton = document.getElementById("endActivationButton");
  if (endButton) endButton.disabled = combatEnded || !active;
  const resetButton = document.getElementById("resetCombatButton");
  if (resetButton) resetButton.disabled = !f1 || !f2;
}
