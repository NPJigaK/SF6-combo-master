import type { ReactNode } from "react";
import type { InputFrame } from "../../domain/input/types";
import type { TrialEngineSnapshot } from "../../domain/trial-engine/core/types";

export type TrialDebugPanelsProps = {
  frames: readonly InputFrame[];
  events: TrialEngineSnapshot["events"];
  renderDirection: (direction: number | undefined) => ReactNode;
  renderButtons: (buttons: readonly string[]) => ReactNode;
};

export function TrialDebugPanels({ frames, events, renderDirection, renderButtons }: TrialDebugPanelsProps) {
  return (
    <>
      <details className="debug-frame-panel">
        <summary>Debug Raw Frames</summary>
        <div className="frame-log-wrap">
          <table className="frame-log-table">
            <thead>
              <tr>
                <th>F</th>
                <th>Dir</th>
                <th>Pressed</th>
                <th>Down</th>
                <th>Released</th>
              </tr>
            </thead>
            <tbody>
              {frames.length > 0 ? (
                frames.map((frame) => (
                  <tr key={frame.frame}>
                    <td>{frame.frame}</td>
                    <td>{renderDirection(frame.direction)}</td>
                    <td>{frame.pressed.join("+") || "-"}</td>
                    <td>{renderButtons(frame.down)}</td>
                    <td>{frame.released.join("+") || "-"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>No input frames yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </details>

      <details className="debug-frame-panel">
        <summary>Mode Events ({events.length})</summary>
        <div className="frame-log-wrap">
          <table className="frame-log-table">
            <thead>
              <tr>
                <th>F</th>
                <th>Type</th>
                <th>Step</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {events.length > 0 ? (
                [...events]
                  .reverse()
                  .map((event, index) => (
                    <tr key={`${event.frame}-${event.type}-${index}`}>
                      <td>{event.frame}</td>
                      <td>{event.type}</td>
                      <td>{event.stepId ?? "-"}</td>
                      <td>{event.message}</td>
                    </tr>
                  ))
              ) : (
                <tr>
                  <td colSpan={4}>No mode events yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
