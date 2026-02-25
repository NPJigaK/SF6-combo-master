import type { InputFrame } from "../../input/types";
import type { ComboTrial, TrialStep } from "../../trial/schema";
import { isNeutralInput, resolveStepInputEvent, shouldStartTrial } from "../core/inputMatcher";
import { buildSnapshot, createInitialAssessments, pushEvent } from "../core/runtimeState";
import type { ModeEvent, StepAssessment, TrialEngine, TrialEngineSnapshot, TrialEngineStatus } from "../core/types";

const HISTORY_LIMIT_FRAMES = 240;
const DEFAULT_TIMEOUT_FRAMES = 60;

function hasButtonExpectation(step: TrialStep): boolean {
  return (step.expect.buttons?.length ?? 0) > 0 || (step.expect.anyTwoButtonsFrom?.length ?? 0) > 0;
}

function expectedButtons(step: TrialStep): Set<string> {
  return new Set([...(step.expect.buttons ?? []), ...(step.expect.anyTwoButtonsFrom ?? [])]);
}

function isDirectionOnlyStep(step: TrialStep): boolean {
  return step.expect.direction !== undefined && !step.expect.motion && !hasButtonExpectation(step);
}

function resolveTimeoutFrames(trial: ComboTrial, step: TrialStep): number {
  return (
    step.stepper?.timeoutFrames ??
    trial.rules?.stepper?.timeoutFramesDefault ??
    step.timing?.closeAfterPrevFrames ??
    step.window?.closeAfterPrevFrames ??
    DEFAULT_TIMEOUT_FRAMES
  );
}

export class StepperEngine implements TrialEngine {
  private readonly trial: ComboTrial;
  private history: InputFrame[] = [];
  private startFrame: number | null = null;
  private stepStartFrame: number | null = null;
  private currentFrame: number | null = null;
  private currentStepIndex = 0;
  private status: TrialEngineStatus = "running";
  private lastMatchedFrame: number | null = null;
  private lastMatchedInputFrame: number | null = null;
  private lastMatchedCommitFrame: number | null = null;
  private readonly assessments: StepAssessment[];
  private readonly events: ModeEvent[] = [];
  private readonly lastResolvedInputFrameByStep = new Map<number, number>();
  private releaseGateSatisfied = true;
  private neutralObservedSinceStepStart = false;

  public constructor(trial: ComboTrial) {
    this.trial = trial;
    this.assessments = createInitialAssessments(trial);
  }

  public reset(): void {
    this.history = [];
    this.startFrame = null;
    this.stepStartFrame = null;
    this.currentFrame = null;
    this.currentStepIndex = 0;
    this.status = "running";
    this.lastMatchedFrame = null;
    this.lastMatchedInputFrame = null;
    this.lastMatchedCommitFrame = null;
    this.lastResolvedInputFrameByStep.clear();
    this.releaseGateSatisfied = true;
    this.neutralObservedSinceStepStart = false;

    for (const assessment of this.assessments) {
      assessment.result = "pending";
      assessment.targetFrame = null;
      assessment.actualFrame = null;
      assessment.deltaFrames = null;
      assessment.attempts = 0;
      assessment.notes = [];
    }

    this.events.splice(0, this.events.length);
  }

  private currentStep(): TrialStep | null {
    return this.trial.steps[this.currentStepIndex] ?? null;
  }

  private configureStepEntry(step: TrialStep, previousStep: TrialStep | null): void {
    const requireReleaseBeforeReuse = step.stepper?.requireReleaseBeforeReuse ?? this.trial.rules?.stepper?.requireReleaseBeforeReuseDefault ?? true;
    if (!requireReleaseBeforeReuse || !hasButtonExpectation(step)) {
      this.releaseGateSatisfied = true;
    } else if (!previousStep || !hasButtonExpectation(previousStep)) {
      this.releaseGateSatisfied = true;
    } else {
      const stepButtons = expectedButtons(step);
      const previousButtons = expectedButtons(previousStep);
      const overlaps = Array.from(stepButtons).some((button) => previousButtons.has(button));
      this.releaseGateSatisfied = !overlaps;
    }
    this.neutralObservedSinceStepStart = false;
  }

  private getCurrentWindow(): { openFrame: number | null; closeFrame: number | null } {
    const step = this.currentStep();
    if (!step || this.stepStartFrame === null) {
      return {
        openFrame: null,
        closeFrame: null,
      };
    }

    const timeoutFrames = resolveTimeoutFrames(this.trial, step);
    return {
      openFrame: this.stepStartFrame,
      closeFrame: this.stepStartFrame + timeoutFrames,
    };
  }

  private completeIfFinished(frame: number): void {
    if (this.currentStepIndex < this.trial.steps.length) {
      return;
    }

    if (this.status !== "success") {
      this.status = "success";
      pushEvent(this.events, {
        type: "success",
        mode: "stepper",
        frame,
        stepIndex: null,
        stepId: null,
        message: `Stepper completed at ${frame}F.`,
      });
    }
  }

  private retryCurrentStep(frame: number, reason: string): void {
    const step = this.currentStep();
    if (!step) {
      return;
    }

    const assessment = this.assessments[this.currentStepIndex];
    assessment.result = "retried";
    assessment.attempts += 1;
    assessment.notes = [reason];

    pushEvent(this.events, {
      type: "step_retry",
      mode: "stepper",
      frame,
      stepIndex: this.currentStepIndex,
      stepId: step.id,
      message: `Step ${step.id} retry: ${reason}.`,
    });

    this.stepStartFrame = frame;
    this.configureStepEntry(step, null);
  }

