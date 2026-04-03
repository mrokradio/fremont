import { useEffect, useState } from 'react';

const hasWindow = typeof window !== 'undefined';

export const safeLocalGet = <T,>(key: string, fallback: T): T => {
  if (!hasWindow) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export const safeLocalSet = (key: string, value: unknown) => {
  if (!hasWindow) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

export const safeLocalRemove = (key: string) => {
  if (!hasWindow) return;
  try {
    window.localStorage.removeItem(key);
  } catch {}
};

// Persist React state into localStorage with SSR safety.
export function useLocalState<T>(key: string, fallback: T) {
  const [state, setState] = useState<T>(() => safeLocalGet<T>(key, fallback));

  useEffect(() => {
    safeLocalSet(key, state);
  }, [key, state]);

  return [state, setState] as const;
}
