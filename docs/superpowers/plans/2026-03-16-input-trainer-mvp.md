# Input Trainer MVP Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the smallest viable SF6 Combo Master MVP as a web app and Tauri desktop app that both grade against the same frozen 60Hz input-training core.

**Architecture:** Use a small TypeScript workspace with one shared core package for frozen contracts, content, grading, input-history semantics, and persistence record types; one shared React practice app for UI, i18n, and local persistence orchestration; and thin web and desktop shells that only adapt input capture, runtime packaging, and offline behavior. Preserve all product decisions from the approved design by pinning rulesets, profiles, drills, failure keys, and support boundaries in shared data and tests before any UI-heavy work.

**Tech Stack:** npm workspaces, TypeScript, React, Vite, Vitest, Testing Library, Tauri, Rust

---

## File Map

- `package.json`: root workspace scripts for install, typecheck, test, web build, desktop build, and validation.
- `tsconfig.base.json`: shared TypeScript compiler settings for all packages and apps.
- `vitest.workspace.ts`: root Vitest workspace wiring.
- `packages/core/package.json`: shared core package manifest.
- `packages/core/tsconfig.json`: shared core TypeScript config.
- `packages/core/src/contracts/ruleset.ts`: ruleset, profile, failure-key, and persistence record types.
- `packages/core/src/contracts/drill.ts`: drill schema, terminal requirement kinds, and built-in catalog metadata types.
- `packages/core/src/content/rulesets/sf6cm-reference-ruleset.v1.json`: frozen app-defined ruleset artifact.
- `packages/core/src/content/profiles/sf6cm-input-profile.v1.json`: frozen input-profile artifact.
- `packages/core/src/content/drills/core-v1.json`: curated built-in drills for MVP only.
- `packages/core/src/content/locales/en.json`: English presentation catalog.
- `packages/core/src/content/locales/ja.json`: Japanese presentation catalog.
- `packages/core/src/grading/frameTimeline.ts`: 60Hz ring-buffer timeline and quantization helpers.
- `packages/core/src/grading/directionResolution.ts`: shared directional alphabet and opposite-direction neutralization logic.
- `packages/core/src/grading/terminalEvents.ts`: press and release terminal-event detection based on active profile.
- `packages/core/src/grading/gradeAttempt.ts`: drill-target-first grading entry point.
- `packages/core/src/grading/failureSelection.ts`: deterministic primary-failure selection.
- `packages/core/src/grading/inputHistoryView.ts`: versioned visible input-history projection from the same frame timeline.
- `packages/core/src/index.ts`: core public exports.
- `packages/core/tests/contentContracts.test.ts`: frozen contract tests for ruleset, profile, drills, locales, and support keys.
- `packages/core/tests/frameTimeline.test.ts`: 60Hz timeline and state-resolution tests.
- `packages/core/tests/gradingCore.test.ts`: canonical, shortcut, charge, terminal-input, and failure-key tests.
- `packages/core/tests/inputHistoryView.test.ts`: visible input-history semantics tests tied to the same timeline.
- `packages/core/tests/persistenceRecords.test.ts`: recent-attempt summary record tests.
- `packages/practice-app/package.json`: shared React app package manifest.
- `packages/practice-app/tsconfig.json`: shared practice app TypeScript config.
- `packages/practice-app/src/App.tsx`: app composition root for drill selection, practice view, result feedback, and settings.
- `packages/practice-app/src/session/PracticeSessionController.ts`: connects input adapter events to the shared core and persistence adapters.
- `packages/practice-app/src/components/DrillCatalog.tsx`: curated drill picker using localized generic motion-family labels.
- `packages/practice-app/src/components/InputHistoryPanel.tsx`: visual-first input-history display driven by shared core output.
- `packages/practice-app/src/components/ResultBanner.tsx`: localized pass or fail plus primary failure messaging.
- `packages/practice-app/src/components/SettingsPanel.tsx`: locale, notation, and active-profile controls.
- `packages/practice-app/src/i18n.ts`: locale loading and label resolution.
- `packages/practice-app/src/storage.ts`: local-only persistence adapter for settings, aggregates, and recent summaries.
- `packages/practice-app/src/index.ts`: shared practice app exports.
- `packages/practice-app/src/App.test.tsx`: shared app rendering and failure-message tests.
- `apps/web/package.json`: web shell manifest.
- `apps/web/vite.config.ts`: web build config, shared public asset wiring, and offline bundle setup.
- `apps/web/index.html`: web shell entry HTML.
- `apps/web/src/main.tsx`: web shell bootstrap.
- `apps/web/src/platform/browserGamepadAdapter.ts`: supported-browser Gamepad API adapter producing shared input samples.
- `apps/web/src/platform/browserSupportGuard.ts`: support-matrix gating for unsupported browsers and mappings.
- `apps/web/src/registerServiceWorker.ts`: cache registration so practice works without a server after load.
- `apps/desktop/package.json`: desktop shell manifest.
- `apps/desktop/vite.config.ts`: desktop webview build config reusing shared public assets.
- `apps/desktop/index.html`: desktop shell entry HTML.
- `apps/desktop/src/main.tsx`: desktop shell bootstrap.
- `apps/desktop/src/platform/tauriInputBridge.ts`: frontend bridge for XInput events emitted by Tauri.
- `apps/desktop/src/platform/desktopSupportGuard.ts`: desktop support messaging for unsupported devices.
- `apps/desktop/src-tauri/Cargo.toml`: Tauri host dependencies and crate metadata.
- `apps/desktop/src-tauri/tauri.conf.json`: desktop packaging and offline config.
- `apps/desktop/src-tauri/src/main.rs`: Tauri app bootstrap and event wiring.
- `apps/desktop/src-tauri/src/xinput.rs`: XInput polling and event emission into the shared frontend shell.

