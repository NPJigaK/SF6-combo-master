import { useEffect, useMemo, useState } from "react";
import {
  buildComboTrial,
  createTrialIdFromName,
  DEFAULT_FOLLOWUP_CONNECT,
  type TrialBuilderMoveStepInput,
} from "../../domain/trial/builder";
import { type ComboCandidateAssessment, type ComboCandidateMove } from "../../domain/combo/candidateAssessment";
import {
  pickSuggestedComboCandidateMove,
  rankComboCandidateMoves,
  type RankedComboCandidateMove,
} from "../../domain/combo/candidateRanking";
import type { OfficialFrameColumns } from "../../domain/combo/frameNormalization";
import { resolveMoveDisplayName, type MasterMoveData } from "../../domain/trial/compiler";
import type { TrialCancelKind, TrialConnectType, TrialMode } from "../../domain/trial/schema";

type MasterDataFile = {
  moves?: MasterMoveData[];
};

type MoveOption = {
  moveId: string;
  label: string;
};

type BuilderMasterMove = MasterMoveData & {
  official?: MasterMoveData["official"] & {
    columns?: OfficialFrameColumns | null;
  };
  supercomboExtras?: ComboCandidateMove["supercomboExtras"];
};

type BuilderMoveStepDraft = {
  move: string;
  connect: TrialConnectType;
  cancelKind: TrialCancelKind;
  label: string;
  windowMin: string;
  windowMax: string;
};

type StepCandidateAnalysis = {
  selectedAssessment: ComboCandidateAssessment | null;
  orderedMoveIds: readonly string[];
  suggestedMoveIds: readonly string[];
  connectableCount: number;
  unknownCount: number;
  falseCount: number;
  confidenceByMoveId: ReadonlyMap<string, ComboCandidateAssessment>;
};

const CONNECT_OPTIONS: readonly TrialConnectType[] = ["link", "cancel", "chain", "target"];
const CANCEL_KIND_OPTIONS: readonly TrialCancelKind[] = ["special", "super", "dr"];
const MODE_OPTIONS: readonly TrialMode[] = ["timeline", "stepper"];

function parseCharacterIdFromMasterPath(path: string): string | null {
  const match = path.match(/\/data\/([^/]+)\/moves\.master\.json$/);
  return match?.[1] ?? null;
}

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  return Number(trimmed);
}

function createDefaultStep(moveId: string): BuilderMoveStepDraft {
  return {
    move: moveId,
    connect: DEFAULT_FOLLOWUP_CONNECT,
    cancelKind: "special",
    label: "",
    windowMin: "",
    windowMax: "",
  };
}

const masterModules = import.meta.glob("../../../data/*/moves.master.json", {
  eager: true,
  import: "default",
}) as Record<string, MasterDataFile>;

const moveOptionsByCharacter = new Map<string, MoveOption[]>();
const moveMapByCharacter = new Map<string, Map<string, ComboCandidateMove>>();
for (const [path, rawMaster] of Object.entries(masterModules)) {
  const characterId = parseCharacterIdFromMasterPath(path);
  if (!characterId) {
    continue;
  }

  const masterMoves = (rawMaster.moves ?? []) as BuilderMasterMove[];
  const options = masterMoves.map((move) => {
    const displayName = resolveMoveDisplayName(move);
    return {
      moveId: move.moveId,
      label: displayName ? `${displayName} (${move.moveId})` : move.moveId,
    };
  });
  const moveMap = new Map<string, ComboCandidateMove>();
  for (const move of masterMoves) {
    moveMap.set(move.moveId, {
      moveId: move.moveId,
      official: {
        moveName: move.official?.moveName,
        columns: move.official?.columns ?? null,
      },
      supercomboExtras: move.supercomboExtras ?? null,
    });
  }

  options.sort((left, right) => left.label.localeCompare(right.label));
  moveOptionsByCharacter.set(characterId, options);
  moveMapByCharacter.set(characterId, moveMap);
}

