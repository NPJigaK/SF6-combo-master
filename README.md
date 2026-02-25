# SF6 Combo Master

SF6 のコンボ練習用アプリです。Web 版と Tauri(Windows)版を並行開発しています。

## 開発コマンド
- `pnpm dev` : Web 版
- `pnpm build` : Web ビルド
- `pnpm tauri:dev` : Tauri(Windows)版
- `pnpm tauri build` : Tauri ビルド
- `pnpm test` : ドメインテスト
- `pnpm scrape:jp` : frame.combo データ取得
- `pnpm scrape:jp:supercombo` : supercombo 生データ取得

## 判定アーキテクチャ（2モード）

入力取得 60fps ポーリングと入力フレーム配信は従来どおり維持し、
判定エンジンを `trial-engine` へ分離しました。

```text
Controller (Web/Tauri)
  -> InputSnapshot(direction, physicalDown)
  -> buildInputFrame(frame, down/pressed/released)
  -> TrialRunnerPanel.subscribe(frame)
  -> TrialEngine.advance(frame)
      -> mode-specific progression / scoring
  -> snapshot を React state へ反映
```

### 共通基盤
- `src/domain/trial-engine/core/inputMatcher.ts`
  - direction + button + motion の成立判定
- `src/domain/trial-engine/core/stepWindow.ts`
  - window と timeline target 算出
- `src/domain/trial-engine/core/runtimeState.ts`
  - snapshot / events / assessments 管理
- `src/domain/trial-engine/createTrialEngine.ts`
  - trial rules + UI override でモード生成

### Mode 1: Timeline（デフォルト推奨）
- 実装: `src/domain/trial-engine/modes/timelineEngine.ts`
- ステップごとに `targetFrame` と `actualFrame` の `deltaFrames` を計測。
- 失敗停止はしない。未入力は `missed` として自動前進。

### Mode 2: Stepper（失敗判定なし）
- 実装: `src/domain/trial-engine/modes/stepperEngine.ts`
- コマンド成立で次ステップへ。
- 誤検知対策として以下をゲート化。
  - step開始以降入力のみ評価
  - 押下エッジ必須
  - 必要に応じた release gate
  - timeout は fail でなく retry

## Trial スキーマ（主要）
- `src/domain/trial/schema.ts`
- `rules.defaultMode`: `timeline | stepper`
- `rules.allowModeOverride`: UI 上書き可否
- `rules.timeline`: timeline デフォルト設定
- `rules.stepper`: stepper デフォルト設定
- `steps[].timeline`: target/miss/tolerance 設定（未指定時は timing/window から補完）
- `steps[].stepper`: stepper 個別設定

## バリデーション
- `src/domain/trial/validate.ts`
- モード設定、timeline target、window 数値を検証。

## 入力実装
### Web
- `src/platform/web/gamepadProvider.ts`
- `requestAnimationFrame` + `1000/60` 積算で 60fps 化。

### Tauri
- `src-tauri/src/input/mod.rs`
- ネイティブポーリングスレッドで 60fps イベント emit。

### 共通入力正規化
- `src/domain/input/frame.ts`
- `down/pressed/released` を前フレーム差分で算出。

## テスト
- `tests-cjs/input-frame.test.cjs`
- `tests-cjs/button-mapping.test.cjs`
- `tests-cjs/motion.test.cjs`
- `tests-cjs/trial-validate.test.cjs`
- `tests-cjs/trial-timeline.test.cjs`
- `tests-cjs/trial-stepper.test.cjs`

## 現在の trial データ
- `data/trials/jp/*.combo-trial.json`
- 既存 trial は `rules.defaultMode = timeline` で運用。
- UI から mode override（許可時）で Timeline / Stepper を切替可能。

## Supercombo データ
- `data/jp/frame.supercombo.raw.json` を保持。
- `tools/scrape-sf6-supercombo-frames.ts` と `artifacts/jp/supercombo-frame/*` を保持。

## 注意
- この環境では `node/pnpm` が未導入のため、CI/ローカルで `pnpm test` を実行して最終確認してください。
