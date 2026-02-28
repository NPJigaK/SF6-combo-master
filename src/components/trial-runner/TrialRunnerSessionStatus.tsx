import type { CompiledTrial, CompiledTrialStep } from "../../domain/trial/compiled";
import type { TrialEngineSnapshot } from "../../domain/trial-engine/core/types";
import { trialModeLabel } from "./trialRunnerOptions";

export type TrialRunnerSessionStatusProps = {
  trial: CompiledTrial;
  snapshot: TrialEngineSnapshot;
  currentStep: CompiledTrialStep | null;
  providerLoading: boolean;
  providerError: string | null;
};

function stepDisplayName(step: CompiledTrialStep): string {
  return step.label ?? step.id;
}

export function TrialRunnerSessionStatus({
  trial,
  snapshot,
  currentStep,
  providerLoading,
  providerError,
}: TrialRunnerSessionStatusProps) {
  const currentAssessment = snapshot.assessments[snapshot.currentStepIndex] ?? null;

  if (providerError) {
    return (
      <div className="native-error">
        <h3>Input Error</h3>
        <p>{providerError}</p>
        <p>選択中モードで入力を開始できませんでした。コントローラー接続とモード設定を確認してください。</p>
      </div>
    );
  }

  if (providerLoading) {
    return (
      <div className="provider-loading">
        <h3>Input Provider</h3>
        <p>入力プロバイダーを初期化しています...</p>
      </div>
    );
  }

  return (
    <div className="trial-window">
      <p>
        Mode: <strong>{trialModeLabel(snapshot.mode)}</strong>
      </p>
      <p>
        Current Step: <strong>{currentStep ? `${snapshot.currentStepIndex + 1}/${trial.steps.length} ${stepDisplayName(currentStep)}` : "Complete"}</strong>
      </p>
      <p>
        Window:{" "}
        <strong>
          {snapshot.currentWindowOpenFrame ?? "-"}F - {snapshot.currentWindowCloseFrame ?? "-"}F
        </strong>
      </p>
      <p>
        Last Match: <strong>{snapshot.lastMatchedFrame ?? "-"}</strong>
      </p>
      <p>
        Last Input / Commit:{" "}
        <strong>
          {snapshot.lastMatchedInputFrame ?? "-"}F / {snapshot.lastMatchedCommitFrame ?? "-"}F
        </strong>
      </p>
      {snapshot.mode === "timeline" ? (
        <p>
          Timeline Delta:{" "}
          <strong>
            {currentAssessment?.deltaFrames === null || currentAssessment?.deltaFrames === undefined
              ? "-"
              : `${currentAssessment.deltaFrames >= 0 ? "+" : ""}${currentAssessment.deltaFrames}F`}
          </strong>
        </p>
      ) : null}
      {snapshot.mode === "stepper" ? (
        <p>
          Step Attempts: <strong>{currentAssessment?.attempts ?? 0}</strong>
        </p>
      ) : null}
    </div>
  );
}