  private markMatched(step: TrialStep, inputFrame: number): void {
    const assessment = this.assessments[this.currentStepIndex];
    assessment.result = "matched";
    assessment.actualFrame = inputFrame;
    assessment.deltaFrames = null;
    assessment.attempts += 1;
    assessment.notes = ["matched"];

    this.lastMatchedFrame = inputFrame;
    this.lastMatchedInputFrame = inputFrame;
    this.lastMatchedCommitFrame = inputFrame;

    pushEvent(this.events, {
      type: "step_matched",
      mode: "stepper",
      frame: inputFrame,
      stepIndex: this.currentStepIndex,
      stepId: step.id,
      message: `Step ${step.id} matched at ${inputFrame}F.`,
    });

    this.currentStepIndex += 1;
    const nextStep = this.currentStep();
    this.stepStartFrame = this.currentFrame;
    if (nextStep) {
      this.configureStepEntry(nextStep, step);
    }
  }

  private snapshot(): TrialEngineSnapshot {
    const window = this.getCurrentWindow();

    return buildSnapshot({
      mode: "stepper",
      status: this.status,
      currentStepIndex: this.currentStepIndex,
      currentFrame: this.currentFrame,
      currentWindowOpenFrame: window.openFrame,
      currentWindowCloseFrame: window.closeFrame,
      lastMatchedFrame: this.lastMatchedFrame,
      lastMatchedInputFrame: this.lastMatchedInputFrame,
      lastMatchedCommitFrame: this.lastMatchedCommitFrame,
      assessments: this.assessments,
      events: this.events,
    });
  }

  public getSnapshot(): TrialEngineSnapshot {
    return this.snapshot();
  }

  public advance(frame: InputFrame): TrialEngineSnapshot {
    this.currentFrame = frame.frame;

    this.history.push(frame);
    if (this.history.length > HISTORY_LIMIT_FRAMES) {
      this.history.splice(0, this.history.length - HISTORY_LIMIT_FRAMES);
    }

    if (this.status !== "running") {
      return this.snapshot();
    }

    if (this.startFrame === null) {
      if (!shouldStartTrial(this.trial.steps[0], frame)) {
        return this.snapshot();
      }

      this.startFrame = frame.frame;
      this.stepStartFrame = frame.frame;
      const firstStep = this.currentStep();
      if (firstStep) {
        this.configureStepEntry(firstStep, null);
      }
    }

    const step = this.currentStep();
    if (!step) {
      this.completeIfFinished(frame.frame);
      return this.snapshot();
    }

    const requireNeutralBeforeStep =
      step.stepper?.requireNeutralBeforeStep ?? this.trial.rules?.stepper?.requireNeutralBeforeStepDefault ?? false;
    if (isNeutralInput(frame)) {
      this.neutralObservedSinceStepStart = true;
    }

    const timeoutFrames = resolveTimeoutFrames(this.trial, step);
    if (this.stepStartFrame !== null && frame.frame - this.stepStartFrame > timeoutFrames) {
      this.retryCurrentStep(frame.frame, `timeout (${timeoutFrames}F)`);
      return this.snapshot();
    }

    const expected = expectedButtons(step);
    if (!this.releaseGateSatisfied && expected.size > 0) {
      const anyExpectedDown = frame.down.some((button) => expected.has(button));
      if (!anyExpectedDown) {
        this.releaseGateSatisfied = true;
      }
    }

    const match = resolveStepInputEvent(step, this.history, frame);
    if (!match) {
      return this.snapshot();
    }

    if (this.stepStartFrame !== null && match.inputFrame < this.stepStartFrame) {
      return this.snapshot();
    }

    const lastResolved = this.lastResolvedInputFrameByStep.get(this.currentStepIndex);
    if (lastResolved !== undefined && match.inputFrame <= lastResolved) {
      return this.snapshot();
    }

    const requirePressed = step.stepper?.requirePressed ?? this.trial.rules?.stepper?.requirePressedDefault ?? true;
    if (requirePressed && hasButtonExpectation(step) && frame.pressed.length === 0) {
      return this.snapshot();
    }

    const requireReleaseBeforeReuse =
      step.stepper?.requireReleaseBeforeReuse ?? this.trial.rules?.stepper?.requireReleaseBeforeReuseDefault ?? true;
    if (requireReleaseBeforeReuse && hasButtonExpectation(step) && !this.releaseGateSatisfied) {
      return this.snapshot();
    }

    if (requireNeutralBeforeStep && !this.neutralObservedSinceStepStart) {
      return this.snapshot();
    }

    if (isDirectionOnlyStep(step) && requireNeutralBeforeStep) {
      const previousFrame = this.history[this.history.length - 2];
      if (!previousFrame || previousFrame.direction !== 5) {
        return this.snapshot();
      }
    }

    this.lastResolvedInputFrameByStep.set(this.currentStepIndex, match.inputFrame);
    this.markMatched(step, match.inputFrame);
    this.completeIfFinished(frame.frame);
    return this.snapshot();
  }
}
