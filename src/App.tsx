import { useState } from "react";
import { MoveBrowserFeature } from "./features/move-browser/MoveBrowserFeature";
import { TrialPracticeFeature } from "./features/trial-practice/TrialPracticeFeature";
import "./App.css";

type AppScreen = "trial-practice" | "move-browser";

function parseCharacterIdFromMasterPath(path: string): string | null {
  const match = path.match(/\/data\/([^/]+)\/moves\.master\.json$/);
  return match?.[1] ?? null;
}

function characterLabel(characterId: string): string {
  return characterId.toUpperCase();
}

const masterDataModules = import.meta.glob("../data/*/moves.master.json", {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

const availableCharacters = Object.keys(masterDataModules)
  .map((path) => parseCharacterIdFromMasterPath(path))
  .filter((value): value is string => Boolean(value))
  .sort();

export default function App() {
  const [screen, setScreen] = useState<AppScreen>("trial-practice");
  const [characterId, setCharacterId] = useState<string>(availableCharacters[0] ?? "");

  return (
    <main className="app">
      <header className="app-header">
        <h1>SF6 Combo Master</h1>
        <p>公式トライアル相当のコンボ練習 + moves.master.json の技データ閲覧。</p>
      </header>

      <section className="controls">
        <label className="control">
          <span>キャラ</span>
          <select
            value={characterId}
            onChange={(event) => setCharacterId(event.currentTarget.value)}
            disabled={availableCharacters.length === 0}
          >
            {availableCharacters.map((id) => (
              <option key={id} value={id}>
                {characterLabel(id)}
              </option>
            ))}
          </select>
        </label>
        <label className="control">
          <span>画面</span>
          <select
            value={screen}
            onChange={(event) => {
              const nextScreen = event.currentTarget.value;
              if (nextScreen === "trial-practice" || nextScreen === "move-browser") {
                setScreen(nextScreen);
              }
            }}
          >
            <option value="trial-practice">コンボ練習</option>
            <option value="move-browser">技ブラウザ</option>
          </select>
        </label>
      </section>

      {screen === "trial-practice" ? (
        <TrialPracticeFeature characterId={characterId} />
      ) : (
        <MoveBrowserFeature characterId={characterId} />
      )}
    </main>
  );
}
