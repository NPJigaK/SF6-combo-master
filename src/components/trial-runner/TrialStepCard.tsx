import type { ReactNode } from "react";
import type { StepAssessment } from "../../domain/trial-engine/core/types";

export type TrialStepCardProps = {
  title: string;
  windowLabel: string;
  expectation: ReactNode;
  stateClass: string;
  assessment?: StepAssessment;
};

function formatAssessmentText(assessment: StepAssessment): string {
  const parts: string[] = [assessment.result];
  if (assessment.deltaFrames !== null) {
    parts.push(`delta ${assessment.deltaFrames >= 0 ? "+" : ""}${assessment.deltaFrames}F`);
  }
  if (assessment.attempts > 0) {
    parts.push(`attempts ${assessment.attempts}`);
  }
  return parts.join(" / ");
}

export function TrialStepCard({ title, windowLabel, expectation, stateClass, assessment }: TrialStepCardProps) {
  return (
    <li className={`trial-step ${stateClass}`}>
      <div className="trial-step-head">
        <strong>{title}</strong>
        <span>{windowLabel}</span>
      </div>
      <p className="trial-step-expectation">{expectation}</p>
      {assessment ? <p className="trial-step-assessment">{formatAssessmentText(assessment)}</p> : null}
    </li>
  );
}
