# PLAN.md — SF6 Combo Master

## ⚠️ AI エージェント（Claude Code / Codex）への強制指示**
> このファイルはプロジェクトの唯一の設計仕様書です。
> - 実装・変更・リファクタリングを行う前に **必ずこのファイルを最初に読むこと**。
> - 以下の **TODO** に記載された優先順位・方針を **絶対に守ること**。
> - TODO に反する設計や、このファイルに記載のない方向への変更を勝手に行わないこと。
> - TODO の項目が完了したら、該当行を `[x]` に更新すること。
> - SF6-combo-master 以外のファイルに変更を加えない

### Skills

このリポジトリは repo-local skill を使う前提で、`.agents/skills/` に skill を配置する。

#### 使い分け（トリガー）
- `documentation-lookup`:
  - ライブラリ/フレームワーク/API/設定/エラー原因が少しでも曖昧なら必ず使う（一次情報の確認）。
- `playwright`:
  - スクレイピング（`tools/scrape-*.ts`）の調査、UIフロー再現、ページ差分の観測、スクショ取得が必要なときに使う。
- `vercel-react-best-practices`:
  - React/Vite 側のパフォーマンスや実装パターンの判断が必要なときに使う。
- `vercel-composition-patterns`:
  - コンポーネントAPIが肥大化しそうなとき、compositionで整理するときに使う。
- `web-design-guidelines`:
  - UI/UX/アクセシビリティのレビュー依頼、またはUI改善の妥当性確認で使う。

#### 注意
- `playwright` skill は `npx` 前提（Node.js/npm が必要）。環境に無い場合は先に導入する。
- skill を追加/更新したら `skills-lock.json` も更新する（`computedHash` を含む）。

---

## Context

このドキュメントは SF6 Combo Master の設計仕様・開発方針・実装計画をまとめたものです。

---

## TODO

> 優先順位順。上から順に着手すること。完了したら `[ ]` → `[x]` に更新する。


## 1. プロジェクト概要

SF6 のコンボ練習アプリ。公式 SF6 コンボトライアルと同等のUXを提供する。

### 提供形態

| 形態 | ビルド | 入力 | 制約 |
|------|--------|------|------|
| Web アプリ | `pnpm build` | Web Gamepad API | ブラウザ依存 |
| Tauri exe | `pnpm tauri build` | XInput / HID (Windows) | 要インストール |

両形態で同一のコンポーネント・ドメインコードを共有する。
- Web アプリ版はコンポーネントの分割や透過でSF6画面上に表示させたりはできないがWebページから簡単に使える。
- ネイティブ版は全ての機能が使える。

### 機能

- UIベースでコンボを組み立て（moves.master.json を参照）
- タイムラインモード: 次の技を自動表示・タイミング計測
- ステッパーモード: 入力ごとに次ステップへ進む（学習向け）
- コントローラー入力のリアルタイム検出・判定・フィードバック

---

## 2. データアーキテクチャ

### ファイル構成と役割

```
data/
├── common/
│   └── moves.common.json        # 全キャラ共通技のみ（完全同一frame）
├── jp/
│   ├── frame.raw.json           # 公式フレームデータ（スクレイプ・参照用）
│   ├── frame.supercombo.raw.json # Supercombo wiki データ（スクレイプ・参照用）
│   ├── frame.ja-map.json        # 日本語テキストマッピング（参照用）
│   └── moves.master.json        # ★ マスターデータ（上3つを統合）
└── trials/
    └── jp/
        └── *.combo-trial.json   # コンボトライアル定義
```

### データ管理方針

- **スクレイピング頻度**: キャラ1回のみ実行。以降は手動でアップデート情報を追う。
- **moves.master.json**: `frame.raw.json` + `frame.supercombo.raw.json` + `frame.ja-map.json` を統合した唯一の真実。
- **moves.common.json**: キャラ依存なし・全キャラ完全同一フレームの技のみ記述。
- **versionless 運用**: `schemaVersion` 不使用。移行は自動変換せず strict fail。

### データパイプライン