## Chunk 1: Workspace and Frozen Contracts

### Task 1: Bootstrap the minimal workspace

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `vitest.workspace.ts`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/practice-app/package.json`
- Create: `packages/practice-app/tsconfig.json`
- Create: `apps/web/package.json`
- Create: `apps/desktop/package.json`

- [ ] **Step 1: Create the root workspace files and scripts**

Define npm workspaces, root scripts, and shared TS or test settings for `packages/core`, `packages/practice-app`, `apps/web`, and `apps/desktop`.

- [ ] **Step 2: Add empty package manifests and TS configs for each workspace**

Wire each package and app so imports can be resolved before any behavior is implemented.

- [ ] **Step 3: Add placeholder entry files**

Create empty `index.ts` or `main.tsx` entrypoints where needed so the workspace can typecheck incrementally.

- [ ] **Step 4: Install the initial toolchain**

Run: `npm install`
Expected: workspace dependencies install successfully.

- [ ] **Step 5: Verify the empty workspace is wired correctly**

Run: `npm run typecheck`
Expected: PASS with placeholder files only.

### Task 2: Freeze the approved contracts in shared data before implementation

**Files:**
- Create: `packages/core/src/contracts/ruleset.ts`
- Create: `packages/core/src/contracts/drill.ts`
- Create: `packages/core/src/content/rulesets/sf6cm-reference-ruleset.v1.json`
- Create: `packages/core/src/content/profiles/sf6cm-input-profile.v1.json`
- Create: `packages/core/src/content/drills/core-v1.json`
- Create: `packages/core/src/content/locales/en.json`
- Create: `packages/core/src/content/locales/ja.json`
- Create: `packages/core/src/index.ts`
- Test: `packages/core/tests/contentContracts.test.ts`

- [ ] **Step 1: Write failing contract tests for the frozen MVP scope**

Cover ruleset version IDs, motion-family scope, profile defaults, drill naming rules, terminal requirement policy, failure-key presence, locale-neutral IDs, and unsupported-environment messaging boundaries.

- [ ] **Step 2: Run the contract tests to capture the expected failures**

Run: `npm run test --workspace @sf6cm/core -- --run packages/core/tests/contentContracts.test.ts`
Expected: FAIL because the shared contract files do not exist yet.

- [ ] **Step 3: Author the minimal shared contract types and content artifacts**

Implement only the approved MVP contracts. Do not add combo packages, telemetry events, custom authoring, extra motion families, Safari support, or non-XInput support.

- [ ] **Step 4: Export the contracts from the core package**

Make the shared content and types importable by tests, the shared app, and both platform shells without platform-specific branching.

- [ ] **Step 5: Re-run the contract tests**

Run: `npm run test --workspace @sf6cm/core -- --run packages/core/tests/contentContracts.test.ts`
Expected: PASS.

## Chunk 2: Shared 60Hz Grading Core

### Task 3: Build the 60Hz frame timeline and terminal-event primitives under TDD

**Files:**
- Create: `packages/core/src/grading/frameTimeline.ts`
- Create: `packages/core/src/grading/directionResolution.ts`
- Create: `packages/core/src/grading/terminalEvents.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/frameTimeline.test.ts`

- [ ] **Step 1: Write failing timeline tests**

Cover 60Hz quantization, bounded ring-buffer behavior, backend-resolved direction passthrough, opposite-direction neutralization, held-state derivation, and press or release terminal detection from adjacent frames.

- [ ] **Step 2: Run the timeline tests to confirm failure**

Run: `npm run test --workspace @sf6cm/core -- --run packages/core/tests/frameTimeline.test.ts`
Expected: FAIL because the grading primitives are not implemented.

- [ ] **Step 3: Implement the minimal frame timeline and terminal-event modules**

Keep the output format platform-neutral and deterministic. Do not mix in drill logic yet.

- [ ] **Step 4: Export the new grading primitives**

Expose only the timeline, direction-resolution, and terminal-event APIs needed by higher-level grading and by shell adapters.

- [ ] **Step 5: Re-run the timeline tests**

Run: `npm run test --workspace @sf6cm/core -- --run packages/core/tests/frameTimeline.test.ts`
Expected: PASS.

### Task 4: Implement grading, input-history semantics, and recent-attempt summaries under TDD

**Files:**
- Create: `packages/core/src/grading/gradeAttempt.ts`
- Create: `packages/core/src/grading/failureSelection.ts`
- Create: `packages/core/src/grading/inputHistoryView.ts`
- Test: `packages/core/tests/gradingCore.test.ts`
- Test: `packages/core/tests/inputHistoryView.test.ts`
- Test: `packages/core/tests/persistenceRecords.test.ts`
- Modify: `packages/core/src/contracts/ruleset.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing grading-core tests**

