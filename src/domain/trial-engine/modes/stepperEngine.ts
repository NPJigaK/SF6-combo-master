import type { InputFrame } from "../../input/types";
import { applyDirectionModeToInputFrame, type DirectionMode } from "../../input/direction";
import type { CompiledTrial, CompiledTrialMoveStep, CompiledTrialStep } from "../../trial/compiled";
import { isNeutralInput, resolveStepInputEvent, shouldStartTrial } from "../core/inputMatcher";
import { buildSnapshot, createInitialAssessments, pushEvent } from "../core/runtimeState";
import type { ModeEvent, StepAssessment, TrialEngine, TrialEngineSnapshot, TrialEngineStatus } from "../core/types";

const HISTORY_LIMIT_FRAMES = 240;
const DEFAULT_TIMEOUT_FRAMES = 60;

function hasButtonExpectation(step: CompiledTrialMoveStep): boolean {
  return (step.expect.buttons?.length ?? 0) > 0 || (step.expect.anyTwoButtonsFrom?.length ?? 0) > 0;
}

function expectedButtons(step: CompiledTrialMoveStep): Set<string> {
  return new Set([...(step.expect.buttons ?? []), ...(step.expect.anyTwoButtonsFrom ?? [])]);
}

function isDirectionOnlyStep(step: CompiledTrialMoveStep): boolean {
  return step.expect.direction !== undefined && !step.expect.motion && !hasButtonExpectation(step);
}

function resolveTimeoutFrames(trial: CompiledTrial): number {
  return trial.rules?.stepper?.timeoutFramesDefault ?? DEFAULT_TIMEOUT_FRAMES;
}

export class StepperEngine implements TrialEngine {
  private readonly trial: CompiledTrial;
  private readonly directionMode: DirectionMode;
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

  public constructor(trial: CompiledTrial, directionMode: DirectionMode = "normal") {
    this.trial = trial;
    this.directionMode = directionMode;
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

  private currentStep(): CompiledTrialStep | null {
    return this.trial.steps[this.currentStepIndex] ?? null;
  }

  private configureStepEntry(step: CompiledTrialStep, previousStep: CompiledTrialStep | null): void {
    if (step.kind !== "move" || previousStep?.kind !== "move") {
      this.releaseGateSatisfied = true;
      this.neutralObservedSinceStepStart = false;
      return;
    }

    const requireReleaseBeforeReuse =
      this.trial.rules?.stepper?.requireReleaseBeforeReuseDefault ?? true;

    if (!requireReleaseBeforeReuse || !hasButtonExpectation(step)) {
      this.releaseGateSatisfied = true;
      this.neutralObservedSinceStepStart = false;
      return;
    }

    const stepButtons = expectedButtons(step);
    const previousButtons = expectedButtons(previousStep);
    const overlaps = Array.from(stepButtons).some((button) => previousButtons.has(button));
    this.releaseGateSatisfied = !overlaps;
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

    if (step.kind === "delay") {
      const target = this.stepStartFrame + step.frames;
      return {
        openFrame: target,
        closeFrame: target,
      };
    }

    const timeoutFrames = resolveTimeoutFrames(this.trial);
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

  private markMatched(step: CompiledTrialStep, inputFrame: number, notes: string[] = ["matched"]): void {
    const assessment = this.assessments[this.currentStepIndex];
    assessment.result = "matched";
    assessment.actualFrame = inputFrame;
    assessment.deltaFrames = null;
    assessment.attempts += 1;
    assessment.notes = notes;

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

    const previous = step;
    this.currentStepIndex += 1;
    const nextStep = this.currentStep();
    this.stepStartFrame = this.currentFrame;
    if (nextStep) {
      this.configureStepEntry(nextStep, previous);
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

  private handleDelayStep(step: Extract<CompiledTrialStep, { kind: "delay" }>, frame: InputFrame): TrialEngineSnapshot {
    if (this.stepStartFrame === null) {
      this.stepStartFrame = frame.frame;
    }

    const targetFrame = this.stepStartFrame + step.frames;
    if (frame.frame < targetFrame) {
      return this.snapshot();
    }

    this.markMatched(step, targetFrame, ["delay_elapsed"]);
    this.completeIfFinished(frame.frame);
    return this.snapshot();
  }

  private handleMoveStep(step: CompiledTrialMoveStep, frame: InputFrame): TrialEngineSnapshot {
    const requireNeutralBeforeStep =
      this.trial.rules?.stepper?.requireNeutralBeforeStepDefault ?? false;
    if (isNeutralInput(frame)) {
      this.neutralObservedSinceStepStart = true;
    }

    const timeoutFrames = resolveTimeoutFrames(this.trial);
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

    const requirePressed = this.trial.rules?.stepper?.requirePressedDefault ?? true;
    if (requirePressed && hasButtonExpectation(step) && frame.pressed.length === 0) {
      return this.snapshot();
    }

    const requireReleaseBeforeReuse =
      this.trial.rules?.stepper?.requireReleaseBeforeReuseDefault ?? true;
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

  public advance(frame: InputFrame): TrialEngineSnapshot {
    const normalizedFrame = applyDirectionModeToInputFrame(frame, this.directionMode);
    this.currentFrame = normalizedFrame.frame;

    this.history.push(normalizedFrame);
    if (this.history.length > HISTORY_LIMIT_FRAMES) {
      this.history.splice(0, this.history.length - HISTORY_LIMIT_FRAMES);
    }

    if (this.status !== "running") {
      return this.snapshot();
    }

    if (this.startFrame === null) {
      if (!shouldStartTrial(this.trial.steps[0], normalizedFrame)) {
        return this.snapshot();
      }

      this.startFrame = normalizedFrame.frame;
      this.stepStartFrame = normalizedFrame.frame;
      const firstStep = this.currentStep();
      if (firstStep) {
        this.configureStepEntry(firstStep, null);
      }
    }

    const step = this.currentStep();
    if (!step) {
      this.completeIfFinished(normalizedFrame.frame);
      return this.snapshot();
    }

    if (step.kind === "delay") {
      return this.handleDelayStep(step, normalizedFrame);
    }

    return this.handleMoveStep(step, normalizedFrame);
  }
}
