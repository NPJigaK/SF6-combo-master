import type { ReactNode } from "react";
import { toDisplayHoldFrames, type InputHistoryEntry } from "../../domain/input/history";

export type InputHistoryDisplayProps = {
  entries: readonly InputHistoryEntry[];
  renderDirection: (direction: number | undefined) => ReactNode;
  renderButtons: (buttons: readonly string[]) => ReactNode;
};

export function InputHistoryDisplay({ entries, renderDirection, renderButtons }: InputHistoryDisplayProps) {
  return (
    <>
      <h3>Input History</h3>
      <div className="frame-log-wrap">
        <table className="frame-log-table history-table">
          <thead>
            <tr>
              <th>Hold</th>
              <th>Dir</th>
              <th>Down</th>
            </tr>
          </thead>
          <tbody>
            {entries.length > 0 ? (
              entries.map((entry) => (
                <tr key={`${entry.startFrame}-${entry.endFrame}`}>
                  <td>{toDisplayHoldFrames(entry.holdFrames)}</td>
                  <td>{renderDirection(entry.direction)}</td>
                  <td>{renderButtons(entry.down)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3}>No input history yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
