import type { InputFrame } from "../../input/types";
import { applyDirectionModeToInputFrame, type DirectionMode } from "../../input/direction";
import type { CompiledTrial, CompiledTrialMoveStep } from "../../trial/compiled";
import { resolveStepInputEvent, shouldStartTrial } from "../core/inputMatcher";
import { buildSnapshot, createInitialAssessments, pushEvent } from "../core/runtimeState";
import type { ModeEvent, StepAssessment, TrialEngine, TrialEngineSnapshot, TrialEngineStatus } from "../core/types";

const HISTORY_LIMIT_FRAMES = 240;

type CurrentWindow = {
  targetFrame: number | null;
  openFrame: number | null;
  closeFrame: number | null;
  isFirstMoveWithoutWindow: boolean;
};

export class TimelineEngine implements TrialEngine {
  private readonly trial: CompiledTrial;
  private readonly directionMode: DirectionMode;
  private history: InputFrame[] = [];
  private startFrame: number | null = null;
  private currentStepIndex = 0;
  private currentFrame: number | null = null;
  private status: TrialEngineStatus = "running";
  private lastMatchedFrame: number | null = null;
  private lastMatchedInputFrame: number | null = null;
  private lastMatchedCommitFrame: number | null = null;
  private previousResolvedFrame: number | null = null;
  private readonly assessments: StepAssessment[];
  private readonly events: ModeEvent[] = [];
  private readonly lastResolvedInputFrameByStep = new Map<number, number>();

  public constructor(trial: CompiledTrial, directionMode: DirectionMode = "normal") {
    this.trial = trial;
    this.directionMode = directionMode;
    this.assessments = createInitialAssessments(trial);
  }

