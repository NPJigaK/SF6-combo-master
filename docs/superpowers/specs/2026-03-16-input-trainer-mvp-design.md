# SF6 Combo Master Input Trainer MVP Design

Date: 2026-03-16
Status: Approved design snapshot

## 1. MVP Product Contract

SF6 Combo Master MVP is an input trainer only, not a full combo lab. MVP ships curated built-in drills only, uses the same core practice model on web and desktop, stores progress locally only, and grades attempts with strict pass/fail against an app-defined frozen reference ruleset modeled after visible SF6 behavior.

The product is beginner-first in onboarding, feedback clarity, and content selection, but not in grading leniency. Grading is skill-agnostic. Visual feedback is the primary teaching surface, with optional sound. English and Japanese are supported in MVP, while all internal IDs and authored content stay locale-neutral.

Desktop must work fully offline after install. Web practice must not depend on a server once the app has loaded. MVP uses generic motion-family drills and common command-language labels, structured versioned drill definitions, and no official SF6 art, audio, copyrighted game data, or claims of official correctness or validation.

## 2. Reference Ruleset and Input Profile

### 2.1 Versioned artifacts

MVP ships with:

- `sf6cm-reference-ruleset@1.0.0`
- `sf6cm-input-profile@1`

The shipped ruleset is app-defined and frozen. It is calibrated against, but not claimed to be equivalent to, a pinned SF6 retail comparison baseline.

### 2.2 External comparison baseline metadata

The ruleset metadata must record:

- retail platform or snapshot label
- exact patch or build label
- verification date
- relevant control and profile assumptions
- Button Release Input status
- notes describing which visible Input History semantics and command-window behaviors were calibrated

This baseline exists for calibration, QA, and regression tracking. Product language must still say that the app grades against its own frozen reference ruleset.

### 2.3 Motion-family scope for `v1`

`sf6cm-reference-ruleset@1.0.0` covers only:

- `QCF`
- `QCB`
- `DPF`
- `DPB`
- `charge_back_forward`
- `charge_down_up`
- `double_QCF`
- `double_QCB`

Half-circle, 360, and 720 motions are out of scope for `v1`.

### 2.4 Time base and grading authority

The grading source of truth is a bounded ring buffer of resolved logical controller state at 60fps. Raw backend timestamps may be captured, but they are optional debug metadata only. Canonical paths, accepted shortcuts, timing windows, charge windows, input-history display semantics, and grading boundaries are all evaluated in frame terms on the shared logical timeline.

Visible Input History semantics are versioned alongside the same frozen ruleset and input-profile baseline. Any change that materially changes grading semantics or visible input-history semantics requires a new versioned artifact rather than a silent behavior change.

### 2.5 Direction normalization

If the backend already supplies a single resolved directional state in the shared directional alphabet, use that resolved state as-is.

If unresolved opposite directions survive into the shared grading layer, neutralize that axis before grading:

- `left + right -> neutral horizontal`
- `up + down -> neutral vertical`

Diagonals are derived only from non-conflicting axes. Neutralized opposites count as holding neither direction on that axis for motion checks, shortcut checks, overlap checks, and charge checks.

### 2.6 Attempt boundary

A graded attempt exists at any terminal attack event allowed by the active input profile:

- press by default in the MVP-shipped profile
- release only when the active ruleset or input profile explicitly enables Button Release Input

At that terminal event, grading evaluates:

- the authored motion family
- canonical paths
- accepted shortcut variants
- family-specific timing and charge constraints
- the authored terminal-input requirement

This rule is required so wrong-button cases become explicit graded failures instead of being ignored. Directional completion by itself may exist as internal state or optional debug preview state, but it is not an authoritative pass or fail boundary.

### 2.7 Family-targeted grading

The grader is drill-target-first, not a global move parser. At the terminal event, it evaluates only the motion family authored by the current drill. Valid matches from other motion families may be recorded as debug metadata but must not affect pass or fail.

Tie-breaking within the authored family is:

1. canonical match over shortcut match
2. latest valid completion nearest the terminal event
3. shortest valid backward span

### 2.8 Canonical paths, shortcuts, and rejected cases

Shortcut handling is strict and explicit:

- always accept the canonical motion path for each motion family
- accept only a small, whitelisted set of common SF6-style shortcut variants authored per motion family
- reject any shortcut not explicitly listed in the active ruleset
- never use broad fuzzy recognition

