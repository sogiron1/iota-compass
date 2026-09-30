'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Debounced server-side draft autosave for one draft key at a time.
 * Callers must `await flush()` before switching keys or leaving the screen.
 * Never logs or sends text anywhere except our own /api/drafts.
 */
export function useAutosave(key: string, value: string, enabled: boolean) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const lastKey = useRef<string | null>(null);
  const lastSaved = useRef<string>('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ key, value });
  latest.current = { key, value };

  const save = useCallback(async (k: string, v: string) => {
    setStatus('saving');
    try {
      await api('/api/drafts', { method: 'PUT', body: { key: k, answer: v } });
      if (latest.current.key === k) lastSaved.current = v;
      setStatus('saved');
    } catch {
      setStatus('error');
      throw new Error('save_failed');
    }
  }, []);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const { key: k, value: v } = latest.current;
    if (!enabled || v === lastSaved.current) return;
    await save(k, v);
  }, [enabled, save]);

  useEffect(() => {
    if (!enabled) return;
    if (lastKey.current !== key) {
      // New key: its loaded value is already saved on the server.
      lastKey.current = key;
      lastSaved.current = value;
      setStatus('idle');
      return;
    }
    if (value === lastSaved.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void save(key, value).catch(() => {});
    }, 800);
  }, [key, value, enabled, save]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { status, flush };
}
