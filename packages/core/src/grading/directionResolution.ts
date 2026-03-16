export const resolvedDirections = [
  "neutral",
  "up",
  "down",
  "back",
  "forward",
  "up_back",
  "up_forward",
  "down_back",
  "down_forward",
] as const;

export type ResolvedDirection = (typeof resolvedDirections)[number];

export interface DirectionalInput {
  resolvedDirection?: ResolvedDirection;
  up?: boolean;
  down?: boolean;
  back?: boolean;
  forward?: boolean;
}

export function resolveDirectionState(input: DirectionalInput): ResolvedDirection {
  if (input.resolvedDirection) {
    return input.resolvedDirection;
  }

  const vertical = input.up === input.down ? "neutral" : input.up ? "up" : input.down ? "down" : "neutral";
  const horizontal =
    input.back === input.forward
      ? "neutral"
      : input.back
        ? "back"
        : input.forward
          ? "forward"
          : "neutral";

  if (vertical === "neutral" && horizontal === "neutral") {
    return "neutral";
  }

  if (vertical === "neutral") {
    return horizontal;
  }

  if (horizontal === "neutral") {
    return vertical;
  }

  return `${vertical}_${horizontal}` as ResolvedDirection;
}
