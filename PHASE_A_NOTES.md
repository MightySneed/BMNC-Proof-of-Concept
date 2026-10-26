# Phase A — Stabilisation Notes

This branch is an incremental pass on the existing HTML/CSS/JavaScript proof of concept. It does not replace the original `master` branch.

## Included in this pass

- Preserve the other fighter's current stat values when rebuilding character-creator controls.
- Prevent combat from starting with invalid sub-stat levels or incomplete/over-allocated stat pegs.
- Reconcile peg totals when a sub-stat value changes, preserving manual allocation choices where possible.
- Add reusable character and weapon presets in `data/presets.js`. They are local static data for now, not a backend or persistent content service.
- Introduce interlaced action advancement: after an action resolves, the queue advances to the next combatant with actions remaining. A round resets only after the available action pools are exhausted.
- Highlight the active fighter and show initiative, action pools, the next available fighter, and incapacitated status in the tracker.
- Re-sort initiative at the start of each new round based on current effective Initiative, so a location injury that disables a pegged Initiative point can affect the next round.
- Track grazes and injuries separately for each location. Repeated injuries at a disabled location increase the injury count without applying its pegged-stat penalty repeatedly.
- Keep Quick Actions gained from Base-to-Quick conversion separate from stat-granted Quick Actions. Injuring a location can disable its pegged Quick Action capacity without deleting converted actions.
- Use feet for movement display. The previous `3` movement units per functional leg were interpreted as metres and converted to approximately `10 ft` per leg.
- Reject attacks against a dead or unconscious opponent, and end the current duel when one side has no combat-capable fighter remaining.
- A destroyed vital location causes immediate death. Other wound-cap/Gumption checks remain at the beginning of character activation rather than being moved to the moment damage is taken.

## Rules interpretations used in this branch

These are implementation assumptions for testing, not a claim that every rule has been finalised:

1. **Activation checks:** each time a combatant is selected to act in the interlaced queue, their activation-start wound-cap/Gumption check is evaluated before choosing an action. If they fail, they lose their remaining actions and are skipped. This should be playtested for the intended dramatic pacing.
2. **Injury counts versus location state:** each damaging hit that reaches the Injured or Destroyed damage tier increments the location's injury count. The functional state is not escalated merely because the injury count increases; however, a later hit whose own damage meets the Destroyed threshold can destroy that location.
3. **Movement conversion:** `3 m` per functioning leg has been converted to approximately `10 ft` per leg. Two functioning legs therefore display `20 ft` per Quick Action. Confirm this against the intended movement scale before building grid distances around it.
4. **Initiative changes:** initiative order is preserved during a round and recalculated at the next round start.
5. Existing base-stat formulas, damage thresholds, critical upgrades, broken-defence effects, and other partially documented rules are otherwise retained rather than redesigned in this pass.

## Presets

Four character presets are included:

- Guts — Heavy Mercenary
- Agile Duelist
- Goblin Bruiser
- Balanced Guard

Five weapon presets are included:

- Greatsword
- Sabre
- Unarmed
- Scrap Club
- Spear

Presets fill the editable fields. They are a low-friction interim solution to manual setup; persistent storage and backend management remain future work.

## Still out of scope

- Backend persistence, accounts, shared libraries, and a rules/content API.
- Grid positioning, pathing, range, terrain, and line of sight.
- Multi-character target selection and full squad/team encounter control. Team-aware encounter state is a small foundation only; attacks still target the other fighter in the two-character test bench.
- Stabilisation actions, Willpower auto-pass, Aura-targeting effects, and social/roleplaying stats.
- A full automated browser test suite. This pass was checked for JavaScript syntax, HTML tag nesting, preset stat/peg validity, and basic Fighter-model behavior, but has not yet been playtested in a real browser session.

## Manual smoke-test checklist

1. Load each character preset and verify the other fighter's values remain unchanged.
2. Change a primary stat and confirm existing sub-stats are preserved within new limits and peg totals remain valid.
3. Start a battle; confirm the current actor is visually obvious and the tracker updates after each action.
4. Compare a Base attack and Quick attack: the former uses d20 to hit, the latter d10, and either deals normal weapon damage if it hits.
5. Injure a location with pegged Quick Actions and confirm the stat-granted action pool is reduced, while converted Quick Actions remain.
6. Hit the same location repeatedly and confirm the injury count increases without multiplying the disabled-stat penalty.
7. Confirm a destroyed vital location kills immediately, and the duel ends when the opponent has no combat-capable fighter.
8. Pass remaining actions and confirm a new round begins only after available action pools are exhausted, with initiative re-evaluated for the new round.