Canonical matching is contiguous:

- repeated holds of the current required step are allowed
- step-to-step limits remain motion-family data
- inserted neutral or unrelated directional states break the canonical match
- if a non-canonical pattern should pass, it must be authored as an accepted shortcut variant

Ruleset data must keep these separate:

- accepted canonical paths
- accepted shortcut variants
- representative named rejected patterns or stable rejection categories used for deterministic failure messaging

Rejected data is not an exhaustive negative list.

### 2.9 Family-specific timing tables

Each motion family has its own explicit authored timing data, including:

- total lookback window
- per-step timing or continuity limits where needed
- terminal button-link window
- charge minimums for charge motions
- any family-specific accepted special handling

Core timing behavior must not be hidden in shared defaults. If two families happen to share values, each family still authors those values explicitly.

The design freezes the contract shape, strictness policy, and calibration process. Exact numeric frame values belong in the bundled `sf6cm-reference-ruleset@1.0.0` artifact and must be pinned before shipping through calibration against the recorded retail baseline.

### 2.10 Button Release Input policy

Button Release Input is a real ruleset or input-profile capability in `v1`, not hidden leniency.

- the shipped MVP default profile keeps it off
- built-in MVP drills are authored and taught assuming press-first grading
- if a future profile enables release input, the same drill may be graded with release-terminal behavior without changing the drill's authored motion family

## 3. Drill-Definition Contract

### 3.1 Built-in catalog identity

MVP built-in drills use generic motion-family and common command-language labels as their primary identity, not explicit SF6 move names.

Examples:

- `波動 / QCF`
- `昇竜 / DPF`
- `真空 / double QCF`

This naming rule applies across English and Japanese presentation. Internal drill identity always comes from locale-neutral IDs.

### 3.2 Locale-neutral authored schema

Each built-in drill is a locale-neutral, versioned record pinned to an exact ruleset version. The schema must be future-shareable and human-inspectable.

Required authored fields include:

- `drill_id`
- `reference_ruleset_version`
- `motion_family_id`
- `terminal_requirement_kind`
- `terminal_requirement_value`
- `notation_tokens`
- `title_key`
- `short_description_key`
- curriculum or catalog metadata

Optional authored fields may include:

- ordering or grouping metadata
- onboarding tags
- difficulty labels for presentation
- recommended practice hints

The drill schema does not encode leniency. Pass and fail behavior always comes from the active ruleset and input profile.

### 3.3 Authored terminal-input contract

The schema supports these terminal requirement kinds:

- `exact`
- `button_family`
- `any_attack`

`exact` must support exact terminal tokens, not only single buttons. Examples include `LP`, `MP`, `HP`, `LK`, `MK`, `HK`, `PP`, and `KK`.

Built-in canonical special-move drills in core `v1` follow this default policy:

- usually use `button_family` for generic drills such as `QCF+P`, `QCB+K`, `DPF+P`, and `double_QCF+P`
- use `exact` only when intentionally targeting a strength-specific or otherwise exact variant
- do not use `any_attack` as the default for core `v1` built-ins

### 3.4 Future combo boundary

Future combo training should use a separate content-package type rather than overloading the motion-drill schema. That package may reference the same motion-family IDs, notation tokens, ruleset versions, and input profiles, but combo sequencing, cancels, links, and rhythm structure are not part of the MVP drill schema.

## 4. Localization Boundary

MVP supports English and Japanese presentation while keeping authored content, rulesets, and persisted records locale-neutral.

Localize:

- shell UI text
- settings labels and help text
- motion-family display labels
- drill names and short descriptions
- button-family and button-token labels shown to users
- failure-reason messages
- onboarding and support copy
- any visible input-history labels that are language-bearing

Keep locale-neutral:

- internal IDs
- motion-family IDs
- drill IDs
- ruleset keys and version identifiers
- failure-reason keys
- notation tokens
- persisted progress and recent-attempt records
- authored drill and ruleset structure

Browser or OS language may choose the initial locale, but explicit user selection overrides auto-detection. Locale affects presentation only and must never change grading, persistence meaning, or support contracts.

## 5. Parity and Support Contracts

### 5.1 Web and desktop parity

The same:

- `drill_id`
- `reference_ruleset_version`
- `input_profile`
- normalized 60Hz logical frame timeline

must produce the same:

- pass or fail result
- primary authoritative failure key
- canonical or shortcut classification
- visible input-history semantics

Platform differences are allowed only in packaging, installation, offline behavior, controller discovery, and environment warnings. Unsupported environments must warn or block graded practice rather than silently changing grading behavior.

### 5.2 Web support contract

Officially supported for MVP:

- current desktop Chromium browsers on Windows and macOS
- current Firefox desktop on Windows and macOS
- standard-mapped gamepads only

Not officially supported for MVP:

- Safari
- non-standard mappings

Web practice must not depend on a server once the app has loaded.

### 5.3 Desktop support contract

Officially supported for MVP:

- Windows desktop
- XInput-compatible controllers

Not officially supported for MVP:

- non-XInput desktop devices
- raw-input or DirectInput support promises

Desktop must work fully offline after install.

### 5.4 Keyboard boundary

Keyboard is not a graded practice input in MVP. The surrounding UI should still remain readable and as controller-optional as practical for navigation and settings.

## 6. Persistence Boundary

All MVP persistence is local-only.

Persist:

- selected locale
- active input profile
- notation and settings preferences
- aggregate per-drill progress
- bounded recent-attempt history

Do not persist by default:

- full frame-state timelines
- raw backend samples
- heavy debug traces
- unbounded attempt history

### 6.1 Aggregate per-drill progress

Aggregate progress should include values such as:

- total attempts
- total successes
- current streak
- best streak
- success rate
- last-practiced timestamp

### 6.2 Recent-attempt summary schema

The bounded recent-attempt history remains summary-only. Each persisted record should stay narrow and include:

- `drill_id`
- `ruleset_version`
- `input_profile`
- `terminal_requirement_kind`
- pass or fail result
- `primary_failure_key`
- canonical or shortcut classification
- compact frame-span summary
- timestamp

Optional narrow additions are acceptable if they stay summary-only and do not become a proxy for full trace retention.

## 7. Failure-Reason Model

The grader produces one authoritative, locale-neutral primary failure key per failed attempt. The UI maps that key to a short, beginner-friendly localized message in English and Japanese.

Representative failure-key families include:

- `missing_step`
- `extra_direction_break`
- `window_expired`
- `charge_insufficient`
- `terminal_input_mismatch`
- `release_not_allowed`
- `shortcut_not_whitelisted`

Requirements:

- keys must stay stable and locale-neutral
- persisted summary records store the key, not verbose parser output
- the same key must be produced on web and desktop for the same graded attempt
- parser-internal detail and raw frame counts are not part of the default MVP user surface

The spec also requires deterministic primary-failure selection so the same attempt always yields the same authoritative reason.

## 8. Testing Boundaries

Treat the ruleset and input-profile pair as a conformance artifact.

Automated coverage must include:

- golden tests for each motion family's canonical paths
- golden tests for accepted shortcut variants
- golden tests for representative rejected categories
- timing-window and charge-window tests
- terminal-input requirement tests, including wrong-button failure cases
- Button Release Input policy tests
- deterministic primary-failure selection tests
- parity tests showing identical grading from the same normalized frame timeline on web and desktop
- Input History Display conformance tests tied to the pinned baseline semantics
- localization tests proving locale does not affect grading or persistence meaning
- persistence schema and migration tests

Manual QA only needs to cover the official support matrix:

- supported browsers and standard-mapped pads on web
- supported XInput-compatible devices on desktop

Partial behavior outside the support contract may be observed, but it is not required for MVP signoff.

## 9. Post-MVP Recommendations

### 9.1 Controller expansion

If desktop controller support expands beyond XInput, it should do so through explicit controller profiles and a new backend strategy, not through vague "most controllers" claims or hidden grading differences.

### 9.2 Telemetry

Anonymous telemetry is out of scope for MVP. If added later, it should be explicit opt-in, minimal, and separate from required practice flow. Compatibility or completion telemetry is acceptable only under that consent model.

### 9.3 Future combo training

Combo training should layer on the same shared motion-family and notation primitives, but it should use a separate content-package model rather than the motion-drill package itself.

## 10. Explicit MVP Non-Goals

MVP does not include:

- a full combo lab
- combo authoring or guided combo flows
- custom drill authoring
- import or export
- public sharing
- accounts or cloud sync
- official SF6 move names as drill identity
- official SF6 art, audio, or copyrighted game data
- claims of official SF6 correctness or validation