```
[スクレイプ]  frame.supercombo.raw.json ──┐
              frame.raw.json             ──┤→ moves.master.json
              frame.ja-map.json          ──┘        ↓
                                          *.combo-trial.json (手動定義)
                                                    ↓
                                          CompiledTrial (ランタイムにコンパイル)
```

---

## 3. ドメイン層（変更最小）

`src/domain/` は純粋ドメインロジック。React 依存なし。現状の設計は良好のため基本維持。

```
src/domain/
├── input/           # 入力処理（frame, history, motion, buttonMapping, resetBinding）
├── trial/           # トライアル定義（schema, validate, compiler, compiled）
└── trial-engine/    # 実行エンジン（stepper / timeline 両モード）
```

### Trial Engine

- `createTrialEngine(compiledTrial, modeOverride?)` → `TrialEngine`
- `TrialEngine.advance(frame: InputFrame)` → `TrialEngineSnapshot`
- `TrialEngine.reset()`
- **timelineMode**: フレーム厳密なタイミング計測。ウィンドウ外は即 miss。
- **stepperMode**: ボタン入力ごとに次ステップ。タイムアウト 60F（設定可能）。

### 重要定数（変更時は全テスト再確認）

| 定数 | 値 | 場所 |
|------|-----|------|
| `MOTION_TO_BUTTON_MAX_GAP_FRAMES` | 12F | inputMatcher.ts |
| `HISTORY_LIMIT_FRAMES` | 240F | stepperEngine.ts |
| `DEFAULT_TIMEOUT_FRAMES` | 60F | stepperEngine.ts |
| `EVENT_LIMIT` | 80 | runtimeState.ts |

---

## 4. UI アーキテクチャ（破壊的リファクタ対象）

### 現状の問題

- `TrialRunnerPanel.tsx`: 1300+ 行の巨大コンポーネント。全ての責務が混在。
- `App.tsx`: 479 行。型定義・データ取得・UI 描画が混在。
- localStorage キーが 8 個コンポーネント内に散在。
- フック不在：domain ↔ UI のブリッジが無く、コンポーネント内にロジックが直書き。
- AudioContext がグローバル変数で管理されている。

### 提案アーキテクチャ

```
src/
├── main.tsx
├── App.tsx              # シン化: ルート・レイアウトのみ
│
├── hooks/               # React フック（domain ↔ UI ブリッジ）【新規】
│   ├── useSettings.ts            # localStorage キー一元管理
│   ├── useCompiledTrials.ts      # トライアル読み込み＋コンパイル
│   ├── useTrialEngine.ts         # エンジン状態管理
│   ├── useInputProvider.ts       # InputProvider ライフサイクル
│   ├── useButtonBindings.ts      # ボタンバインド永続化
│   └── useSfx.ts                 # AudioContext 管理
│
├── components/          # UIコンポーネント（プレゼンテーショナル）【分割】
│   ├── trial-runner/
│   │   ├── TrialRunnerPanel.tsx  # オーケストレータ（シン化 ~100行）
│   │   ├── TrialStepList.tsx     # ステップ一覧
│   │   ├── TrialStepCard.tsx     # 個別ステップ表示
│   │   ├── InputDisplay.tsx      # 現在入力の可視化
│   │   ├── InputHistoryDisplay.tsx # 入力履歴
│   │   └── AssessmentDisplay.tsx # 判定結果表示
│   ├── binding/
│   │   └── ButtonBindingPanel.tsx # コントローラー設定UI
│   ├── frame-data/
│   │   └── FrameDataTable.tsx    # フレームデータ表
│   └── common/
│       └── CommandTokens.tsx     # コマンド入力表示（アイコン+テキスト）
│
├── features/            # フィーチャーレベルのコンテナ【新規】
│   ├── trial-practice/
│   │   └── TrialPracticeFeature.tsx  # コンボ練習画面
│   └── move-browser/
│       └── MoveBrowserFeature.tsx    # 技ブラウザ画面
│
├── domain/              # 変更なし（既存をそのまま維持）
└── platform/            # 変更なし（既存をそのまま維持）
```

### localStorage キー管理

`hooks/useSettings.ts` に一元管理する：

