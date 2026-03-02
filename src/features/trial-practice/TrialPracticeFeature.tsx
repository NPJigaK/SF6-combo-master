import { useEffect, useMemo, useState } from "react";
import { TrialRunnerPanel } from "../../components/TrialRunnerPanel";
import type { CompiledTrial } from "../../domain/trial/compiled";
import { compileTrial, type MasterMoveData } from "../../domain/trial/compiler";
import { calculateTrialBaseDamage } from "../../domain/trial/damage";
import type { ComboTrial } from "../../domain/trial/schema";

type MasterDataFile = {
  moves?: MasterMoveData[];
};

type TrialOption = {
  id: string;
  label: string;
  damage: number | null;
  trial: CompiledTrial;
};

function parseCharacterIdFromMasterPath(path: string): string | null {
  const match = path.match(/\/data\/([^/]+)\/moves\.master\.json$/);
  return match?.[1] ?? null;
}

function parseCharacterIdFromTrialPath(path: string): string | null {
  const match = path.match(/\/data\/trials\/([^/]+)\/[^/]+\.combo-trial\.json$/);
  return match?.[1] ?? null;
}

const masterModules = import.meta.glob("../../../data/*/moves.master.json", {
  eager: true,
  import: "default",
}) as Record<string, MasterDataFile>;

const trialModules = import.meta.glob("../../../data/trials/*/*.combo-trial.json", {
  eager: true,
  import: "default",
}) as Record<string, ComboTrial>;

const masterMovesByCharacter = new Map<string, MasterMoveData[]>();
for (const [path, rawMaster] of Object.entries(masterModules)) {
  const characterId = parseCharacterIdFromMasterPath(path);
  if (!characterId) {
    continue;
  }

  masterMovesByCharacter.set(characterId, rawMaster.moves ?? []);
}

const rawTrialsByCharacter = new Map<string, ComboTrial[]>();
for (const [path, trial] of Object.entries(trialModules).sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath))) {
  const characterId = parseCharacterIdFromTrialPath(path);
  if (!characterId) {
    continue;
  }

  const current = rawTrialsByCharacter.get(characterId) ?? [];
  current.push(trial);
  rawTrialsByCharacter.set(characterId, current);
}

const trialOptionsByCharacter = new Map<string, TrialOption[]>();
for (const [characterId, trials] of rawTrialsByCharacter.entries()) {
  const masterMoves = masterMovesByCharacter.get(characterId) ?? [];
  const options = trials.map((trial) => {
    const compiled = compileTrial(trial, { masterMoves });
    const damage = calculateTrialBaseDamage(trial, masterMoves);
    return {
      id: compiled.id,
      label: damage === null ? `${compiled.name} (DMG ?)` : `${compiled.name} (DMG ${damage.toLocaleString()})`,
      damage,
      trial: compiled,
    };
  });

  trialOptionsByCharacter.set(characterId, options);
}

export function TrialPracticeFeature({ characterId }: { characterId: string }) {
  const trialOptions = useMemo(() => {
    return trialOptionsByCharacter.get(characterId) ?? [];
  }, [characterId]);
  const [selectedTrialId, setSelectedTrialId] = useState<string>("");

  useEffect(() => {
    setSelectedTrialId((current) => {
      if (trialOptions.some((option) => option.id === current)) {
        return current;
      }
      return trialOptions[0]?.id ?? "";
    });
  }, [trialOptions]);

  const selectedTrial = useMemo(() => {
    return trialOptions.find((option) => option.id === selectedTrialId)?.trial ?? trialOptions[0]?.trial ?? null;
  }, [selectedTrialId, trialOptions]);
  const selectedDamage = useMemo(() => {
    return trialOptions.find((option) => option.id === selectedTrialId)?.damage ?? trialOptions[0]?.damage ?? null;
  }, [selectedTrialId, trialOptions]);

  return (
    <>
      <section className="controls">
        <label className="control grow">
          <span>Combo Trial</span>
          <select
            value={selectedTrialId}
            onChange={(event) => setSelectedTrialId(event.currentTarget.value)}
            disabled={trialOptions.length === 0}
          >
            {trialOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </section>
      <p className="provider-line">
        {selectedDamage === null ? "Estimated base damage: unavailable" : `Estimated base damage: ${selectedDamage}`}
      </p>

      {selectedTrial ? (
        <TrialRunnerPanel trial={selectedTrial} />
      ) : (
        <p className="empty">{`No combo trial found for ${characterId.toUpperCase()}.`}</p>
      )}
    </>
  );
}
