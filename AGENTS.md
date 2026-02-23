# SF6 Combo Master

## このリポジトリが目指すもの
自分で技をUIベースで組み立てて、自分でコンボ練習用のコンボを作成し、コンボトライアルのようにタイミングや次に入力する技やコマンドをビジュアルに理解しながらコンボ練習をできるアプリを開発する。

## このアプリでできること
- UIベースで技を組み立て、自分用のコンボ練習用コンボを作成できる。
- コンボトライアルのように、タイミングと次に入力する技・コマンドを視覚的に理解しながら練習できる。
- コントローラー入力を読み取り、コンボ成功判定と次の技への移行を自動で行う。

## 提供形態（2系統開発）
- 制約はあるが簡単にすぐ使えるWebアプリ版、Tauriのネイティブexe版を提供する。
- なるべく同じコンポーネントを使って開発したいので、二つの版の共通化を意識した実装する。
- "pnpm build", "pnpm tauri build" 両方を行う前提。
- 開発では "pnpm dev", "pnpm tauri:dev" の両方を使う。

## 実装手法
- 分からないこと、少しでも情報が曖昧なことがあれば必ずwebサーチをして最新の確実な情報を確かめる。
- 実装・調査は「一度に大きく」ではなく、仮説を1つずつ潰す小さな段階で進める。
- 変更は最小差分を原則とし、まずログ追加や観測性向上で事実を固めてから本修正に進む。

### LLMの作業可能範囲（このリポジトリ共通）
- ワークスペース内のファイル読み取り・編集・差分確認（`rg`, `sed`, `git diff` など）。
- ターミナルでのコマンド実行と、実行結果の整理・要約。
- 公式ドキュメント中心のWeb調査（仕様/API/既知の制約の確認）。
- 既存コードに合わせた最小実装、デバッグログ追加、段階的なリファクタ。

### LLMの制約（誤解防止）
- LLMはユーザーPC上のWindows GUI操作（`joy.cpl` 等）や物理デバイス操作は直接できない。
- 実機依存の確認（USB抜き差し、Steam常駐影響、OSデバイス設定）はユーザー実行ログが前提。
- 環境差で `cargo` 等がLLM側で実行できない場合があるため、その場合はユーザー実行結果で検証する。

### Windows/Tauri入力デバッグの標準手順
1. 仮説を1つに限定する（例: 初期化不備、列挙不可、フォールバック経路）。
2. `debug_assertions` 限定ログを追加し、Release挙動は変えない。
3. まず `pnpm tauri:dev` で起動・ログ観測し、事実を確定する。
4. 次の1手は必ず「前ステップの実測結果」で分岐する。
5. 収束したら不要な診断コードを整理し、恒久実装を最小変更で入れる。

### ログ設計ルール（入力系）
- プレフィックスを固定して検索しやすくする（例: `[input-debug][P0]`）。
- 判定に必要な値を必ず含める（`thread_id`, `HRESULT`, API戻り値、device識別子）。
- 高頻度ログは避け、状態遷移時のみ出す（例: backend切替時のみ）。
- デバッグ用の詳細ログは `debug` 限定にする。

### Web調査ルール
- 少しでも曖昧なら必ずWeb調査して一次情報を確認する。
- 優先順位: 公式仕様/公式ドキュメント > ライブラリ公式docs > 補助情報。
- 調査結果は「断定」と「推測」を分けて記述する。

### 実装判断ルール（将来の迷い防止）
- 公開インターフェース変更は最後。まず内部実装で解決できるかを優先。
- フォールバックは「暫定」か「恒久」かを明示し、増やしすぎない。
- 特定デバイス向け回避は、最終的に抽象化可能な構造（backend分離）で入れる。
- 変更後は「何が変わったか」「何が未検証か」を明記して次アクションを固定する。

### 他チャット引き継ぎテンプレ
- 現象: 何が起きているか（再現条件を1行で）。
- 実測ログ: 直近の確定ログ（コピペ）。
- 既に除外した原因: 事実ベースで列挙。
- 直前の変更ファイル: `path` を列挙。
- 次の一手: 1ステップだけ明記。

# 仕様
## SF6: Training Mode – Input History "Frame Display" Spec

### 0. Scope
This spec defines the behavior of the **frame count number shown in Training Mode "Input History Display" (key display)**.
It does **NOT** define move frame data, command recognition windows, or input parsing rules except where they affect interpretation of the Input History frame count.

