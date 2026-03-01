import { Fragment, type ReactNode } from "react";
import { applyDirectionModeToDirection, applyDirectionModeToMotion, type DirectionMode } from "../../domain/input/direction";
import type { CompiledTrialMoveStep, CompiledTrialStep } from "../../domain/trial/compiled";
import type { TrialEngineSnapshot } from "../../domain/trial-engine/core/types";
import { TrialStepCard } from "./TrialStepCard";

type DirectionRenderer = (direction: number | undefined) => ReactNode;
type ButtonsRenderer = (buttons: readonly string[]) => ReactNode;

export type TrialStepListProps = {
  steps: readonly CompiledTrialStep[];
  snapshot: TrialEngineSnapshot;
  directionMode: DirectionMode;
  renderDirection: DirectionRenderer;
  renderButtons: ButtonsRenderer;
};

function parseMotionDirections(motion: string): number[] {
  const directions: number[] = [];
  for (const char of motion) {
    const direction = Number(char);
    if (Number.isInteger(direction) && direction >= 1 && direction <= 9) {
      directions.push(direction);
    }
  }
  return directions;
}

function renderMotionValue(motion: string, directionMode: DirectionMode, renderDirection: DirectionRenderer): ReactNode {
  const displayMotion = applyDirectionModeToMotion(motion, directionMode);
  const directions = parseMotionDirections(displayMotion);
  if (directions.length === 0) {
    return displayMotion;
  }

  return (
    <span className="trial-step-motion-seq">
      {directions.map((direction, index) => (
        <span key={`${displayMotion}-${index}-${direction}`} className="trial-step-motion-token">
          {renderDirection(direction)}
        </span>
      ))}
    </span>
  );
}

function renderStepExpectation(
  step: CompiledTrialStep,
  directionMode: DirectionMode,
  renderDirection: DirectionRenderer,
  renderButtons: ButtonsRenderer,
): ReactNode {
  if (step.kind === "delay") {
    return `Delay ${step.frames}F`;
  }

  const moveStep: CompiledTrialMoveStep = step;
  const parts: ReactNode[] = [];

  if (moveStep.expect.motion) {
    parts.push(
      <span key="motion" className="trial-step-expect-group">
        <span className="trial-step-expect-label">motion</span>
        <span>{renderMotionValue(moveStep.expect.motion, directionMode, renderDirection)}</span>
      </span>,
    );
  }

  if (moveStep.expect.direction) {
    const displayDirection = applyDirectionModeToDirection(moveStep.expect.direction, directionMode);
    parts.push(
      <span key="direction" className="trial-step-expect-group">
        <span className="trial-step-expect-label">dir</span>
        <span>{renderDirection(displayDirection)}</span>
      </span>,
    );
  }

  if (moveStep.expect.buttons?.length) {
    parts.push(
      <span key="buttons" className="trial-step-expect-group">
        <span>{renderButtons(moveStep.expect.buttons)}</span>
        {moveStep.expect.simultaneousWithinFrames !== undefined ? (
          <span className="trial-step-expect-frames">({moveStep.expect.simultaneousWithinFrames}F)</span>
        ) : null}
      </span>,
    );
  }

  if (moveStep.expect.anyTwoButtonsFrom?.length) {
    parts.push(
      <span key="any-two-buttons" className="trial-step-expect-group">
        <span className="trial-step-expect-label">Any 2</span>
        <span>{renderButtons(moveStep.expect.anyTwoButtonsFrom)}</span>
        {moveStep.expect.simultaneousWithinFrames !== undefined ? (
          <span className="trial-step-expect-frames">({moveStep.expect.simultaneousWithinFrames}F)</span>
        ) : null}
      </span>,
    );
  }

  if (parts.length === 0) {
    return "-";
  }

  return (
    <span className="trial-step-expectation-parts">
      {parts.map((part, index) => (
        <Fragment key={`step-part-${index}`}>
          {index > 0 ? <span className="trial-step-expect-join">+</span> : null}
          {part}
        </Fragment>
      ))}
    </span>
  );
}

function stepDisplayName(step: CompiledTrialStep): string {
  return step.label ?? step.id;
}

function stepStateClass(stepIndex: number, snapshot: TrialEngineSnapshot): string {
  if (stepIndex < snapshot.currentStepIndex) {
    return "is-completed";
  }
  if (stepIndex === snapshot.currentStepIndex && snapshot.status === "running") {
    return "is-active";
  }
  return "is-pending";
}

function stepWindowLabel(step: CompiledTrialStep): string {
  if (!step.windowFromPrev) {
    return "Start Policy";
  }
  return `+${step.windowFromPrev.minAfterPrevFrames}F to +${step.windowFromPrev.maxAfterPrevFrames}F`;
}

export function TrialStepList({ steps, snapshot, directionMode, renderDirection, renderButtons }: TrialStepListProps) {
  return (
    <section className="trial-steps-panel">
      <h3>Steps</h3>
      <ol className="trial-steps">
        {steps.map((step, stepIndex) => (
          <TrialStepCard
            key={`${step.id}-${stepIndex}`}
            title={stepDisplayName(step)}
            stateClass={stepStateClass(stepIndex, snapshot)}
            windowLabel={stepWindowLabel(step)}
            expectation={renderStepExpectation(step, directionMode, renderDirection, renderButtons)}
            assessment={snapshot.assessments[stepIndex]}
          />
        ))}
      </ol>
    </section>
  );
}