Cover drill-target-first grading, canonical precedence over shortcut, terminal-input mismatch failures, release-not-allowed failures, representative rejected categories, charge-insufficient failures, and deterministic primary-failure selection.

- [ ] **Step 2: Write failing input-history and persistence-record tests**

Cover visible input-history semantics versioned to the same ruleset or profile baseline and summary-only recent-attempt records with the approved narrow schema.

- [ ] **Step 3: Run the new core tests to verify failure**

Run: `npm run test --workspace @sf6cm/core -- --run packages/core/tests/gradingCore.test.ts packages/core/tests/inputHistoryView.test.ts packages/core/tests/persistenceRecords.test.ts`
Expected: FAIL because the top-level grader, view projection, and summary builders are missing.

- [ ] **Step 4: Implement the minimal shared grader**

Use only the frozen ruleset/profile data, family-specific tables, and deterministic failure-key selection from the approved design.

- [ ] **Step 5: Re-run the full core suite**

Run: `npm run test --workspace @sf6cm/core`
Expected: PASS for all core tests.

## Chunk 3: Shared Practice App and Thin Shells

### Task 5: Build the shared practice app before platform-specific UI divergence

**Files:**
- Create: `packages/practice-app/src/App.tsx`
- Create: `packages/practice-app/src/session/PracticeSessionController.ts`
- Create: `packages/practice-app/src/components/DrillCatalog.tsx`
- Create: `packages/practice-app/src/components/InputHistoryPanel.tsx`
- Create: `packages/practice-app/src/components/ResultBanner.tsx`
- Create: `packages/practice-app/src/components/SettingsPanel.tsx`
- Create: `packages/practice-app/src/i18n.ts`
- Create: `packages/practice-app/src/storage.ts`
- Create: `packages/practice-app/src/index.ts`
- Test: `packages/practice-app/src/App.test.tsx`

- [ ] **Step 1: Write failing shared-app tests**

