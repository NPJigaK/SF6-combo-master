import type { CompiledTrial } from "../../domain/trial/compiled";
import type { TrialEngineSnapshot } from "../../domain/trial-engine/core/types";
import { useTrialRunnerController } from "../../hooks/useTrialRunnerController";
import { ButtonBindingPanel } from "../binding/ButtonBindingPanel";
import { InputHistoryDisplay } from "./InputHistoryDisplay";
import { TrialDebugPanels } from "./TrialDebugPanels";
import { TrialRunnerControlRow } from "./TrialRunnerControlRow";
import { TrialRunnerSessionStatus } from "./TrialRunnerSessionStatus";
import { TrialStepList } from "./TrialStepList";
import { trialModeLabel } from "./trialRunnerOptions";

function statusLabel(status: TrialEngineSnapshot["status"]): string {
  if (status === "success") {
    return "Success";
  }
  return "Running";
}

export function TrialRunnerPanel({ trial }: { trial: CompiledTrial }) {
  const controller = useTrialRunnerController({ trial });

  return (
    <section className="trial-panel">
      <div className="trial-head">
        <div>
          <h2>Combo Trial ({trialModeLabel(controller.trialSnapshot.mode)})</h2>
          <p>{trial.name}</p>
        </div>
        <div className="trial-actions">
          <span className={`trial-status is-${controller.trialSnapshot.status}`}>{statusLabel(controller.trialSnapshot.status)}</span>
          <button type="button" onClick={controller.handleReset}>
            Reset Trial
          </button>
        </div>
      </div>

      <TrialRunnerControlRow
        selectedTrialMode={controller.selectedTrialMode}
        availableTrialModes={controller.availableTrialModes}
        allowModeOverride={controller.allowModeOverride}
        inputMode={controller.inputMode}
        directionMode={controller.directionMode}
        directionDisplayMode={controller.directionDisplayMode}
        downDisplayMode={controller.downDisplayMode}
        providerKind={controller.providerKind}
        isBindingsOpen={controller.isBindingsOpen}
        onTrialModeChange={controller.handleTrialModeChange}
        onInputModeChange={controller.handleInputModeChange}
        onDirectionModeChange={controller.handleDirectionModeChange}
        onDirectionDisplayModeChange={controller.handleDirectionDisplayModeChange}
        onDownDisplayModeChange={controller.handleDownDisplayModeChange}
        onOpenBindings={controller.handleOpenBindings}
      />

      <ButtonBindingPanel
        isOpen={controller.isBindingsOpen}
        pendingBindingTarget={controller.pendingBindingTarget}
        buttonBindings={controller.buttonBindings}
        resetTrialBinding={controller.resetTrialBinding}
        onClose={controller.handleCloseBindings}
        onResetToDefault={controller.handleResetBindingsToDefault}
        onStartBinding={controller.handleStartBinding}
        onClearBinding={controller.handleClearBinding}
        onCancelBinding={controller.handleCancelBinding}
        onStartResetTrialBinding={controller.handleStartResetTrialBinding}
        onClearResetTrialBinding={controller.handleClearResetTrialBinding}
      />

      <TrialRunnerSessionStatus
        trial={trial}
        snapshot={controller.trialSnapshot}
        currentStep={controller.currentStep}
        providerLoading={controller.providerLoading}
        providerError={controller.providerError}
      />

      {trial.notes?.length ? (
        <section className="trial-note-panel">
          <h3>Note</h3>
          <ul>
            {trial.notes.map((note, index) => (
              <li key={`${trial.id}-note-${index}`}>{note}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="trial-layout">
        <TrialStepList
          steps={trial.steps}
          snapshot={controller.trialSnapshot}
          renderDirection={controller.renderDirection}
          renderButtons={controller.renderButtons}
        />

        <section className="trial-log-panel">
          <InputHistoryDisplay
            entries={controller.visibleHistoryEntries}
            renderDirection={controller.renderDirection}
            renderButtons={controller.renderButtons}
          />
          <TrialDebugPanels
            frames={controller.visibleFrames}
            events={controller.trialSnapshot.events}
            renderDirection={controller.renderDirection}
            renderButtons={controller.renderButtons}
          />
        </section>
      </div>
    </section>
  );
}