  public reset(): void {
    this.history = [];
    this.startFrame = null;
    this.currentStepIndex = 0;
    this.currentFrame = null;
    this.status = "running";
    this.lastMatchedFrame = null;
    this.lastMatchedInputFrame = null;
    this.lastMatchedCommitFrame = null;
    this.previousResolvedFrame = null;
    this.lastResolvedInputFrameByStep.clear();

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

  private getStepBaseFrame(stepIndex: number): number | null {
    if (this.startFrame === null) {
      return null;
    }

    if (stepIndex === 0) {
      return this.startFrame;
    }

    return this.previousResolvedFrame ?? this.startFrame;
  }

  private getCurrentWindow(): CurrentWindow {
    const step = this.trial.steps[this.currentStepIndex];
    if (!step) {
      return {
        targetFrame: null,
        openFrame: null,
        closeFrame: null,
        isFirstMoveWithoutWindow: false,
      };
    }

    const baseFrame = this.getStepBaseFrame(this.currentStepIndex);
    if (baseFrame === null) {
      return {
        targetFrame: null,
        openFrame: null,
        closeFrame: null,
        isFirstMoveWithoutWindow: false,
      };
    }

    if (step.kind === "delay") {
      const target = baseFrame + step.frames;
      return {
        targetFrame: target,
        openFrame: target,
        closeFrame: target,
        isFirstMoveWithoutWindow: false,
      };
    }

    if (this.currentStepIndex === 0 || !step.windowFromPrev) {
      return {
        targetFrame: null,
        openFrame: null,
        closeFrame: null,
        isFirstMoveWithoutWindow: true,
      };
    }

    const open = baseFrame + step.windowFromPrev.minAfterPrevFrames;
    const close = baseFrame + step.windowFromPrev.maxAfterPrevFrames;
    return {
      targetFrame: open,
      openFrame: open,
      closeFrame: close,
      isFirstMoveWithoutWindow: false,
    };
  }

  private markMatched(stepIndex: number, targetFrame: number | null, inputFrame: number): void {
    const step = this.trial.steps[stepIndex];
    const assessment = this.assessments[stepIndex];

    const delta = targetFrame === null ? 0 : inputFrame - targetFrame;
    assessment.result = "matched";
    assessment.targetFrame = targetFrame ?? inputFrame;
    assessment.actualFrame = inputFrame;
    assessment.deltaFrames = delta;
    assessment.attempts += 1;
    assessment.notes = targetFrame === null ? ["matched"] : ["within_window"];

    this.lastMatchedFrame = inputFrame;
    this.lastMatchedInputFrame = inputFrame;
    this.lastMatchedCommitFrame = inputFrame;
    this.previousResolvedFrame = inputFrame;

    pushEvent(this.events, {
      type: "step_matched",
      mode: "timeline",
      frame: inputFrame,
      stepIndex,
      stepId: step?.id ?? null,
      message: `Step ${step?.id ?? stepIndex + 1} matched at ${inputFrame}F.`,
    });
  }

  private markMissed(stepIndex: number, targetFrame: number, missFrame: number): void {
    const step = this.trial.steps[stepIndex];
    const assessment = this.assessments[stepIndex];

    assessment.result = "missed";
    assessment.targetFrame = targetFrame;
    assessment.actualFrame = null;
    assessment.deltaFrames = null;
    assessment.attempts += 1;
    assessment.notes = ["timed_out"];

    this.previousResolvedFrame = missFrame;

    pushEvent(this.events, {
      type: "step_missed",
      mode: "timeline",
      frame: missFrame,
      stepIndex,
      stepId: step?.id ?? null,
      message: `Step ${step?.id ?? stepIndex + 1} missed at ${missFrame}F (target ${targetFrame}F).`,
    });
  }

  private completeIfFinished(frame: number): void {
    if (this.currentStepIndex < this.trial.steps.length) {
      return;
    }

    if (this.status !== "success") {
      this.status = "success";
      pushEvent(this.events, {
        type: "success",
        mode: "timeline",
        frame,
        stepIndex: null,
        stepId: null,
        message: `Timeline completed at ${frame}F.`,
      });
    }
  }

  private snapshot(): TrialEngineSnapshot {
    const window = this.getCurrentWindow();
    return buildSnapshot({
      mode: "timeline",
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

  private handleDelayStep(frame: InputFrame, window: CurrentWindow): TrialEngineSnapshot {
    const target = window.targetFrame;
    if (target === null) {
      return this.snapshot();
    }

    if (frame.frame < target) {
      return this.snapshot();
    }

    this.markMatched(this.currentStepIndex, target, target);
    this.currentStepIndex += 1;
    this.completeIfFinished(frame.frame);
    return this.snapshot();
  }

  private handleMoveStep(frame: InputFrame, step: CompiledTrialMoveStep, window: CurrentWindow): TrialEngineSnapshot {
    const match = resolveStepInputEvent(step, this.history, frame);
    if (match) {
      const lastInputFrame = this.lastResolvedInputFrameByStep.get(this.currentStepIndex);
      if (lastInputFrame === undefined || match.inputFrame > lastInputFrame) {
        if (window.isFirstMoveWithoutWindow) {
          this.lastResolvedInputFrameByStep.set(this.currentStepIndex, match.inputFrame);
          this.markMatched(this.currentStepIndex, null, match.inputFrame);
          this.currentStepIndex += 1;
          this.completeIfFinished(frame.frame);
          return this.snapshot();
        }

        const open = window.openFrame;
        const close = window.closeFrame;
        if (open !== null && close !== null && match.inputFrame >= open && match.inputFrame <= close) {
          this.lastResolvedInputFrameByStep.set(this.currentStepIndex, match.inputFrame);
          this.markMatched(this.currentStepIndex, window.targetFrame, match.inputFrame);
          this.currentStepIndex += 1;
          this.completeIfFinished(frame.frame);
          return this.snapshot();
        }
      }
    }

    if (!window.isFirstMoveWithoutWindow && window.closeFrame !== null && frame.frame > window.closeFrame) {
      this.markMissed(this.currentStepIndex, window.targetFrame ?? window.closeFrame, window.closeFrame);
      this.currentStepIndex += 1;
      this.completeIfFinished(frame.frame);
    }

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
    }

    const step = this.trial.steps[this.currentStepIndex];
    if (!step) {
      this.completeIfFinished(normalizedFrame.frame);
      return this.snapshot();
    }

    const window = this.getCurrentWindow();
    if (step.kind === "delay") {
      return this.handleDelayStep(normalizedFrame, window);
    }

    return this.handleMoveStep(normalizedFrame, step, window);
  }
}