```ts
const STORAGE_KEYS = {
  inputMode: "sf6_input_mode",
  directionDisplayMode: "sf6_direction_display_mode",
  downDisplayMode: "sf6_down_display_mode",
  buttonBindings: "sf6_button_bindings",
  resetTrialBinding: "sf6_reset_trial_binding",
  trialModeOverride: "sf6_trial_mode_override",
} as const;
```

### 状態管理方針

現在の規模では Zustand は不要。段階的に：

1. `useState` — コンポーネントローカル状態
2. カスタムフック — domain ロジック分離
3. Zustand — 将来的にグローバル設定が複雑化した場合のみ導入

---

## 5. プラットフォーム層

```
src/platform/
├── types.ts                    # InputProvider インターフェース
├── createInputProvider.ts      # 環境判定ファクトリ
├── web/
│   └── gamepadProvider.ts      # Web Gamepad API
└── tauri/
    └── nativeInputProviders.ts # XInput / HID
```

### 判定ロジック

```
Tauri 環境?
  Yes → input_detect() → xinput: true? → XInputProvider
                       → hid: true?    → HidProvider
                       → fallback       → WebGamepadProvider
  No  → WebGamepadProvider
```

### Tauri コマンド

| コマンド | 引数 | 戻り値 |
|----------|------|--------|
| `input_start` | `mode: "xinput" \| "hid"` | - |
| `input_stop` | - | - |
| `input_detect` | - | `{xinput: bool, hid: bool}` |

### Tauri イベント

| イベント | ペイロード |
|----------|-----------|
| `input/frame` | `{frame, timestamp_ms, direction, physical_down[]}` |

### Tauri ウィンドウ設定（tauri.conf.json）

- `alwaysOnTop: true`（ゲーム上に重ねて使用）
- `width: 800, height: 600`（最小、リサイズ可）

---

## 6. 開発ワークフロー

### コマンド

| コマンド | 説明 |
|----------|------|
| `pnpm dev` | Web 版開発サーバー |
| `pnpm build` | Web 版プロダクションビルド |
| `pnpm tauri:dev` | Tauri 版開発 |
| `pnpm tauri build` | Tauri exe ビルド |
| `pnpm test` | 全テスト実行 |
| `pnpm scrape:jp:supercombo` | Supercombo wiki からフレームデータ取得 |

### テスト構成

```
tests-cjs/                  # Node.js CJS テスト（現状維持）
├── button-mapping.test.cjs
├── input-frame.test.cjs
├── motion.test.cjs
├── trial-compiler.test.cjs
├── trial-stepper.test.cjs
├── trial-timeline.test.cjs
├── trial-validate.test.cjs
└── versionless-schema.test.cjs
```

---

## 7. コンボトライアル定義仕様

### ファイル形式: `*.combo-trial.json`

最小構成（moveIdを並べるだけ）:

```json
{
  "id": "jp_m2_crouch_lp_stand_lp_light_stribog",
  "name": "JP Combo 2: しゃがみ小P > 立ち小P > 弱ストリボーグ",
  "steps": [
    { "move": "sf6.jp.crouchingLightPunch" },
    { "move": "sf6.jp.standingLightPunch", "connect": "link" },
    { "move": "sf6.jp.lStribog", "connect": "cancel", "cancelKind": "special" }
  ]
}
```

オーバーライドあり（frame-perfect / ノート / ラベル）:

```json
{
  "id": "unique-trial-id",
  "name": "日本語名",
  "notes": ["補足説明"],
  "steps": [
    { "move": "sf6.jp.crouchingLightPunch" },
    { "move": "sf6.jp.standingLightPunch", "connect": "link", "window": { "max": 0 } },
    { "move": "sf6.jp.lStribog", "connect": "cancel", "cancelKind": "special",
      "label": "弱ストリボーグ", "window": { "max": 0 } }
  ],
  "rules": { "defaultMode": "timeline", "allowModeOverride": true }
}
```

### デフォルトタイミングウィンドウ（compiler.ts 内定数）

