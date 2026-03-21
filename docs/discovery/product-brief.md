# SF6 Combo Master MVP Product Brief

## Summary
SF6 Combo Master MVP is a beginner-first training product for Street Fighter 6-style special-move and controller-input practice, delivered as a public web app plus a Windows-installable Tauri desktop app. The core promise is the same curated practice experience on web and desktop: icon-first notation, strict pass/fail grading against an app-defined reference ruleset modeled after SF6 behavior, local-only progress, and visual-first feedback. The main early risks are deliberate: no keyboard input practice in MVP, controller and browser compatibility variance, and the need to avoid official SF6 art, audio, game data, or claims of official correctness.

## Open Questions
- What exact directional windows, charge timings, and shortcut behaviors belong in the initial reference ruleset for each motion family?
- Does post-MVP desktop support need raw-input paths beyond XInput-compatible devices?
- Is anonymous telemetry acceptable for measuring drill completion and controller compatibility issues?
- When combo training arrives, should it layer directly on top of the motion-drill content model or use a separate content package model?

## Product Directions
- `Beginner coach`: icon-first, generic motion families, stronger onboarding, simpler legal/accuracy framing, but less appealing to advanced lab users.
- `Authentic input referee`: strict SF6-like grading and tighter trust for serious players, but harder to explain safely because the engine is still an approximation.
- `Web discovery + desktop reliability`: same core experience everywhere, with narrower official browser/device promises on web and stronger offline/controller reliability on desktop.

## Recommended MVP Brief
- Recommendation: ship the `Beginner coach` direction using the `Web discovery + desktop reliability` delivery model.
- Target users: beginners are the primary audience; intermediate and advanced players can still use the app, but the product is not optimized around them.
- Supported inputs and browsers: web officially supports current desktop Chromium browsers and Firefox with standard-mapped gamepads; desktop officially supports XInput-compatible controllers; arcade stick and leverless support is only promised when those devices appear through those compatibility paths; Safari and unsupported mappings are best-effort only. For supported compatibility paths, graded directional input accepts both digital directional input and primary analog directional input.
- Accessibility and UX: keyboard does not execute drills in MVP, but the surrounding UI should remain readable, controller-optional for navigation, and not dependent on color alone to communicate state.
- Notation and localization: use the existing controller icon assets as the primary notation vocabulary, provide an optional numpad toggle, ship English and Japanese UI in MVP, select locale from browser or OS language, and keep locale-neutral IDs underneath localized labels and aliases such as `波動 / Quarter-Circle Forward`, `昇竜 / Dragon-Punch Motion`, and `真空 / Double Quarter-Circle Forward`.
- Training modes: MVP focuses on repeated special-move input practice with curated built-in drills and simple free repetition; guided combo drills, step-by-step combo drills, rhythm or timing drills, and custom drills are explicitly post-MVP.
- Timing and judgment: use strict sequence grading against a versioned reference ruleset modeled after SF6 behavior; keep motion-specific timing and charge windows in that ruleset; show pass/fail, streaks, success rate, and short failure reasons instead of deeper numeric analysis.
- Content model: represent built-in drills in a structured, versioned, future-shareable, human-inspectable, locale-neutral format; MVP does not include user authoring, import/export, or public sharing.
- Persistence and parity: store settings and progress locally only; keep drills, input-history behavior, judgment, ruleset version, and scoring identical across web and desktop; desktop must work fully offline after install; web practice must not depend on a server once the app is loaded.
- Runtime support behavior: unsupported device or compatibility paths must place graded practice into a warned non-grading state instead of silently grading or silently dropping practice input; the app UI remains navigable while graded attempts stay blocked.
- Feedback: make feedback visual-first with optional sound; include the target motion, recent input trail or timeline, hit/miss state, and a short reason for failure; keep sound lightweight and non-essential.
- Legal and IP: ship generic motion families only, not official move names, official art, official audio, or copyrighted game data; product language must clearly state that the app uses its own training reference ruleset rather than official SF6 validation.
- Explicit MVP non-goals: combo authoring, custom drill creation, public share links, accounts or cloud sync, mobile-first support, official asset/data usage, and broad claims that all browsers or all controllers are supported.

## Contracts
- Introduce a shared `reference ruleset version` concept so web and desktop can claim the same grading behavior.
- Define each drill with stable IDs, motion family, expected input sequence, timing or charge constraints, scoring metadata, localized labels, and failure-reason keys.
- Treat support promises as product contracts, not vague best-effort language: name the supported web browsers, controller compatibility paths, and parity expectations directly.
- Fix the shell-side capture contract separately from the shared grading core: supported directional input surfaces, active graded source selection, same-device digital/analog merge, and disconnect-aborted attempt behavior must be explicit.

## Post-MVP
- Character and combo training.
- Step-by-step combo teaching and guided combo drills.
- Rhythm and timing-specific drill modes.
- Custom drill import/export/share.
- Broader controller backend support.
- Deeper analytics and possible desktop/web sync.

## Tentative Technical Options
- Shared domain logic reused by web and Tauri.
- Web input via standard browser gamepad capabilities.
- Desktop input via supported Windows controller backends, with room for broader device handling later.
- Structured versioned content files for drills and rulesets.
- Local-first persistence options for browser and desktop.
- Lightweight synthesized or generic audio feedback only.
