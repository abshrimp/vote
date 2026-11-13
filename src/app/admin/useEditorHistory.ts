"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type History<T> = { past: T[]; present: T; future: T[]; resetKey: number };
const MAX_HISTORY = 80;

/**
 * Snapshot-based editor history. Multiple React state setters made by one
 * user action appear as a single render and therefore one undo step.
 * The caller owns the snapshot: no server data is written until Save.
 */
export function useEditorHistory<T>(value: T, restore: (value: T) => void,
  enabled: boolean, resetKey = 0) {
  const history = useRef<History<T> | null>(null);
  const [version, setVersion] = useState(0);
  const serialized = JSON.stringify(value);
  const lastSerialized = useRef<string | null>(null);
  const restoreRef = useRef(restore);
  restoreRef.current = restore;

  useEffect(() => {
    if (!enabled) {
      history.current = null;
      lastSerialized.current = null;
      return;
    }
    if (!history.current || history.current.resetKey !== resetKey) {
      history.current = { past: [], present: structuredClone(value), future: [], resetKey };
      lastSerialized.current = serialized;
      setVersion(v => v + 1);
      return;
    }
    if (lastSerialized.current === serialized) return;
    const current = history.current;
    current.past.push(current.present);
    if (current.past.length > MAX_HISTORY) current.past.shift();
    current.present = structuredClone(value);
    current.future = [];
    lastSerialized.current = serialized;
    setVersion(v => v + 1);
  }, [enabled, resetKey, serialized]); // eslint-disable-line react-hooks/exhaustive-deps

  const undo = useCallback(() => {
    const current = history.current;
    if (!current?.past.length) return;
    current.future.push(current.present);
    current.present = current.past.pop()!;
    lastSerialized.current = JSON.stringify(current.present);
    restoreRef.current(structuredClone(current.present));
    setVersion(v => v + 1);
  }, []);

  const redo = useCallback(() => {
    const current = history.current;
    if (!current?.future.length) return;
    current.past.push(current.present);
    current.present = current.future.pop()!;
    lastSerialized.current = JSON.stringify(current.present);
    restoreRef.current(structuredClone(current.present));
    setVersion(v => v + 1);
  }, []);

  void version;
  return {
    undo, redo,
    canUndo: Boolean(history.current?.past.length),
    canRedo: Boolean(history.current?.future.length),
  };
}
