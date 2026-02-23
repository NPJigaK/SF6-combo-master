# SF6 Combo Master

SF6 のコンボ練習用アプリです。Web 版と Tauri(Windows)版を並行開発しています。

## 開発コマンド
- `pnpm dev` : Web 版
- `pnpm build` : Web ビルド
- `pnpm tauri:dev` : Tauri(Windows)版
- `pnpm tauri build` : Tauri ビルド

## Web アプリ版
Web Gamepad API で全てのコントローラーを対応しています。
※ブラウザ/OSの実装差により、挙動が異なる場合があります。

## ネイティブアプリ版

| コントローラー種別 | API | 状態 |
|---|---|---|
| Xbox / XInput系 | XInput API | ネイティブ対応 |
| PS4 (DS4) / HIDコントローラー | hidapi | ネイティブ対応 |
| PS3 | Web Gamepad API | 互換対応 |
| Switch | Web Gamepad API | 互換対応 |
| その他未対応コントローラー | Web Gamepad API | 互換対応 |
