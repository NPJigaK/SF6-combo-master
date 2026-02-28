import { useEffect, useMemo, useState } from "react";
import { ComboBuilderFeature } from "./features/combo-builder/ComboBuilderFeature";
import { MoveBrowserFeature } from "./features/move-browser/MoveBrowserFeature";
import { TrialPracticeFeature } from "./features/trial-practice/TrialPracticeFeature";
import "./App.css";

type AppScreen = "trial-practice" | "move-browser" | "combo-builder";

type AppScreenDefinition = {
  id: AppScreen;
  label: string;
  description: string;
};

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

const APP_STORAGE_KEYS = {
  screen: "sf6_app_screen",
  characterId: "sf6_app_character_id",
} as const;

const APP_SCREENS: readonly AppScreenDefinition[] = [
  {
    id: "trial-practice",
    label: "コンボ練習",
    description: "公式トライアルに近い進行で入力精度を確認します。",
  },
  {
    id: "move-browser",
    label: "技ブラウザ",
    description: "moves.master.json の技データを確認します。",
  },
  {
    id: "combo-builder",
    label: "コンボビルダー",
    description: "GUI で combo-trial JSON を生成します。",
  },
];

function isAppScreen(value: string): value is AppScreen {
  return value === "trial-practice" || value === "move-browser" || value === "combo-builder";
}

function readStoredString(key: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStoredString(key: string, value: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage write failures.
  }
}

export default function App() {
  const [screen, setScreen] = useState<AppScreen>(() => {
    const stored = readStoredString(APP_STORAGE_KEYS.screen);
    return stored && isAppScreen(stored) ? stored : "trial-practice";
  });
  const [characterId, setCharacterId] = useState<string>(() => {
    const stored = readStoredString(APP_STORAGE_KEYS.characterId);
    if (stored && availableCharacters.includes(stored)) {
      return stored;
    }
    return availableCharacters[0] ?? "";
  });

  useEffect(() => {
    writeStoredString(APP_STORAGE_KEYS.screen, screen);
  }, [screen]);

  useEffect(() => {
    if (!characterId || !availableCharacters.includes(characterId)) {
      setCharacterId(availableCharacters[0] ?? "");
      return;
    }
    writeStoredString(APP_STORAGE_KEYS.characterId, characterId);
  }, [characterId]);

  const activeScreen = useMemo(() => APP_SCREENS.find((screenDefinition) => screenDefinition.id === screen), [screen]);

  return (
    <main className="app">
      <header className="app-header">
        <h1>SF6 Combo Master</h1>
        <p>公式トライアル相当のコンボ練習 + moves.master.json の技データ閲覧。</p>
      </header>

      <section className="app-toolbar">
        <label className="control app-character-control">
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

        <div className="screen-tabs" role="tablist" aria-label="画面切り替え">
          {APP_SCREENS.map((screenDefinition) => (
            <button
              key={screenDefinition.id}
              type="button"
              role="tab"
              className={`screen-tab${screenDefinition.id === screen ? " is-active" : ""}`}
              aria-selected={screenDefinition.id === screen}
              onClick={() => setScreen(screenDefinition.id)}
            >
              {screenDefinition.label}
            </button>
          ))}
        </div>

        <p className="screen-description">{activeScreen?.description ?? ""}</p>
      </section>

      <section className="app-screen-content">
        {screen === "trial-practice" ? <TrialPracticeFeature characterId={characterId} /> : null}
        {screen === "move-browser" ? <MoveBrowserFeature characterId={characterId} /> : null}
        {screen === "combo-builder" ? <ComboBuilderFeature characterId={characterId} /> : null}
      </section>
    </main>
  );
}