| connect 種別 | デフォルト max | 備考 |
|-------------|--------------|------|
| `link` | 24F | |
| `cancel` | 40F | `cancelKind: "dr"` の場合は 12F |
| `chain` | 20F | |
| `target` | 20F | |

`window` フィールドを省略した場合はこれらのデフォルト値を使用。

### connect 種別

| 種別 | 説明 |
|------|------|
| `link` | リンク（硬直後に入力） |
| `cancel` | キャンセル（発生中に入力）`cancelKind`: `special` / `super` / `dr` |
| `chain` | チェーン |
| `target` | ターゲットコンボ |

### タイミング解決優先順位

1. `step.window`（明示的インラインオーバーライド）
2. デフォルト定数（connect 種別ごと）

---

## 8. 入力システム仕様

### 方向（ナンパッド記法）

```
7 8 9
4 5 6   5 = ニュートラル
1 2 3
```

### CanonicalButton

`LP`, `MP`, `HP`, `LK`, `MK`, `HK`

### モーション検出

| コード | コマンド |
|--------|----------|
| `236` | 波動拳 |
| `214` | 昇龍（逆） |
| `623` | 昇龍 |
| `22` | 気功 |

モーション完成 → ボタン押下の最大間隔: **12F** (`MOTION_TO_BUTTON_MAX_GAP_FRAMES`)

### リリースゲート

ステッパーモードでは、前ステップと同じボタンを再利用する場合、一度ボタンを離す必要がある（設定可能）。

---

## 9. SF6 トレーニングモード – Input History Frame Display 仕様

> **出典**: 旧 AGENTS.md の仕様セクションを移植。AI / 実装側の参照仕様として維持。

### 0. Scope

Input History Display（キー表示）の**フレーム数表示**の挙動を定義する。
移動フレームデータ・コマンド認識ウィンドウ・入力解析ルールは対象外。

### 1. 用語（規範的）

- **Frame (F)**: Input History サンプリング/表示に使われるゲーム内時間単位。
- **Input History Display**: 方向+ボタンを時系列で表示するオンスクリーンリスト（キー表示）。
- **Input State**: サンプリングフレーム時点の **(Direction, PressedButtonsSet)** のタプル。
- **Entry**: 同一 Input State の連続を1行で表したもの。
- **Hold Frames**: Entry の継続フレーム数として表示される数値。

### 2. フレーム表示の意味（確定）

Hold Frames = 「その Input State (方向+ボタン) が継続したフレーム数」。

### 3. 圧縮モデル – Run-Length Encoding（ほぼ確定）

連続して同一 Input State が続く場合、Entry の Hold Frames を +1 する（新 Entry は作らない）。Input State が変化したときのみ新 Entry を生成。

### 4. Input State の等価判定（部分的に未知）

**同一とみなす条件（ほぼ確定）**:
- 表示上の Direction が同一、かつ PressedButtonsSet が同一。

**AI/実装への規則**:
- ボタンは **集合** として扱う（順序不問）。
- 方向の等価判定は **表示記号** に基づく。非表示のアナログ値を推論しない。

### 5. 上限 / サチュレーション（確定）

Hold Frames の表示は **99F** でサチュレートする。`99` または `99+` → 「≥ 99F」として扱う。

### 6. 並び順・ウィンドウ（確定 + 未知）

- 時系列順で **新しい Entry が上**。古い Entry は下に流れてスクロールアウト。
- 表示行数上限・内部バッファ長は **未知**（ハードコードしない）。

### 7. 設定・環境要因

- **Input Delay**: 最大 5F 設定可能。Input History がコントローラー入力 or ゲーム内適用後入力のどちらを記録するか **未知**。
- **Negative Edge**: 有効時はリリースも入力として扱われ Entry の分割に影響する。
- **ヒットストップ**: Frame Meter とは異なる場合がある（公式定義なし・非等価として扱う）。

### 8. テストベクタ

