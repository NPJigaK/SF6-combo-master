import { useSyncExternalStore } from "react";

type SetStateInternal<TState extends object> = (
  partial: Partial<TState> | TState | ((state: TState) => Partial<TState> | TState),
  replace?: boolean,
) => void;

type StateCreator<TState extends object> = (set: SetStateInternal<TState>, get: () => TState) => TState;

type StoreHook<TState extends object> = {
  <TSelected>(selector: (state: TState) => TSelected): TSelected;
  getState: () => TState;
  setState: SetStateInternal<TState>;
  subscribe: (listener: () => void) => () => void;
};

export function createStore<TState extends object>(initializer: StateCreator<TState>): StoreHook<TState> {
  const listeners = new Set<() => void>();
  let state: TState;

  const getState = () => state;

  const setState: SetStateInternal<TState> = (partial, replace = false) => {
    const nextState = typeof partial === "function" ? partial(state) : partial;
    if (Object.is(nextState, state)) {
      return;
    }
    const mergedState =
      replace || typeof nextState !== "object" || nextState === null
        ? (nextState as TState)
        : { ...state, ...(nextState as Partial<TState>) };
    if (Object.is(mergedState, state)) {
      return;
    }
    state = mergedState;
    for (const listener of listeners) {
      listener();
    }
  };

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  state = initializer(setState, getState);

  const useStore = <TSelected,>(selector: (currentState: TState) => TSelected): TSelected =>
    useSyncExternalStore(
      subscribe,
      () => selector(state),
      () => selector(state),
    );

  return Object.assign(useStore, {
    getState,
    setState,
    subscribe,
  });
}
