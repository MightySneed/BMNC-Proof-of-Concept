# Character Builder V2.2 — Current Prototype Notes

## Character creation
- Each fighter can be cleared to a blank build; starter presets remain on load.
- Character-domain validation maps the UI's `p-char` field to the internal `character` domain.
- Over-cap skills are highlighted instead of silently lowered. Advanced stat pegging is collapsible. Armour inputs remain responsive.
- Weapon sheets now include a weapon-skill selector: Fencing, Martial Arts, Archery or None. Weapon skill is exported in JSON and defaults correctly for older character files that do not include the field.

## Point-buy and AP
- Cumulative cost per level: `level × (level + 1) / 2`.
- Hierarchy: Domain → Ability → Skill; ordinary abilities cap at their domain and skills cap at their selected ability.
- Toughness, Wound Capacity, HC, Action Capacity and Willpower are unpegged special stats, cost 2× cumulative XP and cap at floor(parent domain / 2).
- The AP pool is unpegged. Current round budget remains `2 + effective Action Capacity`; location injuries do not directly remove AP. Action Capacity remains the separately purchased modifier to that pool.

## Combat actions added for this test
- **Intimidate:** 1 AP; attacker rolls d10 + effective Charisma + Intimidation, defender rolls d10 + effective Gumption + Bravery. A strict attacker win applies Shaken; ties are resisted.
- **Quick Parry:** 1 AP; a non-movement action that doubles the current HC bonus against the next incoming attack. It is consumed by that attack.
- **Aim / Set-up:** 1 AP; a non-movement action that doubles (effective Dexterity + matching weapon-skill bonus) on the next attack.
- Weapon attacks add the character's matching weapon skill (Fencing, Martial Arts, Archery, or None) to effective Dexterity. If Aim is prepared, the full Dexterity-plus-skill modifier is doubled for the next attack.
- Shaken remains a temporary Aura injury; Pain Tolerance adds to activation-start Gumption checks.
- Quick Parry and Aim are basic status toggles in the current two-fighter sandbox. They do not use range, grid position or line of sight yet.

## Limits still in force
- Race tags remain descriptive; racial baselines and alternate body plans are not applied by the digital engine.
- Grid coordinates, Disengage/opportunity attacks and Overwatch are not implemented digitally.
- Willpower expenditure, stabilisation and Fencing/Martial Arts/Archery's other possible effects remain future work.
