class Weapon {
  constructor({ name, diceSides, scaling, flatDmg, pen }) {
    this.name = name;
    this.diceSides = diceSides;
    this.scaling = scaling;
    this.flatDmg = flatDmg;
    this.pen = pen;
  }
}

class Fighter {
  constructor(name, primaries, substats, weapon, armorMap, pegAllocations, team = "A", skills = []) {
    this.name = name; this.team = team; this.primaries = primaries;
    this.substats = substats; this.equippedWeapon = weapon;
    this.skills = Array.isArray(skills) ? skills.map(skill => ({...skill})) : [];
    this.bodyPlan = {
      1: { name: "Head", state: "untouched", armor: armorMap[1] || 0, isVital: true, pegs: pegAllocations[1] || {} },
      2: { name: "Torso", state: "untouched", armor: armorMap[2] || 0, isVital: true, pegs: pegAllocations[2] || {} },
      3: { name: "Left Arm", state: "untouched", armor: armorMap[3] || 0, isVital: false, pegs: pegAllocations[3] || {} },
      4: { name: "Right Arm", state: "untouched", armor: armorMap[4] || 0, isVital: false, pegs: pegAllocations[4] || {} },
      5: { name: "Left Leg", state: "untouched", armor: armorMap[5] || 0, isVital: false, pegs: pegAllocations[5] || {} },
      6: { name: "Right Leg", state: "untouched", armor: armorMap[6] || 0, isVital: false, pegs: pegAllocations[6] || {} },
      7: { name: "Aura/System", state: "untouched", armor: 0, isVital: false, pegs: pegAllocations[7] || {} }
    };
    Object.values(this.bodyPlan).forEach(loc => {
      loc.grazeCount = 0; loc.injuryCount = 0; loc.destroyedCount = 0;
    });
    this.actions = { ap: 0 };
    this.isUnconscious = false; this.isDead = false;
    this.statuses = { brokenDefense: false, shaken: false, parryReady: false, aimReady: false };
    this.resetTurnActions();
  }
  get baseToughness() { return 5 + (this.substats.toughness || 0); }
  get baseHitClass() { return 10 + (this.substats.hc || 0); }
  get currentWoundCap() { return 1 + (this.substats.woundCap || 0); }
  get maxActionPoints() { return 2 + this.getEffectiveStat("actionCapacity"); }
  getStatPenalty(statKey) {
    let penalty = 0;
    Object.values(this.bodyPlan).forEach(loc => {
      const disabledByPhysicalInjury = loc.state === "injured" || loc.state === "destroyed";
      const disabledByShaken = loc.name === "Aura/System" && this.statuses?.shaken;
      if ((disabledByPhysicalInjury || disabledByShaken) && loc.pegs && loc.pegs[statKey]) penalty += loc.pegs[statKey];
    });
    return penalty;
  }
  getEffectiveStat(statKey) {
    return Math.max(0, (this.substats[statKey] || 0) - this.getStatPenalty(statKey));
  }
  getMovementSpeed() {
    let activeLegs = 0;
    if (!["injured", "destroyed"].includes(this.bodyPlan[5].state)) activeLegs++;
    if (!["injured", "destroyed"].includes(this.bodyPlan[6].state)) activeLegs++;
    return activeLegs * 5; // Human/grid baseline: 5 ft per functional leg.
  }
  get totalGrazes() {
    return Object.values(this.bodyPlan).reduce((sum, loc) => sum + loc.grazeCount, 0);
  }
  get totalInjuries() {
    return Object.values(this.bodyPlan).reduce((sum, loc) => sum + loc.injuryCount + loc.destroyedCount, 0) + (this.statuses?.shaken ? 1 : 0);
  }
  get totalDestroyedHits() {
    return Object.values(this.bodyPlan).reduce((sum, loc) => sum + loc.destroyedCount, 0);
  }
  get totalWoundsSum() { return this.totalGrazes + this.totalInjuries; }
  get totalTraumaPenalty() {
    return Object.values(this.bodyPlan).reduce((sum, loc) => sum + loc.grazeCount + 2 * loc.injuryCount + 3 * loc.destroyedCount, 0) + (this.statuses?.shaken ? 2 : 0);
  }
  resetTurnActions() { this.actions.ap = this.maxActionPoints; }
  resetFullState() {
    this.isDead = false; this.isUnconscious = false; this.statuses.brokenDefense = false; this.statuses.shaken = false; this.statuses.parryReady = false; this.statuses.aimReady = false;
    Object.values(this.bodyPlan).forEach(loc => {
      loc.state = "untouched"; loc.grazeCount = 0; loc.injuryCount = 0; loc.destroyedCount = 0;
    });
    this.resetTurnActions();
  }
}


let f1, f2, combatQueue = [], activeIndex = 0, currentRound = 1, combatEnded = false;

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
  { key: "toughness", label: "Toughness", parent: "body", isSpecial: true, isUnpegged: true },
  { key: "con", label: "Constitution", parent: "body", validLocs: [1, 2] },
  { key: "woundCap", label: "Wound Capacity", parent: "body", isSpecial: true, isUnpegged: true },
  { key: "dexterity", label: "Dexterity", parent: "nerve", validLocs: [1, 2, 3, 4, 5, 6] },
  { key: "initiative", label: "Initiative", parent: "nerve", validLocs: [1, 5, 6, 7] },
  { key: "hc", label: "Hit Class (HC)", parent: "nerve", isSpecial: true, isUnpegged: true },
  { key: "finesse", label: "Finesse", parent: "nerve", validLocs: [3, 4, 5, 6] },
  { key: "actionCapacity", label: "Action Capacity", parent: "nerve", isSpecial: true, isUnpegged: true },
  { key: "gumption", label: "Gumption", parent: "character", validLocs: [1, 2, 7] },
  { key: "charisma", label: "Charisma", parent: "character", validLocs: [1, 2, 7] },
  { key: "willpower", label: "Willpower", parent: "character", isSpecial: true, isUnpegged: true }
];

const locationNames = { 1: "Head", 2: "Torso", 3: "L.Arm", 4: "R.Arm", 5: "L.Leg", 6: "R.Leg", 7: "Aura" };

function calcCumulativeXP(level) {
  const n = Math.max(0, Math.floor(Number(level) || 0));
  return n * (n + 1) / 2;
}

