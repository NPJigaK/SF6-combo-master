import { useEffect } from "react";
import { ATTACK_ACTIONS, PHYSICAL_BUTTON_LABELS } from "../../domain/input/buttonMapping";
import type { AttackActionId, ButtonBindings, PhysicalButton } from "../../domain/input/types";

export type BindingTarget = AttackActionId | "resetTrial";

export type ButtonBindingPanelProps = {
  isOpen: boolean;
  pendingBindingTarget: BindingTarget | null;
  buttonBindings: ButtonBindings;
  resetTrialBinding: readonly PhysicalButton[];
  onClose: () => void;
  onResetToDefault: () => void;
  onStartBinding: (actionId: AttackActionId) => void;
  onClearBinding: (actionId: AttackActionId) => void;
  onCancelBinding: () => void;
  onStartResetTrialBinding: () => void;
  onClearResetTrialBinding: () => void;
};

function physicalButtonLabel(button: PhysicalButton | null): string {
  if (button === null) {
    return "-";
  }
  return PHYSICAL_BUTTON_LABELS[button] ?? button;
}

function physicalButtonSetLabel(buttons: readonly PhysicalButton[]): string {
  if (buttons.length === 0) {
    return "-";
  }
  return buttons.map((button) => physicalButtonLabel(button)).join(" + ");
}

function helperText(pendingBindingTarget: BindingTarget | null): string {
  if (pendingBindingTarget === "resetTrial") {
    return "Press all buttons for Reset Trial, then release to save.";
  }
  if (pendingBindingTarget) {
    return `Press any physical button to assign to ${pendingBindingTarget}.`;
  }
  return "Assign each action to the physical button that matches your SF6 settings.";
}

export function ButtonBindingPanel({
  isOpen,
  pendingBindingTarget,
  buttonBindings,
  resetTrialBinding,
  onClose,
  onResetToDefault,
  onStartBinding,
  onClearBinding,
  onCancelBinding,
  onStartResetTrialBinding,
  onClearResetTrialBinding,
}: ButtonBindingPanelProps) {
  useEffect(() => {
    if (!isOpen || typeof window === "undefined") {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="bindings-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="bindings-panel bindings-modal" role="dialog" aria-label="Button Bindings" onClick={(event) => event.stopPropagation()}>
        <div className="bindings-head">
          <h3>Button Bindings</h3>
          <div className="bindings-head-actions">
            <button type="button" onClick={onResetToDefault}>
              Reset Default
            </button>
            <button type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <p className="bindings-help">{helperText(pendingBindingTarget)}</p>
        <div className="bindings-table-wrap">
          <table className="bindings-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Assigned Button</th>
                <th>Controls</th>
              </tr>
            </thead>
            <tbody>
              <tr className={pendingBindingTarget === "resetTrial" ? "is-pending-bind" : undefined}>
                <td>
                  <strong>Reset Trial</strong>
                </td>
                <td>{physicalButtonSetLabel(resetTrialBinding)}</td>
                <td className="bindings-actions">
                  <button type="button" onClick={onStartResetTrialBinding} disabled={pendingBindingTarget === "resetTrial"}>
                    Assign
                  </button>
                  <button type="button" onClick={onClearResetTrialBinding} disabled={resetTrialBinding.length === 0}>
                    Clear
                  </button>
                  <button type="button" onClick={onCancelBinding} disabled={pendingBindingTarget !== "resetTrial"}>
                    Cancel
                  </button>
                </td>
              </tr>
              {ATTACK_ACTIONS.map((action) => {
                const assigned = buttonBindings[action.id];
                const pending = pendingBindingTarget === action.id;

                return (
                  <tr key={action.id} className={pending ? "is-pending-bind" : undefined}>
                    <td>
                      <strong>{action.label}</strong>
                    </td>
                    <td>{physicalButtonLabel(assigned)}</td>
                    <td className="bindings-actions">
                      <button type="button" onClick={() => onStartBinding(action.id)} disabled={pending}>
                        Assign
                      </button>
                      <button type="button" onClick={() => onClearBinding(action.id)} disabled={assigned === null}>
                        Clear
                      </button>
                      <button type="button" onClick={onCancelBinding} disabled={!pending}>
                        Cancel
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
