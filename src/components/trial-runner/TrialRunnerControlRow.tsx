import type { InputMode, InputProviderKind } from "../../domain/input/types";
import type { DirectionMode } from "../../domain/input/direction";
import type { TrialMode } from "../../domain/trial/schema";
import {
  DIRECTION_DISPLAY_MODES,
  DOWN_DISPLAY_MODES,
  directionDisplayModeLabel,
  downDisplayModeLabel,
  type DirectionDisplayMode,
  type DownDisplayMode,
} from "./inputDisplayRenderers";
import { INPUT_MODES, PLAYER_SIDE_MODES, inputModeLabel, playerSideModeLabel, trialModeLabel } from "./trialRunnerOptions";

export type TrialRunnerControlRowProps = {
  selectedTrialMode: TrialMode;
  availableTrialModes: readonly TrialMode[];
  allowModeOverride: boolean;
  inputMode: InputMode;
  directionMode: DirectionMode;
  directionDisplayMode: DirectionDisplayMode;
  downDisplayMode: DownDisplayMode;
  providerKind: InputProviderKind;
  isBindingsOpen: boolean;
  onTrialModeChange: (value: string) => void;
  onInputModeChange: (value: string) => void;
  onDirectionModeChange: (value: string) => void;
  onDirectionDisplayModeChange: (value: string) => void;
  onDownDisplayModeChange: (value: string) => void;
  onOpenBindings: () => void;
};

export function TrialRunnerControlRow({
  selectedTrialMode,
  availableTrialModes,
  allowModeOverride,
  inputMode,
  directionMode,
  directionDisplayMode,
  downDisplayMode,
  providerKind,
  isBindingsOpen,
  onTrialModeChange,
  onInputModeChange,
  onDirectionModeChange,
  onDirectionDisplayModeChange,
  onDownDisplayModeChange,
  onOpenBindings,
}: TrialRunnerControlRowProps) {
  return (
    <div className="input-mode-row">
      <label className="input-mode-control">
        <span>Trial Mode</span>
        <select
          value={selectedTrialMode}
          onChange={(event) => onTrialModeChange(event.currentTarget.value)}
          disabled={!allowModeOverride}
        >
          {availableTrialModes.map((mode) => (
            <option key={mode} value={mode}>
              {trialModeLabel(mode)}
            </option>
          ))}
        </select>
      </label>
      <label className="input-mode-control">
        <span>Input Mode</span>
        <select value={inputMode} onChange={(event) => onInputModeChange(event.currentTarget.value)}>
          {INPUT_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {inputModeLabel(mode)}
            </option>
          ))}
        </select>
      </label>
      <label className="input-mode-control">
        <span>Player Side</span>
        <select value={directionMode} onChange={(event) => onDirectionModeChange(event.currentTarget.value)}>
          {PLAYER_SIDE_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {playerSideModeLabel(mode)}
            </option>
          ))}
        </select>
      </label>
      <label className="input-mode-control">
        <span>Dir Display</span>
        <select value={directionDisplayMode} onChange={(event) => onDirectionDisplayModeChange(event.currentTarget.value)}>
          {DIRECTION_DISPLAY_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {directionDisplayModeLabel(mode)}
            </option>
          ))}
        </select>
      </label>
      <label className="input-mode-control">
        <span>Down Display</span>
        <select value={downDisplayMode} onChange={(event) => onDownDisplayModeChange(event.currentTarget.value)}>
          {DOWN_DISPLAY_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {downDisplayModeLabel(mode)}
            </option>
          ))}
        </select>
      </label>
      <p className="provider-line">
        Input Provider: <strong>{providerKind}</strong>
      </p>
      <button
        className="open-bindings-button"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isBindingsOpen}
        onClick={onOpenBindings}
      >
        Button Bindings
      </button>
    </div>
  );
}