1. ニュートラル≥120F → Entry に `99` 表示（≥99を意味）
2. MP 1F タップ + N 28F → `1 MP` + `28 N` の2 Entry
3. MP+MK を同時2F → `2 MP+MK` の1 Entry（集合として扱われる）
4. `→` 3F + `N` 1F + `←` 4F → `3 →` + `1 N` + `4 ←` の3 Entry
5. MP 2F 保持 → MP+LK 2F 追加 → `2 MP` + `2 MP+LK` の2 Entry

---

## 10. コントローラー対応状況

| コントローラー種別 | API | 状態 |
|---|---|---|
| Xbox / XInput 系 | XInput API | ネイティブ対応（Tauri） |
| PS4 (DS4) / HID コントローラー | hidapi | ネイティブ対応（Tauri） |
| PS3 | Web Gamepad API | 互換対応 |
| Switch | Web Gamepad API | 互換対応 |
| その他未対応コントローラー | Web Gamepad API | 互換対応 |

---

## 11. 実装方針・コーディング規約

### 引き継ぎテンプレ（チャット間の文脈共有）

新しいチャットで作業を引き継ぐ際は以下の形式で状況を共有する:

```
- 現象: 何が起きているか（再現条件を1行で）
- 実測ログ: 直近の確定ログ（コピペ）
- 既に除外した原因: 事実ベースで列挙
- 直前の変更ファイル: path を列挙
- 次の一手: 1ステップだけ明記
```

### 基本方針

- **破壊的変更を積極的に行う**: 現状の設計より良い設計があれば、後方互換を気にせず変更する。
- **小さなステップで進める**: 仮説を1つずつ潰す。大きな変更は分割してコミット。
- **まずドメインを固める**: UIより先にドメインロジックを完成させ、テストを書く。
- **分からなければ Web 検索**: 曖昧な情報は必ず一次情報で確認。

### TypeScript

- `strict: true` 必須。`noUnusedLocals`, `noUnusedParameters` も有効。
- `any` は禁止。型が不明な場合は `unknown` を使い、適切にナローイング。
- JSON import は `resolveJsonModule: true` を使用（現状維持）。

### ログ設計ルール（入力系）

- プレフィックス固定（例: `[input-debug][P0]`）
- 高頻度ログ禁止。状態遷移時のみ出力。
- デバッグ詳細ログは `debug` 限定。

### 実装判断ルール

- 公開インターフェース変更は最後。まず内部実装で解決を試みる。
- フォールバックは「暫定」か「恒久」かを明示し、増やしすぎない。
- 変更後は「何が変わったか」「何が未検証か」を明記して次アクションを固定する。

---

## 12. リファクタリング優先順位

### Phase 1: hooks 導入（最優先）

1. `hooks/useSettings.ts` — localStorage キー一元管理
2. `hooks/useInputProvider.ts` — InputProvider ライフサイクル
3. `hooks/useTrialEngine.ts` — engine.advance() / reset() の React ラッパー
4. `hooks/useSfx.ts` — AudioContext 管理

### Phase 2: TrialRunnerPanel 分割

1. `InputHistoryDisplay.tsx` — 入力履歴表示
2. `TrialStepList.tsx` + `TrialStepCard.tsx` — ステップ表示
3. `ButtonBindingPanel.tsx` — バインド設定UI
4. `TrialRunnerPanel.tsx` をオーケストレータのみに縮小（~100行）

### Phase 3: App.tsx 整理

1. `features/trial-practice/` コンテナに移動
2. `features/move-browser/` 技ブラウザ分離
3. App.tsx をルート/レイアウトのみに（~50行）

### Phase 4: 将来拡張

- キャラ選択 UI（現在 JP 固定）
- コンボビルダー UI（trial JSON を GUI で作成）
- Zustand 導入（設定が複雑化した場合のみ）

---

## 13. 検証方法

### 単体テスト

```bash
pnpm test
```

### Web 版 E2E

```bash
pnpm dev
# ブラウザで localhost:1420 を開く
# コントローラー接続 → コンボ練習を実際に試す
```

### Tauri 版 E2E

```bash
pnpm tauri:dev
# Windows で XInput コントローラー接続
# xinput / hid / web 各モードを切り替えて動作確認
```

### 両ビルド確認

```bash
pnpm build && pnpm tauri build
```