function buildAssessmentTooltip(assessment: ComboCandidateAssessment): string {
  const lines = [
    `connect=${assessment.connect}`,
    `result=${assessment.result}`,
    `confidence=${assessment.confidence}`,
  ];

  if (assessment.unknownReason) {
    lines.push(`reason=${assessment.unknownReason}`);
  }

  if (assessment.sources.length > 0) {
    lines.push(`sources=${assessment.sources.join(", ")}`);
  }

  return lines.join("\n");
}

function moveAssessmentBadgeLabel(assessment: ComboCandidateAssessment): string {
  if (assessment.result === true) {
    return assessment.confidence === "candidate" ? "~" : "✓";
  }
  if (assessment.result === "unknown") {
    return "?";
  }
  return "×";
}

function rankForSuggestions(rankedCandidates: readonly RankedComboCandidateMove[]): readonly string[] {
  const connectable = rankedCandidates.filter((candidate) => candidate.assessment.result === true);
  const unknown = rankedCandidates.filter((candidate) => candidate.assessment.result === "unknown");
  if (connectable.length > 0) {
    return [...connectable, ...unknown].slice(0, 8).map((candidate) => candidate.move.moveId);
  }
  return unknown.slice(0, 8).map((candidate) => candidate.move.moveId);
}

export function ComboBuilderFeature({ characterId }: { characterId: string }) {
  const moveOptions = useMemo(() => {
    return moveOptionsByCharacter.get(characterId) ?? [];
  }, [characterId]);
  const moveMap = useMemo(() => {
    return moveMapByCharacter.get(characterId) ?? new Map<string, ComboCandidateMove>();
  }, [characterId]);
  const moveOptionById = useMemo(() => {
    return new Map(moveOptions.map((option) => [option.moveId, option] as const));
  }, [moveOptions]);
  const candidateMoves = useMemo(() => {
    return moveOptions
      .map((option) => moveMap.get(option.moveId))
      .filter((move): move is ComboCandidateMove => Boolean(move));
  }, [moveMap, moveOptions]);
  const [trialName, setTrialName] = useState<string>("New Combo Trial");
  const [trialIdInput, setTrialIdInput] = useState<string>("");
  const [notesText, setNotesText] = useState<string>("");
  const [defaultMode, setDefaultMode] = useState<TrialMode>("timeline");
  const [allowModeOverride, setAllowModeOverride] = useState<boolean>(true);
  const [steps, setSteps] = useState<BuilderMoveStepDraft[]>([]);
  const [copyStatus, setCopyStatus] = useState<string>("");

  useEffect(() => {
    setSteps((current) => {
      if (moveOptions.length === 0) {
        return [];
      }

      if (current.length === 0) {
        return [createDefaultStep(moveOptions[0].moveId)];
      }

      const allowedMoveIds = new Set(moveOptions.map((option) => option.moveId));
      let changed = false;
      const next = current.map((step) => {
        if (allowedMoveIds.has(step.move)) {
          return step;
        }
        changed = true;
        return {
          ...step,
          move: moveOptions[0].moveId,
        };
      });

      return changed ? next : current;
    });
  }, [moveOptions]);

  const suggestedTrialId = useMemo(() => createTrialIdFromName(trialName), [trialName]);
  const parsedStepInputs = useMemo((): TrialBuilderMoveStepInput[] => {
    return steps.map((step, index) => ({
      move: step.move,
      connect: index === 0 ? undefined : step.connect,
      cancelKind: index === 0 || step.connect !== "cancel" ? undefined : step.cancelKind,
      label: step.label,
      windowMin: parseOptionalNumber(step.windowMin),
      windowMax: parseOptionalNumber(step.windowMax),
    }));
  }, [steps]);
  const stepAnalyses = useMemo((): (StepCandidateAnalysis | null)[] => {
    return steps.map((step, index) => {
      if (index === 0) {
        return null;
      }

      const previousMove = moveMap.get(steps[index - 1].move);
      if (!previousMove || candidateMoves.length === 0) {
        return null;
      }

      const rankedCandidates = rankComboCandidateMoves({
        connect: step.connect,
        previousMove,
        candidateMoves,
        cancelKind: step.connect === "cancel" ? step.cancelKind : undefined,
      });

      const confidenceByMoveId = new Map<string, ComboCandidateAssessment>();
      for (const candidate of rankedCandidates) {
        confidenceByMoveId.set(candidate.move.moveId, candidate.assessment);
      }

      const selectedAssessment = confidenceByMoveId.get(step.move) ?? null;
      const connectableCount = rankedCandidates.filter((candidate) => candidate.assessment.result === true).length;
      const unknownCount = rankedCandidates.filter((candidate) => candidate.assessment.result === "unknown").length;
      const falseCount = rankedCandidates.length - connectableCount - unknownCount;

      return {
        selectedAssessment,
        orderedMoveIds: rankedCandidates.map((candidate) => candidate.move.moveId),
        suggestedMoveIds: rankForSuggestions(rankedCandidates),
        connectableCount,
        unknownCount,
        falseCount,
        confidenceByMoveId,
      };
    });
  }, [candidateMoves, moveMap, steps]);

  const generated = useMemo(() => {
    if (moveOptions.length === 0) {
      return {
        trialId: trialIdInput.trim() || suggestedTrialId,
        json: "",
        error: `No move data found for ${characterId.toUpperCase()}.`,
      };
    }

    try {
      const trial = buildComboTrial({
        id: trialIdInput,
        name: trialName,
        notesText,
        steps: parsedStepInputs,
        rules: {
          defaultMode,
          allowModeOverride,
        },
      });

      return {
        trialId: trial.id,
        json: JSON.stringify(trial, null, 2),
        error: "",
      };
    } catch (error) {
      return {
        trialId: trialIdInput.trim() || suggestedTrialId,
        json: "",
        error: error instanceof Error ? error.message : "Invalid trial configuration.",
      };
    }
  }, [
    allowModeOverride,
    characterId,
    defaultMode,
    moveOptions.length,
    notesText,
    parsedStepInputs,
    suggestedTrialId,
    trialIdInput,
    trialName,
  ]);

  async function handleCopyJson(): Promise<void> {
    if (!generated.json) {
      return;
    }

    const clipboard = typeof navigator === "undefined" ? null : navigator.clipboard;
    if (!clipboard || !clipboard.writeText) {
      setCopyStatus("Clipboard API is unavailable in this environment.");
      return;
    }

    try {
      await clipboard.writeText(generated.json);
      setCopyStatus("Copied generated JSON.");
    } catch {
      setCopyStatus("Copy failed.");
    }
  }

  function updateStep(index: number, patch: Partial<BuilderMoveStepDraft>): void {
    setSteps((current) => current.map((step, stepIndex) => (stepIndex === index ? { ...step, ...patch } : step)));
  }

  function moveStep(index: number, direction: -1 | 1): void {
    setSteps((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const currentStep = next[index];
      next[index] = next[nextIndex];
      next[nextIndex] = currentStep;
      return next;
    });
  }

  function removeStep(index: number): void {
    setSteps((current) => {
      if (current.length <= 1) {
        return current;
      }
      return current.filter((_, stepIndex) => stepIndex !== index);
    });
  }

  function addStep(): void {
    const firstMoveId = moveOptions[0]?.moveId;
    if (!firstMoveId) {
      return;
    }

    setSteps((current) => {
      let suggestedMoveId = firstMoveId;
      const previousMoveId = current[current.length - 1]?.move;
      if (previousMoveId) {
        const previousMove = moveMap.get(previousMoveId);
        if (previousMove && candidateMoves.length > 0) {
          const rankedCandidates = rankComboCandidateMoves({
            connect: DEFAULT_FOLLOWUP_CONNECT,
            previousMove,
            candidateMoves,
          });
          suggestedMoveId = pickSuggestedComboCandidateMove(rankedCandidates)?.move.moveId ?? suggestedMoveId;
        }
      }

      return [...current, createDefaultStep(suggestedMoveId)];
    });
  }

  return (
    <section className="preview">
      <div className="preview-head">
        <h2>Combo Builder</h2>
        <span className="chip">{characterId.toUpperCase()}</span>
      </div>
      <p>GUI で combo-trial JSON を生成します。</p>

      <section className="builder-layout">
        <div className="builder-form">
          <div className="controls">
            <label className="control grow">
              <span>Trial Name</span>
              <input value={trialName} onChange={(event) => setTrialName(event.currentTarget.value)} />
            </label>
            <label className="control grow">
              <span>Trial ID (empty = auto)</span>
              <input
                value={trialIdInput}
                onChange={(event) => setTrialIdInput(event.currentTarget.value)}
                placeholder={suggestedTrialId}
              />
            </label>
          </div>

          <label className="control grow">
            <span>Notes (one line per note)</span>
            <textarea rows={3} value={notesText} onChange={(event) => setNotesText(event.currentTarget.value)} />
          </label>

          <div className="controls">
            <label className="control">
              <span>Default Mode</span>
              <select
                value={defaultMode}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  if (value === "timeline" || value === "stepper") {
                    setDefaultMode(value);
                  }
                }}
              >
                {MODE_OPTIONS.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </label>
            <label className="builder-allow-override">
              <input
                type="checkbox"
                checked={allowModeOverride}
                onChange={(event) => setAllowModeOverride(event.currentTarget.checked)}
              />
              <span>Allow mode override</span>
            </label>
          </div>

          <div className="builder-step-header">
            <h3>Steps</h3>
            <button type="button" onClick={addStep} disabled={moveOptions.length === 0}>
              Add Step
            </button>
          </div>

          <div className="builder-step-list">
            {steps.map((step, index) => {
              const stepAnalysis = stepAnalyses[index];
              const selectedAssessment = stepAnalysis?.selectedAssessment ?? null;
              const orderedMoveOptions = stepAnalysis
                ? stepAnalysis.orderedMoveIds
                    .map((moveId) => moveOptionById.get(moveId))
                    .filter((option): option is MoveOption => Boolean(option))
                : moveOptions;

              return (
                <article key={`step-${index}`} className="builder-step-card">
                  <div className="builder-step-card-head">
                    <div className="builder-step-meta">
                      <strong>Step {index + 1}</strong>
                      {index > 0 && selectedAssessment ? (
                        <span
                          className={`builder-step-confidence is-${selectedAssessment.confidence}`}
                          title={buildAssessmentTooltip(selectedAssessment)}
                        >
                          {selectedAssessment.confidence}
                        </span>
                      ) : null}
                    </div>
                    <div className="builder-step-actions">
                      <button type="button" onClick={() => moveStep(index, -1)} disabled={index === 0}>
                        Up
                      </button>
                      <button
                        type="button"
                        onClick={() => moveStep(index, 1)}
                        disabled={index === steps.length - 1}
                      >
                        Down
                      </button>
                      <button type="button" onClick={() => removeStep(index)} disabled={steps.length <= 1}>
                        Remove
                      </button>
                    </div>
                  </div>
                  {index > 0 && selectedAssessment ? (
                    <p className="builder-step-confidence-detail">
                      {`result=${selectedAssessment.result}${
                        selectedAssessment.unknownReason ? ` (${selectedAssessment.unknownReason})` : ""
                      }`}
                    </p>
                  ) : null}
                  {index > 0 && stepAnalysis ? (
                    <div className="builder-step-suggestions">
                      <p className="builder-step-suggestions-summary">
                        {stepAnalysis.connectableCount > 0
                          ? `Connectable ${stepAnalysis.connectableCount} / Unknown ${stepAnalysis.unknownCount} / Mismatch ${stepAnalysis.falseCount}`
                          : `No confirmed connections in current data. Unknown ${stepAnalysis.unknownCount} / Mismatch ${stepAnalysis.falseCount}`}
                      </p>
                      {stepAnalysis.suggestedMoveIds.length > 0 ? (
                        <div className="builder-step-suggestions-list">
                          {stepAnalysis.suggestedMoveIds.map((moveId) => {
                            const moveOption = moveOptionById.get(moveId);
                            if (!moveOption) {
                              return null;
                            }

                            const assessment = stepAnalysis.confidenceByMoveId.get(moveId);
                            if (!assessment) {
                              return null;
                            }

                            return (
                              <button
                                key={`${index}-${moveId}`}
                                type="button"
                                className={`builder-step-suggestion is-${assessment.confidence}${
                                  step.move === moveId ? " is-selected" : ""
                                }`}
                                onClick={() => updateStep(index, { move: moveId })}
                                title={buildAssessmentTooltip(assessment)}
                              >
                                <span className="builder-step-suggestion-badge">{moveAssessmentBadgeLabel(assessment)}</span>
                                <span className="builder-step-suggestion-label">{moveOption.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="builder-step-grid">
                    <label className="control grow">
                      <span>Move</span>
                      <select value={step.move} onChange={(event) => updateStep(index, { move: event.currentTarget.value })}>
                        {orderedMoveOptions.map((option) => {
                          const assessment = stepAnalysis?.confidenceByMoveId.get(option.moveId);
                          const prefix = assessment ? `${moveAssessmentBadgeLabel(assessment)} ` : "";
                          return (
                            <option key={option.moveId} value={option.moveId}>
                              {`${prefix}${option.label}`}
                            </option>
                          );
                        })}
                      </select>
                    </label>

                    {index > 0 ? (
                      <label className="control">
                        <span>Connect</span>
                        <select
                          value={step.connect}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            if (value === "link" || value === "cancel" || value === "chain" || value === "target") {
                              updateStep(index, { connect: value });
                            }
                          }}
                        >
                          {CONNECT_OPTIONS.map((connect) => (
                            <option key={connect} value={connect}>
                              {connect}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    {index > 0 && step.connect === "cancel" ? (
                      <label className="control">
                        <span>Cancel Kind</span>
                        <select
                          value={step.cancelKind}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            if (value === "special" || value === "super" || value === "dr") {
                              updateStep(index, { cancelKind: value });
                            }
                          }}
                        >
                          {CANCEL_KIND_OPTIONS.map((kind) => (
                            <option key={kind} value={kind}>
                              {kind}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    <label className="control">
                      <span>Label (optional)</span>
                      <input value={step.label} onChange={(event) => updateStep(index, { label: event.currentTarget.value })} />
                    </label>

                    {index > 0 ? (
                      <>
                        <label className="control">
                          <span>Window Min</span>
                          <input
                            type="number"
                            min={0}
                            value={step.windowMin}
                            onChange={(event) => updateStep(index, { windowMin: event.currentTarget.value })}
                          />
                        </label>
                        <label className="control">
                          <span>Window Max</span>
                          <input
                            type="number"
                            min={0}
                            value={step.windowMax}
                            onChange={(event) => updateStep(index, { windowMax: event.currentTarget.value })}
                          />
                        </label>
                      </>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div className="builder-preview">
          <div className="builder-preview-head">
            <h3>Generated JSON</h3>
            <button type="button" onClick={handleCopyJson} disabled={!generated.json}>
              Copy JSON
            </button>
          </div>
          <p className="builder-id-line">
            <strong>ID:</strong> <code>{generated.trialId}</code>
          </p>

          {generated.error ? (
            <p className="builder-error">{generated.error}</p>
          ) : (
            <textarea className="builder-json" readOnly rows={24} value={generated.json} />
          )}

          {copyStatus ? <p className="builder-copy-status">{copyStatus}</p> : null}
        </div>
      </section>
    </section>
  );
}
