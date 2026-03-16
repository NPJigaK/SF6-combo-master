import type { InputProfile } from "@sf6cm/core";

import { getProfileLabel, getUiCopy, type SupportedLocale } from "../i18n";

export function SettingsPanel({
  locale,
  notation,
  activeProfile,
  onLocaleChange,
  onNotationChange,
}: {
  locale: SupportedLocale;
  notation: "icon" | "numpad";
  activeProfile: InputProfile;
  onLocaleChange: (locale: SupportedLocale) => void;
  onNotationChange: (notation: "icon" | "numpad") => void;
}) {
  const ui = getUiCopy(locale);

  return (
    <section aria-labelledby="settings-title">
      <header>
        <h2 id="settings-title">{ui.settingsTitle}</h2>
      </header>
      <div style={{ display: "grid", gap: "0.85rem" }}>
        <label style={{ display: "grid", gap: "0.35rem" }}>
          <span>{ui.languageLabel}</span>
          <select value={locale} onChange={(event) => onLocaleChange(event.target.value as SupportedLocale)}>
            <option value="en">English</option>
            <option value="ja">Japanese</option>
          </select>
        </label>
        <label style={{ display: "grid", gap: "0.35rem" }}>
          <span>{ui.notationLabel}</span>
          <select value={notation} onChange={(event) => onNotationChange(event.target.value as "icon" | "numpad")}>
            <option value="icon">{ui.notationIcon}</option>
            <option value="numpad">{ui.notationNumpad}</option>
          </select>
        </label>
        <label style={{ display: "grid", gap: "0.35rem" }}>
          <span>{ui.profileLabel}</span>
          <select value={activeProfile.profile_id} disabled>
            <option value={activeProfile.profile_id}>{getProfileLabel(locale, activeProfile.label_key)}</option>
          </select>
        </label>
      </div>
    </section>
  );
}