function getStatMaxLevel(stat, primaries) {
  const domainLevel = Math.max(0, Number(primaries[stat.parent]) || 0);
  return stat.isSpecial ? Math.floor(domainLevel / 2) : domainLevel;
}
function readPrimariesFromUI(id) {
  return {
    body: Math.max(0, parseInt(document.getElementById(`f${id}-p-body`)?.value) || 0),
    nerve: Math.max(0, parseInt(document.getElementById(`f${id}-p-nerve`)?.value) || 0),
    character: Math.max(0, parseInt(document.getElementById(`f${id}-p-char`)?.value) || 0)
  };
}
function getSkillRowsFromUI(id) {
  const container = document.getElementById(`f${id}-skills-editor`);
  if (!container) return [];
  return [...container.querySelectorAll(".skill-row")].map(row => ({
    name: row.querySelector(".skill-name")?.value?.trim() || "",
    domain: row.querySelector(".skill-domain")?.value || "body",
    ability: row.querySelector(".skill-ability")?.value || "strength",
    level: Math.max(0, parseInt(row.querySelector(".skill-level")?.value) || 0)
  }));
}
function availableAbilitiesForDomain(domain) {
  return subStatDefs.filter(stat => stat.parent === domain && !stat.isUnpegged);
}
function getSkillBonus(char, skillName) {
  const expected = String(skillName || "").trim().toLowerCase();
  const skill = (char?.skills || [])
    .filter(item => String(item.name || "").trim().toLowerCase() === expected)
    .sort((a,b) => (Number(b.level) || 0) - (Number(a.level) || 0))[0];
  if (!skill) return 0;
  return Math.min(Math.max(0, Number(skill.level) || 0), char.getEffectiveStat(skill.ability));
}

function getWeaponSkillBonus(char) {
  const weaponName = String(char?.equippedWeapon?.name || "").trim().toLowerCase();
  if (/\bunarmed\b/.test(weaponName)) return getSkillBonus(char, "Martial Arts");
  if (/\b(bow|crossbow|sling)\b/.test(weaponName)) return getSkillBonus(char, "Archery");
  return getSkillBonus(char, "Fencing");
}

function getAbilityLevel(id, abilityKey) {
  return Math.max(0, parseInt(document.getElementById(`f${id}-s-${abilityKey}`)?.value) || 0);
}

function updateSkillLevelCaps(id) {
  const container = document.getElementById(`f${id}-skills-editor`);
  if (!container) return;
  container.querySelectorAll(".skill-row").forEach(row => {
    const abilityKey = row.querySelector(".skill-ability")?.value;
    const levelInput = row.querySelector(".skill-level");
    if (!levelInput) return;
    const cap = abilityKey ? getAbilityLevel(id, abilityKey) : 0;
    const overCap = Number(levelInput.value) > cap;
    levelInput.max = String(cap);
    levelInput.setCustomValidity(overCap ? `Skill level cannot exceed its selected ability level (${cap}).` : "");
    row.classList.toggle("skill-over-cap", overCap);
    levelInput.setAttribute("aria-invalid", overCap ? "true" : "false");
  });
}

function calculateTotalXP(id) {
  const primaries = readPrimariesFromUI(id);
  let totalXP = calcCumulativeXP(primaries.body) + calcCumulativeXP(primaries.nerve) + calcCumulativeXP(primaries.character);
  subStatDefs.forEach(stat => {
    const value = Math.max(0, parseInt(document.getElementById(`f${id}-s-${stat.key}`)?.value) || 0);
    totalXP += calcCumulativeXP(value) * (stat.isSpecial ? 2 : 1);
  });
  getSkillRowsFromUI(id).forEach(skill => {
    if (skill.name && skill.level > 0) totalXP += calcCumulativeXP(skill.level);
  });
  const xpDisplay = document.getElementById(`f${id}-xp`);
  if (xpDisplay) xpDisplay.innerText = `XP Spent: ${totalXP}`;
  updateSkillLevelCaps(id);
  renderPeggingTable(id);
}

