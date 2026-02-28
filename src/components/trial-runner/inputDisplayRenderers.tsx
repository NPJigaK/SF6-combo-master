import { Fragment, type ReactNode } from "react";
import type { CanonicalButton } from "../../domain/input/types";

export const DIRECTION_DISPLAY_MODES = ["number", "arrow"] as const;
export const DOWN_DISPLAY_MODES = ["text", "icon"] as const;

export type DirectionDisplayMode = (typeof DIRECTION_DISPLAY_MODES)[number];
export type DownDisplayMode = (typeof DOWN_DISPLAY_MODES)[number];

const BUTTON_SEPARATOR_ICON_SRC = "/assets/controller/key-plus.png";

const BUTTON_ICON_BY_NAME: Partial<Record<CanonicalButton, string>> = {
  LP: "/assets/controller/icon_punch_l.png",
  MP: "/assets/controller/icon_punch_m.png",
  HP: "/assets/controller/icon_punch_h.png",
  LK: "/assets/controller/icon_kick_l.png",
  MK: "/assets/controller/icon_kick_m.png",
  HK: "/assets/controller/icon_kick_h.png",
};

type DirectionIconSpec = {
  src: string;
  alt: string;
  rotateDeg?: number;
};

function toDirectionIconSpec(direction: number): DirectionIconSpec | null {
  switch (direction) {
    case 1:
      return { src: "/assets/controller/key-dl.png", alt: "↙" };
    case 2:
      return { src: "/assets/controller/key-d.png", alt: "↓" };
    case 3:
      return { src: "/assets/controller/key-dr.png", alt: "↘" };
    case 4:
      return { src: "/assets/controller/key-l.png", alt: "←" };
    case 5:
      return { src: "/assets/controller/key-nutral.png", alt: "N" };
    case 6:
      return { src: "/assets/controller/key-r.png", alt: "→" };
    case 7:
      return { src: "/assets/controller/key-dr.png", alt: "↖", rotateDeg: 180 };
    case 8:
      return { src: "/assets/controller/key-d.png", alt: "↑", rotateDeg: 180 };
    case 9:
      return { src: "/assets/controller/key-dl.png", alt: "↗", rotateDeg: 180 };
    default:
      return null;
  }
}

function directionLabel(direction: number | undefined, mode: DirectionDisplayMode): ReactNode {
  if (!direction) {
    return "-";
  }

  if (mode === "number") {
    return String(direction);
  }

  switch (direction) {
    case 1:
      return "↙";
    case 2:
      return "↓";
    case 3:
      return "↘";
    case 4:
      return "←";
    case 5:
      return "N";
    case 6:
      return "→";
    case 7:
      return "↖";
    case 8:
      return "↑";
    case 9:
      return "↗";
    default:
      return "-";
  }
}

export function renderDirectionValue(direction: number | undefined, mode: DirectionDisplayMode): ReactNode {
  if (!direction) {
    return "-";
  }

  if (mode === "number") {
    return directionLabel(direction, mode);
  }

  const iconSpec = toDirectionIconSpec(direction);
  if (!iconSpec) {
    return directionLabel(direction, mode);
  }

  return (
    <img
      className="dir-icon"
      src={iconSpec.src}
      alt={iconSpec.alt}
      title={iconSpec.alt}
      loading="lazy"
      style={iconSpec.rotateDeg ? { transform: `rotate(${iconSpec.rotateDeg}deg)` } : undefined}
    />
  );
}

function renderSingleButton(button: string): ReactNode {
  const iconSrc = BUTTON_ICON_BY_NAME[button as CanonicalButton];
  if (!iconSrc) {
    return (
      <span className="button-fallback" title={button}>
        {button}
      </span>
    );
  }

  return <img className="button-icon" src={iconSrc} alt={button} title={button} loading="lazy" />;
}

export function renderButtonSet(buttons: readonly string[], mode: DownDisplayMode): ReactNode {
  if (buttons.length === 0) {
    return "-";
  }

  if (mode === "text") {
    return buttons.join("+");
  }

  return (
    <span className="input-buttons">
      {buttons.map((button, index) => (
        <Fragment key={`${button}-${index}`}>
          {index > 0 ? <img className="button-separator-icon" src={BUTTON_SEPARATOR_ICON_SRC} alt="+" title="+" loading="lazy" /> : null}
          {renderSingleButton(button)}
        </Fragment>
      ))}
    </span>
  );
}

export function isDirectionDisplayMode(value: string): value is DirectionDisplayMode {
  return DIRECTION_DISPLAY_MODES.includes(value as DirectionDisplayMode);
}

export function isDownDisplayMode(value: string): value is DownDisplayMode {
  return DOWN_DISPLAY_MODES.includes(value as DownDisplayMode);
}

export function directionDisplayModeLabel(mode: DirectionDisplayMode): string {
  switch (mode) {
    case "arrow":
      return "Icon";
    case "number":
    default:
      return "Number";
  }
}

export function downDisplayModeLabel(mode: DownDisplayMode): string {
  switch (mode) {
    case "icon":
      return "Icon";
    case "text":
    default:
      return "Text";
  }
}
