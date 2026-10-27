# Character Builder V2.2 — Current Prototype Notes

## Character builder usability

- Starter presets remain loaded on page start. Each fighter has a Clear character button for a blank build without affecting the other fighter.
- The Character domain is mapped from the form's `p-char` input to the internal `character` key.
- Skill levels above their selected ability are highlighted in red and block combat until corrected.
- Stat pegging is under a collapsed Advanced section with horizontal scrolling; armour fields use wider responsive inputs.

## Point-buy

- Cumulative level cost: `level × (level + 1) / 2`.
- Hierarchy: Domain → Ability → Skill. Ordinary abilities cap at their domain. Skills choose a domain and ability and cap at that ability.
- Toughness, Wound Capacity, HC, Action Capacity and Willpower are unpegged, cost twice the cumulative level cost, and cap at floor(parent domain / 2).
- Action Points are an unpegged round resource pool, not a pegged stat. Round budget: `2 + effective Action Capacity`.

## Experimental combat actions

**Intimidate (1 AP):** attacker rolls d10 + effective Charisma + Intimidation; defender rolls d10 + effective Gumption + Bravery. A strict win applies non-stacking Shaken, which acts as a temporary Aura injury, counts as one injury, and adds −2 trauma until the target's next activation ends.

**Quick Parry (1 AP):** readies a defence against the next incoming attack. It doubles the target's current HC bonus for that attack, then is consumed. For example, HC +2 raises target HC from 12 to 14.

**Aim / Set-up (1 AP):** readies the next attack. It doubles the combined effective Dexterity + relevant weapon skill bonus, then is consumed.

Weapon skill lookup in this prototype is deliberately simple: Unarmed uses Martial Arts; weapon names containing Bow, Crossbow or Sling use Archery; other named weapons use Fencing. Skills are bounded by their selected ability's effective level. Weapon categories should become explicit schema data before the content set grows.

**Pain Tolerance** adds to activation-start Gumption checks; **Bravery** adds to Intimidate defence. The d10-vs-d10 Intimidate outcome, Quick Parry and Aim / Set-up all need tabletop playtest.

## Current combat playtest limits

- Move costs 1 AP and may be repeated; Rushed Attack costs 1 AP/d10 and Committed Attack costs 2 AP/d20. Both deal normal weapon damage on a hit.
- Head and Torso are vital in the current human body plan. Human speed is 5 ft per functional leg.
- Race/body-plan tags are descriptive only. Racial baselines and alternate anatomy are not implemented in digital combat.
- Grid movement, Disengage/opportunity attacks, Overwatch, stabilisation, Willpower spending, multi-target combat, and more complex leadership effects remain future work.
