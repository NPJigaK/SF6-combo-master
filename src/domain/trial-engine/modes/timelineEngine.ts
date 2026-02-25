import type { InputFrame } from "../../input/types";
import type { ComboTrial } from "../../trial/schema";
import {
  resolveStepInputEvent,
  shouldStartTrial,
} from "../core/inputMatcher";
import {
  buildSnapshot,
  createInitialAssessments,
  pushEvent,
} from "../core/runtimeState";
import { resolveTimelineMissFrame, resolveTimelineTargetFrame } from "../core/stepWindow";
import type { ModeEvent, StepAssessment, TrialEngine, TrialEngineSnapshot, TrialEngineStatus } from "../core/types";

const HISTORY_LIMIT_FRAMES = 240;
const DEFAULT_TOLERANCE_FRAMES = 2;
const DEFAULT_MISS_AFTER_FRAMES = 45;

export class TimelineEngine implements TrialEngine {
  private readonly trial: ComboTrial;
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

  public constructor(trial: ComboTrial) {
    this.trial = trial;
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

  private getCurrentTargetFrames(): { targetFrame: number | null; missFrame: number | null; toleranceFrames: number } {
    if (this.startFrame === null) {
      return {
        targetFrame: null,
        missFrame: null,
        toleranceFrames: this.trial.rules?.timeline?.defaultToleranceFrames ?? DEFAULT_TOLERANCE_FRAMES,
      };
    }

    const step = this.trial.steps[this.currentStepIndex];
    if (!step) {
      return {
        targetFrame: null,
        missFrame: null,
        toleranceFrames: this.trial.rules?.timeline?.defaultToleranceFrames ?? DEFAULT_TOLERANCE_FRAMES,
      };
    }

    const targetFrame = resolveTimelineTargetFrame(step, this.currentStepIndex, this.startFrame, this.previousResolvedFrame);
    const toleranceFrames = step.timeline?.toleranceFrames ?? this.trial.rules?.timeline?.defaultToleranceFrames ?? DEFAULT_TOLERANCE_FRAMES;
    const defaultMissAfterFrames = this.trial.rules?.timeline?.defaultMissAfterFrames ?? DEFAULT_MISS_AFTER_FRAMES;
    const missFrame = resolveTimelineMissFrame(step, targetFrame, defaultMissAfterFrames);

    return {
      targetFrame,
      missFrame,
      toleranceFrames,
    };
  }

  private markMatched(stepIndex: number, targetFrame: number, inputFrame: number, toleranceFrames: number): void {
    const step = this.trial.steps[stepIndex];
    const delta = inputFrame - targetFrame;
    const withinTolerance = Math.abs(delta) <= toleranceFrames;
    const assessment = this.assessments[stepIndex];

    assessment.result = "matched";
    assessment.targetFrame = targetFrame;
    assessment.actualFrame = inputFrame;
    assessment.deltaFrames = delta;
    assessment.attempts += 1;
    assessment.notes = [withinTolerance ? "within_tolerance" : "outside_tolerance"];

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
      message: withinTolerance
        ? `Step ${step?.id ?? stepIndex + 1} matched at ${inputFrame}F (delta ${delta >= 0 ? "+" : ""}${delta}F).`
        : `Step ${step?.id ?? stepIndex + 1} matched out of tolerance at ${inputFrame}F (delta ${delta >= 0 ? "+" : ""}${delta}F).`,
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

    // When a step is missed, continue timeline progression from the miss boundary
    // so the next step can still be attempted instead of immediately cascading misses.
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
    const { targetFrame, toleranceFrames } = this.getCurrentTargetFrames();
    const openFrame = targetFrame === null ? null : targetFrame - toleranceFrames;
    const closeFrame = targetFrame === null ? null : targetFrame + toleranceFrames;

    return buildSnapshot({
      mode: "timeline",
      status: this.status,
      currentStepIndex: this.currentStepIndex,
      currentFrame: this.currentFrame,
      currentWindowOpenFrame: openFrame,
      currentWindowCloseFrame: closeFrame,
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
    }

    const step = this.trial.steps[this.currentStepIndex];
    if (!step) {
      this.completeIfFinished(frame.frame);
      return this.snapshot();
    }

    const { targetFrame, missFrame, toleranceFrames } = this.getCurrentTargetFrames();
    if (targetFrame === null || missFrame === null) {
      return this.snapshot();
    }

    const match = resolveStepInputEvent(step, this.history, frame);
    if (match) {
      const lastInputFrame = this.lastResolvedInputFrameByStep.get(this.currentStepIndex);
      if (lastInputFrame === undefined || match.inputFrame > lastInputFrame) {
        this.lastResolvedInputFrameByStep.set(this.currentStepIndex, match.inputFrame);
        this.markMatched(this.currentStepIndex, targetFrame, match.inputFrame, toleranceFrames);
        this.currentStepIndex += 1;
        this.completeIfFinished(frame.frame);
        return this.snapshot();
      }
    }

    if (frame.frame > missFrame) {
      this.markMissed(this.currentStepIndex, targetFrame, missFrame);
      this.currentStepIndex += 1;
      this.completeIfFinished(frame.frame);
    }

    return this.snapshot();
  }
}
