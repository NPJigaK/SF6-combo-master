import type { AttackButtonToken, InputHistoryView, ResolvedDirection } from "@sf6cm/core";

import { getUiCopy, type SupportedLocale } from "../i18n";

const directionAssetMap: Partial<Record<ResolvedDirection, string>> = {
  neutral: "/assets/controller/key-nutral.png",
  back: "/assets/controller/key-l.png",
  down_back: "/assets/controller/key-dl.png",
  down: "/assets/controller/key-d.png",
  down_forward: "/assets/controller/key-dr.png",
  forward: "/assets/controller/key-r.png",
};

const buttonAssetMap: Record<AttackButtonToken, string> = {
  LP: "/assets/controller/icon_punch_l.png",
  MP: "/assets/controller/icon_punch_m.png",
  HP: "/assets/controller/icon_punch_h.png",
  PP: "/assets/controller/icon_punch.png",
  LK: "/assets/controller/icon_kick_l.png",
  MK: "/assets/controller/icon_kick_m.png",
  HK: "/assets/controller/icon_kick_h.png",
  KK: "/assets/controller/icon_kick.png",
};

function renderDirection(direction: ResolvedDirection) {
  const asset = directionAssetMap[direction];

  if (asset) {
    return <img src={asset} alt={direction} style={{ width: 36, height: 36 }} />;
  }

  return <span style={{ fontWeight: 700 }}>{direction}</span>;
}

function renderButton(button: AttackButtonToken) {
  return <img src={buttonAssetMap[button]} alt={button} style={{ width: 28, height: 28 }} />;
}

export function InputHistoryPanel({
  locale,
  view,
}: {
  locale: SupportedLocale;
  view: InputHistoryView;
}) {
  const ui = getUiCopy(locale);

  return (
    <section aria-labelledby="input-history-title">
      <header>
        <p>{view.view_version}</p>
        <h2 id="input-history-title">{ui.inputHistoryTitle}</h2>
      </header>
      <ul
        data-testid="input-history"
        style={{ display: "grid", gap: "0.75rem", padding: 0, listStyle: "none" }}
      >
        {view.entries.map((entry) => (
          <li
            key={`${entry.start_frame}-${entry.end_frame}-${entry.direction}-${entry.held_buttons.join(".")}`}
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              alignItems: "center",
              gap: "0.8rem",
              padding: "0.8rem 1rem",
              borderRadius: "1rem",
              background: "#fafaf9",
              border: "1px solid #e7e5e4",
            }}
          >
            {renderDirection(entry.direction)}
            <div>
              <div style={{ fontWeight: 700 }}>{entry.direction}</div>
              <div style={{ color: "#57534e" }}>
                frames {entry.start_frame}-{entry.end_frame} ({entry.hold_frames}f)
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.35rem", minHeight: 28 }}>
              {entry.held_buttons.length > 0 ? entry.held_buttons.map((button) => (
                <span key={`${entry.start_frame}-${button}`}>{renderButton(button)}</span>
              )) : <span style={{ color: "#78716c" }}>-</span>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
