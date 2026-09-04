import { useSyncExternalStore } from 'react';

/**
 * A global "something changed" counter.
 *
 * The old app re-ran the whole route after any mutation (go(S.route)). Screens
 * here subscribe to this instead, so adding a payment inside a modal refreshes
 * the list behind it without either knowing about the other.
 */
let version = 0;
const listeners = new Set<() => void>();

export const bumpData = () => { version++; listeners.forEach((l) => l()); };

const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const snapshot = () => version;

export const useDataVersion = () => useSyncExternalStore(subscribe, snapshot, snapshot);
