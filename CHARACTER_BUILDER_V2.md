# BMNC Character Workshop v2 — Working Rules

This is a prototype reference for the character builder and the current combat test. The point-buy formula and Action Point costs are test rules, not final balance.

## Character file format

- The canonical import/export format is JSON, with `schemaVersion: 1` and `kind: "bmnc.character"`.
- `data/character-schema.json` describes the file format.
- `examples/kledd.json` is a working example based on the Kledd build discussed during design.
- The builder can import JSON and export JSON or a readable TXT sheet. TXT is not an import format.
- If `pegs` is omitted, the builder automatically distributes ordinary ability points across legal locations. If supplied, pegs must add up to the corresponding ability levels.
- `race` is retained as a descriptive tag. Race-specific baselines and body plans are not yet applied by combat.

## Point-buy

All purchased levels use the same cumulative cost curve:

`cost(level) = 1 + 2 + ... + level = level × (level + 1) / 2`

The hierarchy is:

`Domain → Ability → Skill`

- A domain costs the cumulative cost of its level.
- An ordinary ability costs the cumulative cost of its level and cannot exceed its parent domain.
- A skill costs the cumulative cost of its level and cannot exceed the ability selected for that skill.
- Each skill records its domain and ability path, allowing the same concept (for example, Grappling) to be built through different attributes.

Example:

- Body 2 costs 3 XP.
- Strength 2 costs 3 XP.
- Grappling 1 under Body → Strength costs 1 XP.
- Total: 7 XP.

Body 3 → Strength 3 → Grappling 1 costs 6 + 6 + 1 = 13 XP.

### Special, unpegged stats

Toughness, Wound Capacity, Hit Class (HC), Action Capacity and Willpower are unpegged. Their level cap is the floor of half their parent domain, and their XP cost is twice the cumulative cost curve.

For example, Nerve 2 allows HC 1 and Action Capacity 1. Each level costs 2 XP. Nerve 3 still allows only level 1; Nerve 4 allows level 2.

| Special stat | Parent domain | Current prototype use |
|---|---|---|
| Toughness | Body | Base Toughness = 5 + purchased level |
| Wound Capacity | Body | Injury limit = 1 + purchased level |
| HC | Nerve | Hit Class = 10 + purchased level |
| Action Capacity | Nerve | Adds to the round's AP budget |
| Willpower | Character | Point-buy placeholder; its resource effect is not implemented yet |

## Current Action Point playtest model

- Round budget: `2 + effective Action Capacity` AP.
- Move: 1 AP; move up to Speed. Multiple consecutive Move actions are allowed.
- Rushed Attack: 1 AP, d10 to hit, normal weapon damage on a hit.
- Committed Attack: 2 AP, d20 to hit, normal weapon damage on a hit.
- Break Stance: 2 AP in this prototype.
- A non-movement action ends the current activation. Unspent AP remains available on the character's next interlaced activation within the round.
- When all combatants have spent their AP, a new round begins and AP refreshes.

The current prototype has no grid or position tracking, so Move spends AP and reports the distance rather than changing a token's coordinates. Disengage, opportunity attacks and Overwatch are not implemented in this build.

## Speed, locations and trauma

- Current human/grid baseline: 5 ft per functional leg (10 ft for two functional legs). Race-specific speed is not applied yet.
- Physical attacks roll a d6 for Head, Torso, Left Arm, Right Arm, Left Leg, Right Leg. Aura/System remains outside physical hit-location rolls.
- Head and Torso are currently marked vital.
- Graze, Injury and Destroyed hits accumulate separately by location. Repeated hits do not multiply the stat penalty for an already-disabled location.
- Gumption checks happen at the start of a character activation once injury/destroyed hits reach Wound Capacity. Current trauma penalty: Graze −1, Injury −2, Destroyed −3. The roll is d20 + effective Gumption − trauma penalty; a result over 10 passes.
- The current rule for exceeding Wound Capacity is immediate collapse. More nuanced unconsciousness, fleeing, Willpower use and stabilisation remain open design work.

## Known scope limits

This build remains a two-fighter prototype. It does not yet implement racial baselines, arbitrary body plans, movement coordinates, disengagement/opportunity attacks, Overwatch, Aura-targeted effects, leadership actions or the Willpower resource. Skill rows are saved and costed but do not yet modify combat rolls.