Cover localized drill labels, localized primary failure messaging, summary persistence writes, and the visual-first practice flow driven by the shared core outputs.

- [ ] **Step 2: Run the shared-app tests to confirm failure**

Run: `npm run test --workspace @sf6cm/practice-app -- --run packages/practice-app/src/App.test.tsx`
Expected: FAIL because the shared app and controller do not exist yet.

- [ ] **Step 3: Implement the shared React app**

Keep it shell-agnostic. Accept an injected input adapter and reuse the same `public/assets/controller/*` files by configuring both Vite shells to serve the existing repo `public/` directory rather than duplicating assets.

- [ ] **Step 4: Re-run the shared-app tests**

Run: `npm run test --workspace @sf6cm/practice-app -- --run packages/practice-app/src/App.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck the shared app against the shared core**

Run: `npm run typecheck`
Expected: PASS.

### Task 6: Add thin web and desktop shells, then validate parity

**Files:**
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/platform/browserGamepadAdapter.ts`
- Create: `apps/web/src/platform/browserSupportGuard.ts`
- Create: `apps/web/src/registerServiceWorker.ts`
- Create: `apps/desktop/vite.config.ts`
- Create: `apps/desktop/index.html`
- Create: `apps/desktop/src/main.tsx`
- Create: `apps/desktop/src/platform/tauriInputBridge.ts`
- Create: `apps/desktop/src/platform/desktopSupportGuard.ts`
- Create: `apps/desktop/src-tauri/Cargo.toml`
- Create: `apps/desktop/src-tauri/tauri.conf.json`
- Create: `apps/desktop/src-tauri/src/main.rs`
- Create: `apps/desktop/src-tauri/src/xinput.rs`
- Modify: `packages/core/tests/gradingCore.test.ts`

- [ ] **Step 1: Add the web shell**

Bootstrap the browser shell, Gamepad API adapter, support guard, and offline cache registration so practice does not depend on a server once loaded.

- [ ] **Step 2: Validate the web shell build**

Run: `npm run build --workspace @sf6cm/web`
Expected: PASS with the shared app and core bundled against the supported-browser shell.

- [ ] **Step 3: Add the desktop shell**

Bootstrap the Tauri shell and the Rust XInput bridge that emits controller events into the shared frontend app without changing grading semantics.

- [ ] **Step 4: Add parity-focused tests and Rust unit coverage**

Extend the shared core fixtures so the same normalized input sequence is asserted against the same expected result regardless of whether it originated from the browser adapter or the Tauri bridge. Add Rust tests for the XInput polling conversion layer.

- [ ] **Step 5: Run final MVP validation**

Run: `npm run test --workspace @sf6cm/core`
Expected: PASS.

Run: `npm run test --workspace @sf6cm/practice-app`
Expected: PASS.

Run: `npm run build --workspace @sf6cm/web`
Expected: PASS.

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: PASS.

Run: `npm run build --workspace @sf6cm/desktop`
Expected: PASS.

## Validation Commands

Use these root commands once the workspace scripts exist:

- `npm install`
- `npm run typecheck`
- `npm run test --workspace @sf6cm/core`
- `npm run test --workspace @sf6cm/practice-app`
- `npm run build --workspace @sf6cm/web`
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
- `npm run build --workspace @sf6cm/desktop`

Manual MVP smoke checks after the automated suite:

- run the web app in a supported Chromium browser with a standard-mapped gamepad and confirm a known fixture sequence produces the same result as the core tests
- run the web app in Firefox with the same controller and confirm the same drill, ruleset version, input profile, and failure key
- run the desktop app with an XInput-compatible controller and confirm the same drill, ruleset version, input profile, visible input history, and result
- verify unsupported environments show clear warnings instead of silently grading with altered behavior

## Deferred Non-MVP Work

Do not add any of the following during MVP implementation:

- combo packages or combo teaching flows
- custom drill authoring, import, export, or sharing
- telemetry collection of any kind
- Safari support or non-standard web mappings
- non-XInput desktop support
- mobile-first UI
- additional motion families beyond the approved core eight
- official SF6 move names, art, audio, or copyrighted game data
- grading leniency tiers