function autoDistributePegs(id, key, totalVal, validLocs) {
  const inputs = validLocs.map(locId => document.getElementById(`f${id}-peg-${key}-${locId}`));
  const hasExistingValues = inputs.some(input => input && input.value !== "");

  if (hasExistingValues) {
    // Preserve manual allocations. If the stat ceiling changed, adjust only the
    // excess or newly required points instead of wiping the player's choices.
    let total = inputs.reduce((sum, input) => sum + (input && input.value !== "" ? (parseInt(input.value) || 0) : 0), 0);
    if (total > totalVal) {
      let excess = total - totalVal;
      for (let i = validLocs.length - 1; i >= 0 && excess > 0; i--) {
        const input = document.getElementById(`f${id}-peg-${key}-${validLocs[i]}`);
        if (!input) continue;
        const value = Math.max(0, parseInt(input.value) || 0);
        const remove = Math.min(value, excess);
        input.value = String(value - remove);
        excess -= remove;
      }
    } else if (total < totalVal && validLocs.length > 0) {
      const remaining = totalVal - total;
      const each = Math.floor(remaining / validLocs.length);
      const remainder = remaining % validLocs.length;
      validLocs.forEach((locId, index) => {
        const input = document.getElementById(`f${id}-peg-${key}-${locId}`);
        if (input) input.value = String((parseInt(input.value) || 0) + each + (index < remainder ? 1 : 0));
      });
    }
    return;
  }

  // Initial default: distribute points round-robin across valid locations
  // without a loop proportional to the chosen stat value.
  const distribution = {};
  if (validLocs.length > 0) {
    const each = Math.floor(totalVal / validLocs.length);
    const remainder = totalVal % validLocs.length;
    validLocs.forEach((locId, index) => {
      distribution[locId] = each + (index < remainder ? 1 : 0);
    });
  }
  validLocs.forEach(locId => {
    const input = document.getElementById(`f${id}-peg-${key}-${locId}`);
    if (input) input.value = String(distribution[locId] || 0);
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

function buildCreatorUI(resetFighterId = null) {
  const savedStats = {};
  const savedSkills = {};
  [1, 2].forEach(id => {
    savedStats[id] = {};
    if (id !== resetFighterId) {
      subStatDefs.forEach(stat => {
        const el = document.getElementById(`f${id}-s-${stat.key}`);
        if (el) savedStats[id][stat.key] = parseInt(el.value) || 0;
      });
      savedSkills[id] = getSkillRowsFromUI(id);
    } else savedSkills[id] = [];
  });

  [1, 2].forEach(id => {
    const caps = readPrimariesFromUI(id);
    const container = document.getElementById(`f${id}-substats`);
    if (!container) return;
    container.innerHTML = "";
    subStatDefs.forEach(stat => {
      const maxLevel = getStatMaxLevel(stat, caps);
      const previous = savedStats[id]?.[stat.key];
      const initial = previous === undefined ? (stat.key === "dexterity" ? 1 : 0) : previous;
      const value = Math.min(Math.max(0, initial), maxLevel);
      const pricing = stat.isSpecial ? "special · 2× XP · max 1 per 2 domain levels" : "ability · level capped by domain";
      container.insertAdjacentHTML("beforeend", `
        <div class="stat-row">
          <label for="f${id}-s-${stat.key}">${stat.label}
            <span class="stat-cap">(max ${maxLevel}; ${pricing})</span>
          </label>
          <input type="number" id="f${id}-s-${stat.key}" value="${value}" min="0" max="${maxLevel}" step="1" oninput="calculateTotalXP(${id})">
        </div>
      `);
    });
    renderSkillsEditor(id, savedSkills[id] || []);
    calculateTotalXP(id);
  });
}
buildCreatorUI();

function validateFighterSetup(id) {
  const errors = [];
  const primaries = {};
  [["body", "Body"], ["nerve", "Nerve"], ["character", "Character"]].forEach(([key, label]) => {
    const inputKey = key === "character" ? "char" : key;
    const raw = Number(document.getElementById(`f${id}-p-${inputKey}`)?.value ?? 0);
    if (!Number.isInteger(raw) || raw < 0) {
      errors.push(`${label} domain must be a non-negative whole number.`);
      primaries[key] = 0;
    } else primaries[key] = raw;
  });

  subStatDefs.forEach(stat => {
    const value = Number(document.getElementById(`f${id}-s-${stat.key}`)?.value ?? 0);
    const max = getStatMaxLevel(stat, primaries);
    if (!Number.isInteger(value) || value < 0 || value > max) errors.push(`${stat.label} must be a whole number between 0 and ${max} for its domain.`);

    if (!stat.isUnpegged) {
      const allocations = stat.validLocs.map(locId => {
        const el = document.getElementById(`f${id}-peg-${stat.key}-${locId}`);
        return { locId, value: el && el.value !== "" ? Number(el.value) : 0 };
      });
      allocations.forEach(item => {
        if (!Number.isInteger(item.value) || item.value < 0) errors.push(`${stat.label} allocation at ${locationNames[item.locId]} must be a non-negative whole number.`);
      });
      const sum = allocations.reduce((total, item) => total + item.value, 0);
      if (sum !== value) errors.push(`${stat.label} has ${sum} pegged point(s), but its value is ${value}.`);
    }
  });

  getSkillRowsFromUI(id).forEach((skill, index) => {
    if (!skill.name && skill.level === 0) return;
    if (!skill.name) errors.push(`Skill row ${index + 1} needs a name.`);
    const ability = availableAbilitiesForDomain(skill.domain).find(item => item.key === skill.ability);
    if (!ability) {
      errors.push(`Skill "${skill.name || index + 1}" must use an ability from its selected domain.`);
      return;
    }
    const abilityLevel = getAbilityLevel(id, skill.ability);
    if (!Number.isInteger(skill.level) || skill.level < 0 || skill.level > abilityLevel) errors.push(`Skill "${skill.name}" level must be between 0 and its ${ability.label} level (${abilityLevel}).`);
  });

  for (let loc = 1; loc <= 6; loc++) {
    const value = Number(document.getElementById(`f${id}-ar-${loc}`)?.value ?? 0);
    if (!Number.isInteger(value) || value < 0) errors.push(`Armour at ${locationNames[loc]} must be a non-negative whole number.`);
  }
  const weaponName = document.getElementById(`f${id}-w-name`)?.value?.trim() || "";
  if (!weaponName) errors.push("Weapon name is required.");
  const diceSides = Number(document.getElementById(`f${id}-w-dice`)?.value);
  const flat = Number(document.getElementById(`f${id}-w-flat`)?.value ?? 0);
  const pen = Number(document.getElementById(`f${id}-w-pen`)?.value ?? 0);
  if (!Number.isInteger(diceSides) || diceSides < 2) errors.push("Weapon die must have at least 2 sides.");
  if (!Number.isInteger(flat)) errors.push("Weapon flat damage must be a whole number.");
  if (!Number.isInteger(pen) || pen < 0) errors.push("Weapon Pen must be a non-negative whole number.");
  return errors;
}

function startBattle() {
  const validationErrors = [1, 2].flatMap(id => validateFighterSetup(id).map(error => `Fighter ${id}: ${error}`));
  if (validationErrors.length) {
    alert("Please fix the character setup before combat:\n\n" + validationErrors.slice(0, 12).join("\n"));
    return;
  }
  function readFighter(id) {
    const name = document.getElementById(`f${id}-name`)?.value || `Fighter ${id}`;
    const primaries = readPrimariesFromUI(id);
    const substats = {};
    subStatDefs.forEach(stat => { substats[stat.key] = parseInt(document.getElementById(`f${id}-s-${stat.key}`)?.value) || 0; });
    const weapon = new Weapon({
      name: document.getElementById(`f${id}-w-name`)?.value || "Unarmed",
      diceSides: parseInt(document.getElementById(`f${id}-w-dice`)?.value) || 6,
      scaling: document.getElementById(`f${id}-w-scale`)?.value || "none",
      flatDmg: parseInt(document.getElementById(`f${id}-w-flat`)?.value) || 0,
      pen: parseInt(document.getElementById(`f${id}-w-pen`)?.value) || 0
    });
    const armorMap = {};
    for (let i = 1; i <= 6; i++) armorMap[i] = parseInt(document.getElementById(`f${id}-ar-${i}`)?.value) || 0;
    const pegAllocations = { 1: {}, 2: {}, 3: {}, 4: {}, 5: {}, 6: {}, 7: {} };
    subStatDefs.filter(stat => !stat.isUnpegged).forEach(stat => {
      stat.validLocs.forEach(locId => {
        const count = parseInt(document.getElementById(`f${id}-peg-${stat.key}-${locId}`)?.value) || 0;
        if (count > 0) pegAllocations[locId][stat.key] = count;
      });
    });
    return new Fighter(name, primaries, substats, weapon, armorMap, pegAllocations, id === 1 ? "A" : "B", getSkillRowsFromUI(id).filter(skill => skill.name && skill.level > 0));
  }
  try {
    f1 = readFighter(1); f2 = readFighter(2);
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

function getRemainingAP(char) {
  return Math.max(0, Number(char?.actions?.ap) || 0);
}

function hasRemainingActions(char) {
  return isCombatCapable(char) && getRemainingAP(char) > 0;
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
  if (combatEnded || !char) { updateUI(); return; }
  if (!isCombatCapable(char)) {
    char.actions.ap = 0;
    advanceToNextActor();
    return;
  }

  log(`\n▶️ ${char.name}'s activation begins.`);
  const vitalDestroyed = Object.values(char.bodyPlan).some(loc => loc.isVital && loc.state === "destroyed");
  if (vitalDestroyed) {
    char.isDead = true; char.actions.ap = 0;
    log(`☠️ ${char.name} has suffered a destroyed vital location and dies.`, "log-damage");
    if (!checkEncounterComplete()) advanceToNextActor(); else updateUI();
    return;
  }

  const injuries = char.totalInjuries;
  const traumaPenalty = char.totalTraumaPenalty;
  const effectiveGumption = char.getEffectiveStat("gumption");
  if (injuries > char.currentWoundCap) {
    char.isUnconscious = true; char.actions.ap = 0;
    log(`💤 ${char.name} has ${injuries} injury/destroyed hit(s), exceeding Wound Capacity ${char.currentWoundCap}; they collapse.`, "log-damage");
    if (!checkEncounterComplete()) advanceToNextActor(); else updateUI();
    return;
  }
  if (injuries >= char.currentWoundCap) {
    const roll = d20();
    const painTolerance = getSkillBonus(char, "Pain Tolerance");
    const total = roll + effectiveGumption + painTolerance - traumaPenalty;
    log(`🧠 Gumption check: d20(${roll}) + Gumption(${effectiveGumption}) + Pain Tolerance(${painTolerance}) − Trauma(${traumaPenalty}) = ${total} (needs > 10)`, "log-check");
    if (total <= 10) {
      char.isUnconscious = true; char.actions.ap = 0;
      log(`💤 Check failed: ${char.name} falls unconscious.`, "log-damage");
      if (!checkEncounterComplete()) advanceToNextActor(); else updateUI();
      return;
    }
    log(`✨ ${char.name} remains conscious and can act.`);
  }
  updateUI();
}

function advanceToNextActor() {
  const outgoing = combatQueue[activeIndex];
  if (outgoing?.statuses?.shaken) {
    outgoing.statuses.shaken = false;
    log(`🌫️ ${outgoing.name}'s Shaken effect fades after their activation.`);
  }
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
      char.actions.ap = 0;
      continue;
    }
    if (hasRemainingActions(char)) {
      activeIndex = idx;
      startTurn(char);
      return;
    }
  }

  // Everyone has spent their action pool. Recalculate initiative for the new
  // round because injuries can disable pegged Initiative points.
  currentRound++;
  combatQueue.sort((a, b) => b.getEffectiveStat("initiative") - a.getEffectiveStat("initiative"));
  combatQueue.forEach(char => char.resetTurnActions());
  activeIndex = count - 1;
  log("========================================", "log-round");
  log(`--- ROUND ${currentRound} START ---`, "log-round");
  log(`Initiative: ${combatQueue.map(char =>
    `${char.name} (+${char.getEffectiveStat("initiative")})`
  ).join(" → ")}`, "log-round");
  advanceToNextActor();
}

function nextTurn() {
  const char = combatQueue[activeIndex];
  if (!char || combatEnded) return;
  char.actions.ap = 0;
  log(`⏭️ ${char.name} passes and forfeits remaining AP.`);
  advanceToNextActor();
}

function executeMove() {
  const char = combatQueue[activeIndex];
  if (!char || combatEnded || !isCombatCapable(char)) return;
  if (char.actions.ap < 1) { log("⚠️ No Action Points remaining."); return; }
  char.actions.ap -= 1;
  log(`👣 ${char.name} moves up to ${char.getMovementSpeed()} ft (1 AP). ${char.actions.ap} AP remain this round.`);
  if (char.actions.ap <= 0) advanceToNextActor(); else updateUI();
}

function executeIntimidate() {
  const attacker = combatQueue[activeIndex];
  const defender = attacker === f1 ? f2 : f1;
  if (!attacker || combatEnded || !isCombatCapable(attacker)) return;
  if (!isCombatCapable(defender)) { log("⚠️ There is no combat-capable target to intimidate."); return; }
  if (attacker.actions.ap < 1) { log("⚠️ Intimidate costs 1 AP."); return; }
  attacker.actions.ap -= 1;
  const attackDie = d10();
  const charisma = attacker.getEffectiveStat("charisma");
  const intimidation = getSkillBonus(attacker, "Intimidation");
  const attackTotal = attackDie + charisma + intimidation;
  const defenceDie = d10();
  const gumption = defender.getEffectiveStat("gumption");
  const bravery = getSkillBonus(defender, "Bravery");
  const defenceTotal = defenceDie + gumption + bravery;

  log(`😈 ${attacker.name} attempts to intimidate ${defender.name} (1 AP)...`);
  log(`Intimidation: d10(${attackDie}) + Charisma(${charisma}) + Intimidation(${intimidation}) = ${attackTotal} vs Defence: d10(${defenceDie}) + Gumption(${gumption}) + Bravery(${bravery}) = ${defenceTotal}.`);
  if (attackTotal > defenceTotal) {
    const alreadyShaken = !!defender.statuses.shaken;
    defender.statuses.shaken = true;
    log(alreadyShaken
      ? `⚡ ${defender.name} remains Shaken; the effect does not stack.`
      : `😨 ${defender.name} is Shaken: a temporary Aura injury (-2 trauma, may trigger a Gumption check, and disables Aura-pegged stats) until their next activation ends.`, "log-damage");
  } else {
    log(`🛡️ ${defender.name} withstands the intimidation.`);
  }
  advanceToNextActor();
}

function executeQuickParry() {
  const char = combatQueue[activeIndex];
  if (!char || combatEnded || !isCombatCapable(char)) return;
  if (char.actions.ap < 1) { log("⚠️ Quick Parry costs 1 AP."); return; }
  char.actions.ap -= 1;
  char.statuses.parryReady = true;
  log(`🛡️ ${char.name} spends 1 AP to prepare a Quick Parry. Their current HC bonus doubles against the next incoming attack.`);
  advanceToNextActor();
}

function executeAim() {
  const char = combatQueue[activeIndex];
  if (!char || combatEnded || !isCombatCapable(char)) return;
  if (char.actions.ap < 1) { log("⚠️ Aim / Set-up costs 1 AP."); return; }
  char.actions.ap -= 1;
  char.statuses.aimReady = true;
  log(`🎯 ${char.name} spends 1 AP to Aim / Set-up. Their next attack doubles effective Dexterity + the relevant weapon-skill bonus.`);
  advanceToNextActor();
}

function executeBreak() {
  const attacker = combatQueue[activeIndex];
  const defender = attacker === f1 ? f2 : f1;
  if (!attacker || combatEnded || !isCombatCapable(attacker)) return;
  if (!isCombatCapable(defender)) { log("⚠️ There is no combat-capable target for Break Stance."); return; }
  if (attacker.actions.ap < 2) { log("⚠️ Break Stance costs 2 AP."); return; }
  attacker.actions.ap -= 2;
  const targetWounds = defender.totalWoundsSum;
  const attRoll = d20() + attacker.getEffectiveStat("strength") + targetWounds;
  const defRoll = d20() + defender.getEffectiveStat("gumption");
  log(`🛡️ ${attacker.name} spends 2 AP to break ${defender.name}'s stance...`);
  if (attRoll > defRoll) {
    defender.statuses.brokenDefense = true;
    log(`💥 Success! ${defender.name}'s defence is broken; the next damaging hit gains +1 tier.`, "log-damage");
  } else log(`❌ Failed: ${defender.name} holds their ground.`);
  advanceToNextActor();
}

function applyLocationHit(location, tier) {
  if (tier === "grazed") {
    location.grazeCount++;
    if (location.state === "untouched") location.state = "grazed";
    return;
  }
  if (tier === "destroyed") {
    location.destroyedCount++;
    location.state = "destroyed";
    return;
  }
  location.injuryCount++;
  if (location.state !== "destroyed") location.state = "injured";
}

function executeAttack(isRushed = false) {
  const attacker = combatQueue[activeIndex];
  const defender = attacker === f1 ? f2 : f1;
  if (!attacker || combatEnded || !isCombatCapable(attacker)) return;
  if (!isCombatCapable(defender)) { log("⚠️ The target is no longer combat-capable."); return; }

  const cost = isRushed ? 1 : 2;
  if (attacker.actions.ap < cost) {
    log(`⚠️ ${isRushed ? "Rushed Attack" : "Committed Attack"} costs ${cost} AP.`);
    return;
  }
  attacker.actions.ap -= cost;

  const actionType = isRushed ? "RUSHED · 1 AP · d10" : "COMMITTED · 2 AP · d20";
  log(`💥 ${attacker.name} attacks ${defender.name} with [${attacker.equippedWeapon.name}] (${actionType})...`);

  const roll = isRushed ? d10() : d20();
  const dexterityBonus = attacker.getEffectiveStat("dexterity");
  const weaponSkillBonus = getWeaponSkillBonus(attacker);
  const baseAttackBonus = dexterityBonus + weaponSkillBonus;
  const aimed = !!attacker.statuses.aimReady;
  const hitBonus = aimed ? baseAttackBonus * 2 : baseAttackBonus;
  if (aimed) {
    attacker.statuses.aimReady = false;
    log(`🎯 Aim / Set-up applies: (Dex ${dexterityBonus} + weapon skill ${weaponSkillBonus}) doubles from ${baseAttackBonus} to ${hitBonus}.`);
  }

  const parrying = !!defender.statuses.parryReady;
  const hcBonus = defender.getEffectiveStat("hc");
  const targetHC = defender.baseHitClass + (parrying ? hcBonus : 0);
  if (parrying) {
    defender.statuses.parryReady = false;
    log(`🛡️ Quick Parry applies: HC bonus ${hcBonus} doubles; target HC is ${targetHC} for this attack.`);
  }

  const totalHit = roll + hitBonus;
  const isNat20 = !isRushed && roll === 20;
  if (!isNat20 && totalHit < targetHC) {
    log(`❌ Miss: ${roll} [${isRushed ? "d10" : "d20"}] + ${hitBonus} attack bonus = ${totalHit} vs HC ${targetHC}.`);
    advanceToNextActor();
    return;
  }

  const locRoll = d6();
  const location = defender.bodyPlan[locRoll];
  let scalingVal = 0;
  if (attacker.equippedWeapon.scaling === "strength") scalingVal = attacker.getEffectiveStat("strength");
  if (attacker.equippedWeapon.scaling === "finesse") scalingVal = attacker.getEffectiveStat("finesse");
  const rawDamage = Math.floor(Math.random() * attacker.equippedWeapon.diceSides) + 1 + scalingVal + attacker.equippedWeapon.flatDmg;
  const effectiveArmor = Math.max(0, location.armor - attacker.equippedWeapon.pen);
  const damageAfterArmor = rawDamage - effectiveArmor;
  log(`🎯 Hit on ${location.name} (d6=${locRoll}). Raw damage: ${rawDamage}; armour ${location.armor} − Pen ${attacker.equippedWeapon.pen} = ${effectiveArmor} effective armour.`);

  if (damageAfterArmor <= 0) log("🛡️ Armour absorbs the entire hit.");
  else {
    let newTier = "grazed";
    if (damageAfterArmor >= defender.baseToughness * 2) newTier = "destroyed";
    else if (damageAfterArmor >= defender.baseToughness) newTier = "injured";

    let upgradeSteps = 0;
    if (defender.statuses.brokenDefense) { upgradeSteps++; defender.statuses.brokenDefense = false; }
    if (isNat20) upgradeSteps++;
    if (upgradeSteps > 0) {
      const tiers = ["grazed", "injured", "destroyed"];
      const tierIndex = tiers.indexOf(newTier);
      newTier = tiers[Math.min(tiers.length - 1, tierIndex + upgradeSteps)];
      log(`⚡ Critical/broken-defence effect increases this hit by ${upgradeSteps} tier(s).`);
    }
    applyLocationHit(location, newTier);
    log(`🩸 Result: ${location.name} receives a ${newTier.toUpperCase()} hit. Location state: ${location.state.toUpperCase()} (grazes ${location.grazeCount}, injuries ${location.injuryCount}, destroyed hits ${location.destroyedCount}).`, "log-damage");
    if (location.isVital && location.state === "destroyed") {
      defender.isDead = true; defender.actions.ap = 0;
      log(`☠️ Fatal injury: ${defender.name}'s vital location is destroyed.`, "log-damage");
    }
  }
  if (!checkEncounterComplete()) advanceToNextActor(); else updateUI();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
}

function renderInitiativeTracker() {
  const el = document.getElementById("initiativeTracker");
  if (!el) return;
  if (!combatQueue.length) { el.innerHTML = ""; return; }
  let nextIdx = -1;
  if (!combatEnded) {
    for (let offset = 1; offset <= combatQueue.length; offset++) {
      const idx = (activeIndex + offset) % combatQueue.length;
      if (idx !== activeIndex && hasRemainingActions(combatQueue[idx])) { nextIdx = idx; break; }
    }
  }
  el.innerHTML = `
    <div class="initiative-heading">
      <div><span class="eyebrow">ROUND ${currentRound}</span><h3>${combatEnded ? "ENCOUNTER ENDED" : "INITIATIVE TRACKER"}</h3></div>
      <span class="queue-hint">${combatEnded ? "Combat is over" : "AP persists across interlaced activations"}</span>
    </div>
    <div class="initiative-list">
      ${combatQueue.map((char, idx) => {
        const isActive = idx === activeIndex && !combatEnded;
        const isNext = idx === nextIdx && !isActive && !combatEnded;
        const status = char.isDead ? "DEAD" : char.isUnconscious ? "UNCONSCIOUS" : isActive ? "ACTING NOW" : isNext ? "UP NEXT" : "IN QUEUE";
        const ap = getRemainingAP(char);
        return `
          <div class="initiative-entry ${isActive ? "is-active" : ""} ${isNext ? "is-next" : ""} ${!isCombatCapable(char) ? "is-out" : ""}">
            <div class="initiative-rank">${idx + 1}</div>
            <div class="initiative-person"><strong>${escapeHtml(char.name)}</strong><span>${status} · INIT +${char.getEffectiveStat("initiative")}</span></div>
            <div class="initiative-actions"><span class="action-chip ${ap > 0 ? "available" : ""}">AP ${ap}/${char.maxActionPoints}</span></div>
          </div>`;
      }).join("")}
    </div>`;
}

function renderCard(char, elId) {
  const el = document.getElementById(elId);
  if (!el || !char) return;
  const isActive = combatQueue[activeIndex] === char && !combatEnded;
  const canAct = isActive && isCombatCapable(char);
  const ap = getRemainingAP(char);
  const slotMap = { 1: "head", 2: "torso", 3: "larm", 4: "rarm", 5: "lleg", 6: "rleg", 7: "aura" };
  let paperDollHTML = `<div class="paper-doll">`;
  Object.entries(char.bodyPlan).forEach(([locId, loc]) => {
    const pegsSummary = loc.pegs && Object.keys(loc.pegs).length
      ? `<div class="peg-summary">${Object.entries(loc.pegs).map(([key, value]) => `${escapeHtml(key.substring(0,4))}:${value}`).join(" | ")}</div>` : "";
    paperDollHTML += `
      <div class="doll-slot loc-${loc.state} ${["injured","destroyed"].includes(loc.state) ? "is-disabled" : ""} ${loc.isVital ? "is-vital" : ""}">
        <div class="loc-name">${escapeHtml(loc.name)} ${loc.isVital ? "💔" : ""}</div>
        <div class="loc-armor">🛡️ Armour: ${loc.armor}</div>
        <div class="loc-status">${loc.state.toUpperCase()}</div>
        <div class="loc-wounds">G ${loc.grazeCount} · I ${loc.injuryCount} · D ${loc.destroyedCount}</div>
        ${pegsSummary}
      </div>`;
  });
  paperDollHTML += "</div>";
  el.classList.toggle("fighter-active", canAct);
  const scaleStatVal = char.equippedWeapon.scaling === "strength" ? char.getEffectiveStat("strength")
    : char.equippedWeapon.scaling === "finesse" ? char.getEffectiveStat("finesse") : 0;

  el.innerHTML = `
    <div class="fighter-card-head">
      <div><div class="eyebrow">${canAct ? "YOUR ACTIVATION" : char.isDead ? "DEAD" : char.isUnconscious ? "UNCONSCIOUS" : "COMBATANT"}</div>
      <h2>${escapeHtml(char.name)} ${char.isDead ? "☠️" : char.isUnconscious ? "💤" : ""}</h2></div>
      ${canAct ? '<span class="acting-pill">ACTING NOW</span>' : ""}
    </div>
    <div class="fighter-summary">
      <strong>Weapon:</strong> ${escapeHtml(char.equippedWeapon.name)} (d${char.equippedWeapon.diceSides} + ${scaleStatVal} stat + ${char.equippedWeapon.flatDmg} flat, Pen ${char.equippedWeapon.pen})<br>
      <strong>Stats:</strong> Toughness ${char.baseToughness} · HC ${char.baseHitClass} · Wound Capacity ${char.currentWoundCap}<br>
      <strong>Action Capacity:</strong> ${char.getEffectiveStat("actionCapacity")} · <strong>AP:</strong> ${ap}/${char.maxActionPoints} this round<br>
      <strong>Speed:</strong> ${char.getMovementSpeed()} ft per Move action<br>
      <strong>Wounds:</strong> Grazes ${char.totalGrazes} · Injury/destroyed hits ${char.totalInjuries} · Trauma penalty ${char.totalTraumaPenalty} ${char.statuses.brokenDefense ? "· 💥 DEFENCE BROKEN" : ""} ${char.statuses.shaken ? "· 😨 SHAKEN" : ""} ${char.statuses.parryReady ? "· 🛡️ PARRY READY" : ""} ${char.statuses.aimReady ? "· 🎯 AIMED" : ""}
    </div>
    <h4>Anatomical status</h4>${paperDollHTML}
    <h4 class="combat-actions-heading">Combat actions</h4>
    <div class="combat-actions">
      <button class="btn" ${!canAct || ap < 1 ? "disabled" : ""} onclick="executeMove()">👣 Move · 1 AP</button>
      <button class="btn" ${!canAct || ap < 1 ? "disabled" : ""} onclick="executeAttack(true)">⚡ Rushed attack · 1 AP · d10</button>
      <button class="btn" ${!canAct || ap < 2 ? "disabled" : ""} onclick="executeAttack(false)">⚔️ Committed attack · 2 AP · d20</button>
      <button class="btn" ${!canAct || ap < 1 ? "disabled" : ""} onclick="executeIntimidate()">😈 Intimidate · 1 AP · d10 vs d10</button>
      <button class="btn" ${!canAct || ap < 1 ? "disabled" : ""} onclick="executeQuickParry()">🛡️ Quick Parry · 1 AP</button>
      <button class="btn" ${!canAct || ap < 1 ? "disabled" : ""} onclick="executeAim()">🎯 Aim / Set-up · 1 AP</button>
      <button class="btn" ${!canAct || ap < 2 ? "disabled" : ""} onclick="executeBreak()">🛡️ Break stance · 2 AP</button>
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

function loadCharacterPreset(id, requestedPresetId = null) {
  if (typeof CHARACTER_PRESETS === "undefined") { alert("Character presets could not be loaded."); return; }
  const selector = document.getElementById(`f${id}-character-preset`);
  const presetId = requestedPresetId || selector?.value;
  const preset = CHARACTER_PRESETS[presetId];
  if (!preset) { alert("Choose a valid character preset first."); return; }
  if (selector) selector.value = presetId;
  document.getElementById(`f${id}-name`).value = preset.name;
  const raceInput = document.getElementById(`f${id}-race`);
  if (raceInput) raceInput.value = preset.race || "Human";
  document.getElementById(`f${id}-p-body`).value = preset.primaries.body;
  document.getElementById(`f${id}-p-nerve`).value = preset.primaries.nerve;
  document.getElementById(`f${id}-p-char`).value = preset.primaries.character;

  buildCreatorUI(id);
  subStatDefs.forEach(stat => {
    const input = document.getElementById(`f${id}-s-${stat.key}`);
    if (input) input.value = preset.substats[stat.key] ?? 0;
  });
  calculateTotalXP(id);
  subStatDefs.filter(stat => !stat.isUnpegged).forEach(stat => {
    stat.validLocs.forEach(locId => {
      const input = document.getElementById(`f${id}-peg-${stat.key}-${locId}`);
      if (input) input.value = String(preset.pegs?.[locId]?.[stat.key] ?? 0);
    });
    validatePegRow(id, stat.key, preset.substats[stat.key] ?? 0, stat.validLocs);
  });
  for (let locId = 1; locId <= 6; locId++) {
    const armorInput = document.getElementById(`f${id}-ar-${locId}`);
    if (armorInput) armorInput.value = preset.armor[locId] ?? 0;
  }
  renderSkillsEditor(id, preset.skills || []);
  calculateTotalXP(id);
}

function logIfCombatPresetApplied(name) {
  // Keep the creator flow quiet; presets are acknowledged directly in the setup screen.
  const status = document.getElementById("presetStatus");
  if (status) status.textContent = `Loaded preset: ${name}`;
}

function loadWeaponPreset(id, requestedPresetId = null) {
  if (typeof WEAPON_PRESETS === "undefined") { alert("Weapon presets could not be loaded."); return; }
  const selector = document.getElementById(`f${id}-weapon-preset`);
  const presetId = requestedPresetId || selector?.value;
  const preset = WEAPON_PRESETS[presetId];
  if (!preset) { alert("Choose a valid weapon preset first."); return; }
  if (selector) selector.value = presetId;
  document.getElementById(`f${id}-w-name`).value = preset.name;
  document.getElementById(`f${id}-w-dice`).value = preset.diceSides;
  document.getElementById(`f${id}-w-scale`).value = preset.scaling;
  document.getElementById(`f${id}-w-flat`).value = preset.flatDmg;
  document.getElementById(`f${id}-w-pen`).value = preset.pen;
}


function renderSkillsEditor(id, entries = null) {
  const container = document.getElementById(`f${id}-skills-editor`);
  if (!container) return;
  const skills = entries === null ? getSkillRowsFromUI(id) : entries;
  const domains = [{key:"body",label:"Body"},{key:"nerve",label:"Nerve"},{key:"character",label:"Character"}];
  const rows = skills.map((skill, index) => {
    const domain = domains.some(item => item.key === skill.domain) ? skill.domain : "body";
    const abilities = availableAbilitiesForDomain(domain);
    const ability = abilities.some(item => item.key === skill.ability) ? skill.ability : (abilities[0]?.key || "");
    const abilityLevel = getAbilityLevel(id, ability);
    return `
      <div class="skill-row" data-skill-index="${index}">
        <input class="skill-name" type="text" maxlength="80" placeholder="Skill name (e.g. Grappling)" value="${escapeHtml(skill.name || "")}" aria-label="Skill name" oninput="calculateTotalXP(${id})">
        <select class="skill-domain" aria-label="Skill domain" onchange="refreshSkillRow(${id}, ${index})">${domains.map(item => `<option value="${item.key}" ${item.key === domain ? "selected" : ""}>${item.label}</option>`).join("")}</select>
        <select class="skill-ability" aria-label="Skill ability" onchange="refreshSkillRow(${id}, ${index})">${abilities.map(item => `<option value="${item.key}" ${item.key === ability ? "selected" : ""}>${item.label} (Lv ${getAbilityLevel(id,item.key)})</option>`).join("")}</select>
        <input class="skill-level" type="number" min="0" max="${abilityLevel}" step="1" value="${Math.max(0, Number(skill.level) || 0)}" aria-label="Skill level" oninput="calculateTotalXP(${id})">
        <button class="btn btn-small btn-danger" type="button" aria-label="Remove skill" onclick="removeSkillRow(${id}, ${index})">Remove</button>
      </div>`;
  }).join("");
  container.innerHTML = rows || '<p class="empty-skills">No skills added yet. Add one to build a specialised path.</p>';
}
function addSkillRow(id) {
  const skills = getSkillRowsFromUI(id);
  skills.push({name:"",domain:"body",ability:"strength",level:0});
  renderSkillsEditor(id, skills);
}
function removeSkillRow(id, index) {
  const skills = getSkillRowsFromUI(id);
  skills.splice(index, 1);
  renderSkillsEditor(id, skills);
  calculateTotalXP(id);
}
function refreshSkillRow(id, index) {
  const skills = getSkillRowsFromUI(id);
  const skill = skills[index];
  if (!skill) return;
  const abilities = availableAbilitiesForDomain(skill.domain);
  if (!abilities.some(item => item.key === skill.ability)) skill.ability = abilities[0]?.key || "";
  renderSkillsEditor(id, skills);
  calculateTotalXP(id);
}
function characterDataFromUI(id) {
  const primaries = readPrimariesFromUI(id);
  const substats = {};
  subStatDefs.forEach(stat => { substats[stat.key] = parseInt(document.getElementById(`f${id}-s-${stat.key}`)?.value) || 0; });
  const armor = {};
  for (let loc = 1; loc <= 6; loc++) armor[String(loc)] = Math.max(0, parseInt(document.getElementById(`f${id}-ar-${loc}`)?.value) || 0);
  const pegs = {};
  subStatDefs.filter(stat => !stat.isUnpegged).forEach(stat => stat.validLocs.forEach(locId => {
    const value = Math.max(0, parseInt(document.getElementById(`f${id}-peg-${stat.key}-${locId}`)?.value) || 0);
    if (value > 0) { if (!pegs[String(locId)]) pegs[String(locId)] = {}; pegs[String(locId)][stat.key] = value; }
  }));
  const skills = getSkillRowsFromUI(id).filter(skill => skill.name && skill.level > 0)
    .map(skill => ({name:skill.name,domain:skill.domain,ability:skill.ability,level:skill.level}));
  return {
    schemaVersion:1, kind:"bmnc.character",
    name:document.getElementById(`f${id}-name`)?.value?.trim() || `Fighter ${id}`,
    race:document.getElementById(`f${id}-race`)?.value?.trim() || "Unspecified",
    team:id === 1 ? "A" : "B", primaries, substats, skills, armor,
    ...(Object.keys(pegs).length ? {pegs} : {}),
    weapon:{
      name:document.getElementById(`f${id}-w-name`)?.value?.trim() || "Unarmed",
      diceSides:parseInt(document.getElementById(`f${id}-w-dice`)?.value) || 6,
      scaling:document.getElementById(`f${id}-w-scale`)?.value || "none",
      flatDmg:parseInt(document.getElementById(`f${id}-w-flat`)?.value) || 0,
      pen:parseInt(document.getElementById(`f${id}-w-pen`)?.value) || 0
    }
  };
}
function validateCharacterData(data) {
  const errors = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) return ["File must contain a JSON object."];
  if (data.schemaVersion !== 1 || data.kind !== "bmnc.character") errors.push('Expected schemaVersion 1 and kind "bmnc.character".');
  if (typeof data.name !== "string" || !data.name.trim()) errors.push("Character name is required.");
  const primaries = data.primaries || {};
  ["body","nerve","character"].forEach(domain => {
    if (!Number.isInteger(primaries[domain]) || primaries[domain] < 0) errors.push(`Domain "${domain}" must be a non-negative whole number.`);
  });
  const stats = data.substats || {};
  subStatDefs.forEach(stat => {
    const value = stats[stat.key] ?? 0;
    const max = stat.isSpecial ? Math.floor((Number(primaries[stat.parent]) || 0) / 2) : (Number(primaries[stat.parent]) || 0);
    if (!Number.isInteger(value) || value < 0 || value > max) errors.push(`${stat.label} must be between 0 and ${max} for its domain.`);
  });
  if (!data.weapon || typeof data.weapon !== "object") errors.push("Weapon data is required.");
  else {
    if (!Number.isInteger(data.weapon.diceSides) || data.weapon.diceSides < 2) errors.push("weapon.diceSides must be an integer of at least 2.");
    if (!["strength","finesse","none"].includes(data.weapon.scaling)) errors.push("weapon.scaling must be strength, finesse or none.");
    if (!Number.isInteger(data.weapon.flatDmg)) errors.push("weapon.flatDmg must be a whole number.");
    if (!Number.isInteger(data.weapon.pen) || data.weapon.pen < 0) errors.push("weapon.pen must be a non-negative whole number.");
  }
  if (data.armor !== undefined) for (let loc = 1; loc <= 6; loc++) {
    const value = data.armor[String(loc)] ?? 0;
    if (!Number.isInteger(value) || value < 0) errors.push(`Armour at location ${loc} must be a non-negative whole number.`);
  }
  if (data.pegs && Object.keys(data.pegs).length) {
    subStatDefs.filter(stat => !stat.isUnpegged).forEach(stat => {
      let total = 0;
      stat.validLocs.forEach(locId => {
        const value = data.pegs[String(locId)]?.[stat.key] ?? 0;
        if (!Number.isInteger(value) || value < 0) errors.push(`${stat.label} peg values must be non-negative whole numbers.`);
        else total += value;
      });
      if (total !== (stats[stat.key] ?? 0)) errors.push(`${stat.label} pegging totals ${total}, but its value is ${stats[stat.key] ?? 0}.`);
    });
  }
  if (Array.isArray(data.skills)) data.skills.forEach((skill, index) => {
    if (!skill || typeof skill.name !== "string" || !skill.name.trim()) { errors.push(`Skill ${index + 1} needs a name.`); return; }
    const ability = availableAbilitiesForDomain(skill.domain).find(item => item.key === skill.ability);
    if (!ability) errors.push(`Skill "${skill.name}" has an ability/domain mismatch.`);
    else if (!Number.isInteger(skill.level) || skill.level < 0 || skill.level > (stats[skill.ability] ?? 0)) errors.push(`Skill "${skill.name}" level must not exceed its ability level.`);
  });
  else if (data.skills !== undefined) errors.push("skills must be an array.");
  return errors;
}
function applyCharacterDataToUI(id, data) {
  document.getElementById(`f${id}-name`).value = data.name;
  document.getElementById(`f${id}-race`).value = data.race || "Unspecified";
  document.getElementById(`f${id}-p-body`).value = data.primaries.body;
  document.getElementById(`f${id}-p-nerve`).value = data.primaries.nerve;
  document.getElementById(`f${id}-p-char`).value = data.primaries.character;
  document.querySelectorAll(`[id^="f${id}-peg-"]`).forEach(input => { input.value = ""; });
  buildCreatorUI(id);
  subStatDefs.forEach(stat => {
    const input = document.getElementById(`f${id}-s-${stat.key}`);
    if (input) input.value = data.substats?.[stat.key] ?? 0;
  });
  calculateTotalXP(id);
  if (data.pegs && Object.keys(data.pegs).length) {
    subStatDefs.filter(stat => !stat.isUnpegged).forEach(stat => {
      stat.validLocs.forEach(locId => {
        const input = document.getElementById(`f${id}-peg-${stat.key}-${locId}`);
        if (input) input.value = String(data.pegs[String(locId)]?.[stat.key] ?? 0);
      });
      validatePegRow(id, stat.key, data.substats[stat.key] ?? 0, stat.validLocs);
    });
  }
  for (let loc = 1; loc <= 6; loc++) document.getElementById(`f${id}-ar-${loc}`).value = data.armor?.[String(loc)] ?? 0;
  document.getElementById(`f${id}-w-name`).value = data.weapon.name;
  document.getElementById(`f${id}-w-dice`).value = data.weapon.diceSides;
  document.getElementById(`f${id}-w-scale`).value = data.weapon.scaling;
  document.getElementById(`f${id}-w-flat`).value = data.weapon.flatDmg;
  document.getElementById(`f${id}-w-pen`).value = data.weapon.pen;
  renderSkillsEditor(id, data.skills || []);
  calculateTotalXP(id);
}
function downloadTextFile(filename, content, type) {
  const blob = new Blob([content], {type});
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  URL.revokeObjectURL(url);
}
function exportCharacter(id, format) {
  const errors = validateFighterSetup(id);
  if (errors.length) { alert("Fix these character-sheet issues before exporting:\n\n" + errors.slice(0,12).join("\n")); return; }
  const data = characterDataFromUI(id);
  const safeName = data.name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"") || "character";
  if (format === "json") {
    downloadTextFile(`${safeName}.json`, JSON.stringify(data,null,2) + "\n", "application/json;charset=utf-8");
    return;
  }
  const domains = `Body ${data.primaries.body} · Nerve ${data.primaries.nerve} · Character ${data.primaries.character}`;
  const statLines = subStatDefs.map(stat => `  ${stat.label}: ${data.substats[stat.key]}${stat.isSpecial ? " (special, 2× XP, unpegged)" : ""}`).join("\n");
  const skillLines = data.skills.length ? data.skills.map(skill => `  ${skill.domain} > ${skill.ability} > ${skill.name}: ${skill.level}`).join("\n") : "  None";
  const armorLines = [1,2,3,4,5,6].map(loc => `  ${locationNames[loc]}: ${data.armor[String(loc)]}`).join("\n");
  const pegLines = data.pegs && Object.keys(data.pegs).length ? Object.entries(data.pegs).map(([loc,values]) => `  ${locationNames[loc] || loc}: ${Object.entries(values).map(([key,value]) => `${key} ${value}`).join(", ")}`).join("\n") : "  Auto-distribute on import";
  const weapon = data.weapon;
  const content = `BMNC CHARACTER SHEET\n===================\nName: ${data.name}\nRace/body-plan tag: ${data.race}\nEstimated build: ${domains}\n\nDOMAINS\n${domains}\n\nABILITIES\n${statLines}\n\nSKILLS\n${skillLines}\n\nARMOUR\n${armorLines}\n\nPEGGING\n${pegLines}\n\nWEAPON\n  ${weapon.name}\n  d${weapon.diceSides} + ${weapon.scaling} + ${weapon.flatDmg} flat; Pen ${weapon.pen}\n  Weapon skill: ${weapon.skill || "Fencing"}\n\nNOTE\nTXT is human-readable. Use JSON for round-trip import. Race/body-plan is descriptive only in this prototype.\n`;
  downloadTextFile(`${safeName}.txt`, content, "text/plain;charset=utf-8");
}
function importCharacterFile(id, input) {
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result || ""));
      const errors = validateCharacterData(data);
      if (errors.length) { alert("Character file could not be imported:\n\n" + errors.slice(0,14).join("\n")); return; }
      applyCharacterDataToUI(id, data);
      const selector = document.getElementById(`f${id}-character-preset`);
      if (selector) selector.value = "";
      const status = document.getElementById("presetStatus");
      if (status) status.textContent = `Imported "${data.name}" into Fighter ${id}. Race is a tag; racial rules are not active yet.`;
    } catch (error) { alert(`Could not read character JSON: ${error.message}`); }
    finally { input.value = ""; }
  };
  reader.onerror = () => { alert("Could not read that file."); input.value = ""; };
  reader.readAsText(file);
}

function clearCharacter(id) {
  const status = document.getElementById("presetStatus");
  const setValue = (suffix, value) => {
    const el = document.getElementById(`f${id}-${suffix}`);
    if (el) el.value = String(value);
  };
  setValue("name","New Character"); setValue("race","Human");
  setValue("p-body",0); setValue("p-nerve",0); setValue("p-char",0);
  const charPreset=document.getElementById(`f${id}-character-preset`);
  if(charPreset) charPreset.value="";
  const weaponPreset=document.getElementById(`f${id}-weapon-preset`);
  if(weaponPreset) weaponPreset.value="";
  document.querySelectorAll(`[id^="f${id}-peg-"]`).forEach(input=>{input.value="";});
  buildCreatorUI(id);
  subStatDefs.forEach(stat=>{
    const input=document.getElementById(`f${id}-s-${stat.key}`);
    if(input) input.value="0";
  });
  renderSkillsEditor(id,[]);
  for(let loc=1;loc<=6;loc++) setValue(`ar-${loc}`,0);
  setValue("w-name","Unarmed"); setValue("w-dice",4); setValue("w-scale","none"); setValue("w-flat",0); setValue("w-pen",0);
  calculateTotalXP(id);
  if(status) status.textContent=`Fighter ${id} cleared. Start with a blank character or load a preset.`;
}


/* Load sensible starter matchups while keeping every field editable. */
if (typeof CHARACTER_PRESETS !== "undefined" && typeof WEAPON_PRESETS !== "undefined") {
  loadCharacterPreset(1, "guts");
  loadCharacterPreset(2, "duelist");
  loadWeaponPreset(1, "greatsword");
  loadWeaponPreset(2, "sabre");
}