### 1. Terms (Normative)
- **Frame (F)**: The game’s internal simulation time unit used by Input History sampling/display.
- **Input History Display**: The on-screen list showing direction + buttons over time (aka key display).
- **Input State**: A tuple of **(Direction, PressedButtonsSet)** at a sampled frame.
  - Direction includes neutral and is shown as `N` or directional icons.
  - PressedButtonsSet is the set of currently pressed buttons.
- **Entry**: One row in Input History that represents a run of identical Input States.
- **Hold Frames (Frame Display Number)**: The number displayed beside an Entry representing how many frames that Input State continued.

### 2. Meaning of the Frame Display (Confirmed / Normative)
- The frame display number for an Entry **MUST** be interpreted as:
  - “How many frames the shown Input State (Direction + Buttons) continued.”
- Example interpretation used in guides:
  - “MP pressed for 1F, then neutral for 28F” is represented as separate Entries whose frame counts can be read and (if needed) summed.

### 3. Compression Model (Run-Length Encoding) (Likely / Semi-normative)
Input History does not list per-frame raw inputs. Instead, it **compresses consecutive identical Input States into one Entry**.

- When the current frame’s Input State equals the previous frame’s Input State, the current Entry’s Hold Frames **SHOULD** increase by 1.
- When the Input State changes, a **new Entry** **SHOULD** be created.

> Note: Official sources do not explicitly name the algorithm, but the widely described behavior (“that input lasted X frames”) implies an RLE-like representation.

### 4. Equality of Input State (Partly Unknown)
#### 4.1 What is treated as “same input” (Likely)
- Two Input States **SHOULD** be treated as identical for compression if:
  - Their **Direction (as shown in UI)** is identical, AND
  - Their **PressedButtonsSet** is identical.

#### 4.2 What is NOT specified (Unknown)
The following details are **NOT specified** by confirmed primary documentation in this report and must be treated as Unknown:
- Direction quantization details (analog thresholds, diagonal detection rules).
- Whether direction display is relative-to-facing or screen-absolute (especially during side-switch).
- Ordering within simultaneous button presses (whether UI shows order vs set).
- How Negative Edge (button release) is represented internally and whether it creates distinct Input States beyond UI-level display.

**Rule for AI/Implementations**:
- AI **SHOULD** treat buttons as a **set**, not a sequence.
- AI **SHOULD** treat direction equality based on **displayed direction symbol**, and **MUST NOT** infer unseen analog values.

### 5. Per-Entry Upper Bound / Saturation (Confirmed)
- Hold Frames displayed per Entry **MUST** saturate at **99F** (the displayed number reaches 99 and does not represent an exact value beyond 99).
- Display format beyond 99 is **variable** (Unknown/Variant):
  - Some observations show `99`.
  - Some community reports mention `99+`.
  - Therefore, implementations **MUST** treat a displayed `99` (or `99+`) as meaning **“≥ 99F”**.

### 6. Ordering & Windowing (Confirmed + Unknown)
- Display order **MUST** be chronological with **newer Entries appearing above** and older Entries flowing downward (rolling list).
- The visible number of rows has an upper limit and older Entries are pushed out of view (rolling window).
- The **exact row capacity and internal buffer length are NOT specified** (Unknown):
  - Observations include “at least ~19 rows visible” in certain UI layouts, but this must not be hard-coded.

### 7. Update Timing (Likely) and Unspecified Pause/Mode Effects (Unknown)
- It is **likely** that Input History is updated based on **frame-by-frame sampling**:
  - The current Entry’s Hold Frames increments while the Input State is unchanged.
  - A new Entry begins when the Input State changes.
- The following are **NOT specified** and must be treated as Unknown:
  - How pause/menu overlay affects sampling/counting.
  - How slow-motion or other time controls affect the counter.
  - Whether rollback-like correction can retroactively alter displayed history (online).

### 8. Relationship to Frame Meter / Hitstop (Observed; Treat as Non-Equivalence)
Input History frame counts and the Frame Meter (move startup/active/recovery visualization) can differ.

- AI/Implementations **MUST NOT** assume:
  - `InputHistory Hold Frames == FrameMeter frames`
- Community verification suggests:
  - Hitstop / time-freeze / time-slow effects may be included in the Input History timing such that the Input History frame count can appear larger than expected relative to Frame Meter.
- This is not confirmed by an official definition within this report; treat as:
  - **Behavioral caveat**: “Differences may occur; do not force alignment.”

