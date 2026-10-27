# Character Builder V2.1 — Current Prototype Notes

## Character builder improvements

- Starter presets still load on page start. Each fighter now has a Clear character button for a blank build without affecting the other fighter.
- The Character domain uses the `p-char` form field and is stored internally as `character`.
- Skills that exceed their selected ability level are highlighted in red and block combat until corrected. Values are preserved for the player to decide how to resolve them.
- Stat pegging is collapsed under an Advanced disclosure and the table scrolls horizontally. Armour fields have larger responsive widths.

## Point-buy

- Cumulative level cost: `level × (level + 1) / 2`.
- Hierarchy: Domain → Ability → Skill. Ordinary abilities cap at their domain. A skill chooses its domain and ability and caps at the chosen ability.
- Toughness, Wound Capacity, HC, Action Capacity and Willpower are unpegged, cost twice the cumulative level cost, and cap at floor(parent domain / 2).

## Experimental Intimidate

- Cost: 1 AP; a non-movement action that ends the current activation.
- Attacker: d10 + effective Charisma + Intimidation skill.
- Defender: d20 + effective Gumption + Bravery skill.
- A strictly higher attacker total inflicts Shaken; ties are resisted.
- Shaken acts as a temporary Aura injury: disables Aura-pegged stats, counts as one injury, and adds −2 trauma to the activation-start Gumption check. It does not stack and expires when the affected character's next activation ends.
- Pain Tolerance adds to Gumption checks. The opposed dice choice and success rate need tabletop testing. Forced flight/automatic Gumption failure is not implemented.

## Current combat playtest limits

- Round AP budget: `2 + effective Action Capacity`. Move costs 1 AP and can repeat. Rushed Attack costs 1 AP/d10; Committed Attack costs 2 AP/d20; both deal normal weapon damage on a hit.
- Head and Torso are vital in the current human body plan. Speed is 5 ft per functional leg.
- Skills are saved/imported. Intimidation, Bravery and Pain Tolerance have prototype mechanics; Fencing, Martial Arts and Archery are future candidate modifiers.
- Race/body-plan tags are descriptive only; racial baselines and alternate body plans are not implemented.
- Grid movement, Disengage/opportunity attacks, Overwatch, stabilisation, Willpower spending, team targeting, and additional skill hooks remain future work.