### 9. UI Layer Priority (Confirmed)
- Input History Display priority (z-order) has been officially changed so that:
  - Input History Display is shown **in preference to** notices / hit-count displays when they conflict.
- AI **SHOULD** not conclude “the feature is absent” just because it is visually occluded in some HUD configurations.

### 10. Settings & Environment Factors (Partly Confirmed / Partly Unknown)
#### 10.1 Enabling Input History (Observed)
- Input History can be enabled in Training Mode display settings.
- Display target selection (1P / 2P / both) is supported (observed in guides).

#### 10.2 Training Mode “Input Delay” setting (Reported; Unknown effect on logging)
- A Training setting exists that can add input delay up to **5F** (reported in guides/community).
- It is **NOT specified** whether Input History records:
  - physical/controller input timing, OR
  - delayed/applied-in-game input timing.
Therefore, when Input Delay is enabled, AI **SHOULD** avoid definitive conclusions from Input History alone.

#### 10.3 Negative Edge (button release) (Reported)
- If Negative Edge is enabled, “press” and “release” can both be treated as inputs.
- This can change how Entries split/appear.
- AI **SHOULD** not immediately label unexpected extra entries as user error when Negative Edge state is unknown.

#### 10.4 Platform latency vs “Frame” (Caveat)
- Real-world input latency (ms) differs by platform/settings, but this does not redefine the meaning of the Input History “F” unit.
- AI **SHOULD** treat platform latency as a separate axis (“feel/response”), not as a conversion to rewrite frame counts.

### 11. Replay / Save / Version Compatibility (Confirmed + Inference)
- Replays are treated as input-data-based reproduction rather than simple video (explained in commentary sources).
- Official notices state replay compatibility can break across versions (older replays may not play / may not appear after updates).
- **Inference (Likely)**:
  - The Input History frame display is likely reconstructed during playback from recorded input data rather than stored as pre-rendered “compressed display rows”.
  - Mark this as **Likely**, not Confirmed.

### 12. Known Issues (Reported; Version-dependent)
- A community report describes a bug where:
  - During dummy recording playback, Input History display may freeze (stop updating) until playback ends.
- Fix status and current reproducibility are **NOT specified**; treat as version-dependent.

### 13. Known Version/Behavior Notes (As referenced by this report)
The following items were observed in patch-note/announcement context as “related to display/logging ecosystem”:
- Frame meter changes/fixes (separate feature).
- Training menu settings may reset to defaults after an update (settings persistence caveat).
- Replay compatibility breaks across versions (see §11).
- Input History display z-order priority change (see §9).

### 14. Test Vectors (For AI/Implementation Validation)
These are UI-facing expected results consistent with the above spec (not asserting hidden internals).

1) **Neutral saturation**
- Input: Hold Neutral (`N`) for ≥120F
- Expect: The newest Entry shows `N` and its Hold Frames increases until it displays `99` (meaning `≥99`).

2) **Single-frame tap**
- Input: Press `MP` for 1F, then release to `N` for 28F
- Expect: Two Entries such as `1 MP` then `28 N` (exact ordering depends on UI convention; newest at top).

3) **Simultaneous buttons as a set**
- Input: Press `MP+MK` on the same frame and hold for 2F
- Expect: One Entry `2 MP+MK` (treated as a button set).

4) **Direction changes create new Entries**
- Input: `→` for 3F, then `N` for 1F, then `←` for 4F
- Expect: Entries reflecting `3 →`, `1 N`, `4 ←`.

5) **Press-add splits entries**
- Input: Hold `MP` for 2F, then while holding add `LK` and hold both for 2F
- Expect: `2 MP` then `2 MP+LK`.

### 15. Explicit Unknowns Checklist (Must remain Unknown unless separately verified)
To prevent over-claiming, AI/Implementations must treat these as Unknown in this repository unless new evidence is added:
- Exact equality rules beyond UI-visible symbols (analog thresholds, SOCD handling, relative/absolute direction representation).
- Exact visible row capacity and internal buffer size; exact discard rule threshold.
- Precise interaction with pause/menu/time controls/slow motion.
- Whether hitstop is counted identically across all states; any official definition of its effect on Input History counters.
- Whether Input Delay affects what is logged (physical vs applied input).
- Online rollback/delay impact on displayed history (local prediction vs corrected history).
- Whether the “99+” format exists in all languages/versions or under what conditions.
