'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, setMemoryToken } from './api';
import { useAutosave, type SaveStatus } from './useAutosave';
import {
  MAX_CHARS,
  NORTH_STAR,
  QUESTIONS,
  QUESTION_KEYS,
  SNAPSHOT_INTRO,
  charCount,
  type QuestionKey,
} from '@/lib/content';

type SyncState = 'complete' | 'partial' | 'needs_reconnect' | 'not_configured';
type Me = {
  drafts: Record<string, string>;
  baseline: { submittedAt: string; answers: Record<string, string> } | null;
  northStar: { statement: string; version: number; created_at: string } | null;
  preload: { northStar: string | null };
  sync: { snapshotSynced: boolean | null; northStarSynced: boolean | null };
};

type View =
  | { name: 'loading' }
  | { name: 'connect'; error?: string }
  | { name: 'snapshot-intro'; page: number }
  | { name: 'question'; index: number }
  | { name: 'review' }
  | { name: 'saved-exit' }
  | { name: 'ns-orient' }
  | { name: 'ns-discover' }
  | { name: 'ns-write' }
  | { name: 'ns-voice' }
  | { name: 'home' }
  | { name: 'snapshot-read' };

const inIframe = () => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

// Auto-connect: every open starts Mighty sign-in by itself, so members never
// tap Connect, and the app always shows the member who is signed in to Mighty
// right now. Mighty remembers consent, so this is a silent bounce. Guards
// against loops: never after a failed claim, never with ?manual=1 (error
// screens), and at most 2 unfinished attempts per 2 minutes per tab (a
// successful sign-in resets the count).
const AUTO_KEY = 'compass_auto_attempts';
function autoConnectAllowed(): boolean {
  if (new URLSearchParams(window.location.search).has('manual')) return false;
  try {
    const now = Date.now();
    const prev = JSON.parse(sessionStorage.getItem(AUTO_KEY) || '[]') as number[];
    const recent = prev.filter((t) => now - t < 120_000);
    if (recent.length >= 2) return false;
    sessionStorage.setItem(AUTO_KEY, JSON.stringify([...recent, now]));
  } catch {
    // Storage unavailable: the structural guards above still prevent loops.
  }
  return true;
}
function startSignIn() {
  window.location.href = inIframe() ? '/api/auth/start?mode=iframe' : '/api/auth/start?mode=redirect';
}

export default function CompassApp({ embedAuthMode }: { embedAuthMode: 'popup' | 'iframe' }) {
  const [view, setView] = useState<View>({ name: 'loading' });
  const [me, setMe] = useState<Me | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [northStarDraft, setNorthStarDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn' | 'error'; text: string } | null>(null);
  const [confirming, setConfirming] = useState<null | 'submit'>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async (): Promise<Me | null> => {
    try {
      const data = await api<Me>('/api/me');
      setMe(data);
      setAnswers(Object.fromEntries(QUESTION_KEYS.map((k) => [k, data.drafts[k] ?? ''])));
      setNorthStarDraft(data.drafts.north_star ?? data.northStar?.statement ?? data.preload.northStar ?? '');
      return data;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setView({ name: 'connect' });
        return null;
      }
      setView({ name: 'connect', error: 'We could not load your Compass. Please try again.' });
      return null;
    }
  }, []);

  const route = useCallback((data: Me) => {
    if (data.northStar) return setView({ name: 'home' });
    if (data.baseline) return setView({ name: 'ns-orient' });
    const firstEmpty = QUESTION_KEYS.findIndex((k) => !(data.drafts[k] ?? '').trim());
    const anyStarted = QUESTION_KEYS.some((k) => (data.drafts[k] ?? '').trim());
    if (!anyStarted) return setView({ name: 'snapshot-intro', page: 0 });
    if (firstEmpty === -1) return setView({ name: 'review' });
    return setView({ name: 'question', index: firstEmpty });
  }, []);

  const claim = useCallback(
    async (code: string) => {
      try {
        const r = await api<{ token: string }>('/api/session/claim', { method: 'POST', body: { code } });
        setMemoryToken(r.token);
        try {
          sessionStorage.removeItem(AUTO_KEY);
        } catch {}
        const d = await load();
        if (d) route(d);
      } catch {
        setView({ name: 'connect', error: 'We could not finish connecting to Mighty. Please tap Connect to try again.' });
      }
    },
    [load, route],
  );

  useEffect(() => {
    // In-iframe sign-in returns a one-time, 2-minute handoff code in the URL
    // fragment (never sent to servers or in Referer). Strip it immediately.
    const m = /[#&]h=([A-Za-z0-9_-]{20,128})/.exec(window.location.hash);
    if (m) {
      history.replaceState(null, '', window.location.pathname);
      void claim(m[1]);
      return;
    }
    // Fresh open: always re-verify who is signed in to Mighty (silent when the
    // member already approved IOTA Compass). No stored session is reused.
    if (embedAuthMode === 'iframe' && autoConnectAllowed()) {
      startSignIn();
      return;
    }
    setView({ name: 'connect' });
  }, [claim, embedAuthMode]);

  // Move focus to the new screen's heading for keyboard and screen-reader users.
  useEffect(() => {
    headingRef.current?.focus();
  }, [view]);

  // ---- Connect ----------------------------------------------------------
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.origin !== window.location.origin) return;
      const m = ev.data as { type?: string; code?: string };
      if (m?.type !== 'iota-compass-handoff' || typeof m.code !== 'string') return;
      void claim(m.code);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [claim]);

  function connect() {
    if (!inIframe()) {
      window.location.href = '/api/auth/start?mode=redirect';
      return;
    }
    if (embedAuthMode === 'iframe') {
      window.location.href = '/api/auth/start?mode=iframe';
      return;
    }
    const w = window.open('/api/auth/start?mode=popup', 'iota-compass-connect', 'popup,width=480,height=720');
    if (!w) {
      setView({
        name: 'connect',
        error: 'Your browser blocked the sign-in window. Use “Open IOTA Compass in a new tab” below.',
      });
    }
  }

  // ---- Snapshot ---------------------------------------------------------
  const qIndex = view.name === 'question' ? view.index : 0;
  const qKey: QuestionKey = QUESTION_KEYS[qIndex];
  const snapshotEditable = !me?.baseline;
  const qAutosave = useAutosave(qKey, answers[qKey] ?? '', view.name === 'question' && snapshotEditable);
  const nsAutosave = useAutosave('north_star', northStarDraft, view.name === 'ns-write');

  async function goQuestion(index: number) {
    try {
      await qAutosave.flush();
    } catch {
      setNotice({ kind: 'error', text: 'Your last change has not saved yet. Check your connection and try again.' });
      return;
    }
    setNotice(null);
    if (index < 0) return setView({ name: 'snapshot-intro', page: SNAPSHOT_INTRO.length - 1 });
    if (index >= QUESTION_KEYS.length) return setView({ name: 'review' });
    setView({ name: 'question', index });
  }

  async function saveAndExit() {
    try {
      await qAutosave.flush();
      await nsAutosave.flush();
      setView({ name: 'saved-exit' });
    } catch {
      setNotice({ kind: 'error', text: 'Your last change has not saved yet. Check your connection and try again.' });
    }
  }

  async function submitSnapshot() {
    setConfirming(null);
    setBusy(true);
    setNotice(null);
    try {
      const r = await api<{ sync: SyncState }>('/api/snapshot/submit', { method: 'POST' });
      const d = await load();
      reportSync(r.sync, 'Your IOTA Baseline is saved and in Mighty.');
      if (d) setView({ name: 'ns-orient' });
    } catch (e) {
      const code = e instanceof ApiError ? e.code : '';
      setNotice({
        kind: 'error',
        text: code === 'incomplete' ? 'Please answer questions 1 to 7 before submitting.' : 'We could not submit right now. Your answers are saved as drafts. Please try again.',
      });
    } finally {
      setBusy(false);
    }
  }

  function reportSync(state: SyncState, okText: string) {
    if (state === 'complete') setNotice({ kind: 'ok', text: okText });
    else if (state === 'needs_reconnect')
      setNotice({ kind: 'warn', text: 'Your answers are safely saved; we are finishing the connection to Mighty. Tap “Finish sending to Mighty” to reconnect.' });
    else setNotice({ kind: 'warn', text: 'Your answers are safely saved; we are finishing the connection to Mighty.' });
  }

  async function retrySync() {
    setBusy(true);
    try {
      const r = await api<{ sync: SyncState }>('/api/sync/retry', { method: 'POST' });
      if (r.sync === 'needs_reconnect') {
        connect();
        return;
      }
      await load();
      reportSync(r.sync, 'Everything is now in Mighty.');
    } catch {
      setNotice({ kind: 'warn', text: 'Still finishing the connection to Mighty. Your answers are safe here.' });
    } finally {
      setBusy(false);
    }
  }

  // ---- North Star -------------------------------------------------------
  async function saveNorthStar() {
    const text = northStarDraft.trim();
    if (!text || charCount(text) > MAX_CHARS) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await api<{ sync: SyncState }>('/api/north-star', { method: 'POST', body: { statement: text } });
      await load();
      reportSync(r.sync, 'Your IOTA North Star is saved and in Mighty.');
      setView({ name: 'home' });
    } catch {
      setNotice({ kind: 'error', text: 'We could not save your North Star. Your draft is kept. Please try again.' });
    } finally {
      setBusy(false);
    }
  }

  // ---- Render -----------------------------------------------------------
  const syncPending =
    me && ((me.sync.snapshotSynced === false && me.baseline) || (me.sync.northStarSynced === false && me.northStar));

  return (
    <main className="shell">
      {notice && (
        <div className={`notice notice-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
          {notice.text}
        </div>
      )}
      {syncPending && view.name === 'home' && (
        <div className="notice notice-warn" role="status">
          Your answers are safely saved; we are finishing the connection to Mighty.{' '}
          <button className="link" onClick={retrySync} disabled={busy}>
            Finish sending to Mighty
          </button>
        </div>
      )}

      {view.name === 'loading' && (
        <section className="card center" aria-busy="true">
          <p className="muted">Opening your Compass…</p>
          <p className="small muted">Connecting with your Mighty account.</p>
        </section>
      )}

      {view.name === 'connect' && (
        <section className="card">
          <p className="eyebrow">IOTA Genesis Program</p>
          <h1 className="title" ref={headingRef} tabIndex={-1}>
            IOTA Compass
          </h1>
          <p>Connect with your Mighty account to begin. You will not need a separate password.</p>
          {view.error && (
            <p className="error" role="alert">
              {view.error}
            </p>
          )}
          <div className="actions">
            <button className="primary" onClick={connect}>
              Connect with Mighty
            </button>
          </div>
          <p className="small">
            <a href="/api/auth/start?mode=redirect" target="_blank" rel="noopener">
              Open IOTA Compass in a new tab
            </a>
          </p>
        </section>
      )}

      {view.name === 'snapshot-intro' && (
        <section className="card">
          <p className="eyebrow">
            Your IOTA Baseline · {view.page + 1} of {SNAPSHOT_INTRO.length}
          </p>
          <h1 className="title" ref={headingRef} tabIndex={-1}>
            {view.page === 0 ? 'Where you are right now' : view.page === 1 ? 'Why we start here' : 'You will come back to this'}
          </h1>
          {SNAPSHOT_INTRO[view.page].map((p) => (
            <p key={p.slice(0, 24)} className={p === 'This is not optimization. It is evolution.' ? 'emphasis' : undefined}>
              {p}
            </p>
          ))}
          <div className="actions">
            {view.page > 0 && (
              <button className="secondary" onClick={() => setView({ name: 'snapshot-intro', page: view.page - 1 })}>
                Back
              </button>
            )}
            <button
              className="primary"
              onClick={() =>
                view.page < SNAPSHOT_INTRO.length - 1
                  ? setView({ name: 'snapshot-intro', page: view.page + 1 })
                  : setView({ name: 'question', index: 0 })
              }
            >
              {view.page < SNAPSHOT_INTRO.length - 1 ? 'Continue' : 'Begin'}
            </button>
          </div>
        </section>
      )}

      {view.name === 'question' && (
        <QuestionScreen
          index={view.index}
          value={answers[qKey] ?? ''}
          onChange={(v) => setAnswers((a) => ({ ...a, [qKey]: v }))}
          status={qAutosave.status}
          headingRef={headingRef}
          onBack={() => goQuestion(view.index - 1)}
          onNext={() => goQuestion(view.index + 1)}
          onExit={saveAndExit}
        />
      )}

      {view.name === 'review' && (
        <section className="card">
          <p className="eyebrow">Your IOTA Baseline · Review</p>
          <h1 className="title" ref={headingRef} tabIndex={-1}>
            Review your answers
          </h1>
          <p className="muted">When you submit, this becomes your IOTA Baseline and cannot be changed.</p>
          <ol className="review">
            {QUESTION_KEYS.map((k, i) => (
              <li key={k}>
                <p className="q">{QUESTIONS[k].prompt}</p>
                <p className={`a ${answers[k]?.trim() ? '' : 'muted'}`}>{answers[k]?.trim() || (k === 'q8' ? 'Left blank' : 'Not answered yet')}</p>
                <button className="link" onClick={() => setView({ name: 'question', index: i })}>
                  Edit answer {i + 1}
                </button>
              </li>
            ))}
          </ol>
          <div className="actions">
            <button className="secondary" onClick={() => setView({ name: 'question', index: QUESTION_KEYS.length - 1 })}>
              Back
            </button>
            <button className="primary" onClick={() => setConfirming('submit')} disabled={busy || confirming === 'submit'}>
              {busy ? 'Submitting…' : 'Submit my IOTA Baseline'}
            </button>
          </div>
          {confirming === 'submit' && (
            <div className="confirm" role="alertdialog" aria-labelledby="confirm-submit-title" aria-describedby="confirm-submit-body">
              <h2 id="confirm-submit-title" className="subtitle">Submit your IOTA Baseline?</h2>
              <p id="confirm-submit-body">
                This becomes your IOTA Baseline. You will read it again at the end of the IOTA Genesis Program, and it cannot be changed after you submit.
              </p>
              <div className="actions">
                <button className="secondary" onClick={() => setConfirming(null)}>
                  Not yet
                </button>
                <button className="primary" onClick={submitSnapshot} disabled={busy} autoFocus>
                  Yes, submit
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {view.name === 'saved-exit' && (
        <section className="card">
          <h1 className="title" ref={headingRef} tabIndex={-1}>
            Saved
          </h1>
          <p>Your answers are saved. Come back to this page any time to continue where you left off.</p>
          <div className="actions">
            <button className="primary" onClick={() => me && void load().then((d) => d && route(d))}>
              Continue now
            </button>
          </div>
        </section>
      )}

      {view.name === 'ns-orient' && (
        <NsStep step={1} title="Your IOTA North Star" headingRef={headingRef} onNext={() => setView({ name: 'ns-discover' })}>
          {NORTH_STAR.orient.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </NsStep>
      )}

      {view.name === 'ns-discover' && (
        <NsStep
          step={2}
          title="Discover"
          headingRef={headingRef}
          onBack={() => setView({ name: 'ns-orient' })}
          onNext={() => setView({ name: 'ns-write' })}
        >
          <p className="prompt">{NORTH_STAR.discover}</p>
          <p className="muted">Take a moment with this before you write.</p>
        </NsStep>
      )}

      {view.name === 'ns-write' && (
        <NsWrite
          value={northStarDraft}
          onChange={setNorthStarDraft}
          status={nsAutosave.status}
          headingRef={headingRef}
          onBack={() => setView(me?.northStar ? { name: 'home' } : { name: 'ns-discover' })}
          onNext={async () => {
            try {
              await nsAutosave.flush();
              setView({ name: 'ns-voice' });
            } catch {
              setNotice({ kind: 'error', text: 'Your last change has not saved yet. Please try again.' });
            }
          }}
        />
      )}

      {view.name === 'ns-voice' && (
        <NsStep step={4} title="Voice check" headingRef={headingRef} onBack={() => setView({ name: 'ns-write' })}>
          {NORTH_STAR.voiceCheck.map((p) => (
            <p key={p}>{p}</p>
          ))}
          <blockquote className="statement">{northStarDraft.trim()}</blockquote>
          <div className="actions">
            <button className="secondary" onClick={() => setView({ name: 'ns-write' })}>
              Revise
            </button>
            <button className="primary" onClick={saveNorthStar} disabled={busy || !northStarDraft.trim()}>
              {busy ? 'Saving…' : 'It sounds like me. Save it'}
            </button>
          </div>
        </NsStep>
      )}

      {view.name === 'home' && me?.northStar && (
        <section className="northstar">
          <p className="eyebrow">My IOTA North Star</p>
          <h1 className="sr-only" ref={headingRef} tabIndex={-1}>
            My IOTA North Star
          </h1>
          <blockquote className="statement large">{me.northStar.statement}</blockquote>
          <div className="actions stack">
            <button className="secondary" onClick={() => setView({ name: 'ns-write' })}>
              Edit North Star
            </button>
            {me.baseline && (
              <button className="secondary" onClick={() => setView({ name: 'snapshot-read' })}>
                View my IOTA Baseline
              </button>
            )}
          </div>
        </section>
      )}

      {view.name === 'snapshot-read' && me?.baseline && (
        <section className="card">
          <p className="eyebrow">IOTA Baseline</p>
          <h1 className="title" ref={headingRef} tabIndex={-1}>
            Your IOTA Baseline
          </h1>
          <p className="muted">Submitted {new Date(me.baseline.submittedAt).toLocaleDateString()}</p>
          <ol className="review">
            {QUESTION_KEYS.map((k) => (
              <li key={k}>
                <p className="q">{QUESTIONS[k].prompt}</p>
                <p className="a">{me.baseline!.answers[k] || '—'}</p>
              </li>
            ))}
          </ol>
          <div className="actions">
            <button className="primary" onClick={() => setView(me.northStar ? { name: 'home' } : { name: 'ns-orient' })}>
              Back
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  const text = status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : status === 'error' ? 'Not saved yet — check your connection' : '';
  return (
    <p className={`save ${status === 'error' ? 'error' : 'muted'}`} role="status" aria-live="polite">
      {text}
    </p>
  );
}

function Counter({ value }: { value: string }) {
  const n = charCount(value);
  const left = MAX_CHARS - n;
  return (
    <p className={`small ${left < 0 ? 'error' : 'muted'}`} aria-live={left < 100 ? 'polite' : 'off'}>
      {left >= 0 ? `${left.toLocaleString()} characters left` : `${(-left).toLocaleString()} characters over the limit`}
    </p>
  );
}

function QuestionScreen(props: {
  index: number;
  value: string;
  onChange: (v: string) => void;
  status: SaveStatus;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  onNext: () => void;
  onExit: () => void;
}) {
  const k = QUESTION_KEYS[props.index];
  const over = charCount(props.value) > MAX_CHARS;
  const optional = k === 'q8';
  const id = `answer-${k}`;
  return (
    <section className="card">
      <p className="eyebrow">
        Your IOTA Baseline · {props.index + 1} of {QUESTION_KEYS.length}
      </p>
      <progress className="progress" max={QUESTION_KEYS.length} value={props.index + 1} aria-label={`Question ${props.index + 1} of ${QUESTION_KEYS.length}`} />
      <h1 className="title" ref={props.headingRef} tabIndex={-1}>
        <label htmlFor={id}>{QUESTIONS[k].prompt}</label>
      </h1>
      <p className="muted" id={`${id}-help`}>
        Write plainly. There is no right answer{optional ? '. This one is optional.' : '.'}
      </p>
      <textarea
        id={id}
        className="answer"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        rows={8}
        aria-describedby={`${id}-help`}
        aria-invalid={over}
        autoComplete="off"
        spellCheck
      />
      <div className="meta">
        <Counter value={props.value} />
        <SaveIndicator status={props.status} />
      </div>
      <div className="actions">
        <button className="secondary" onClick={props.onBack}>
          Back
        </button>
        <button className="primary" onClick={props.onNext} disabled={over}>
          Save and continue
        </button>
      </div>
      <p className="small">
        <button className="link" onClick={props.onExit}>
          Save and exit
        </button>
      </p>
    </section>
  );
}

function NsStep(props: {
  step: number;
  title: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onBack?: () => void;
  onNext?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="card">
      <p className="eyebrow">IOTA North Star · Step {props.step} of 4</p>
      <h1 className="title" ref={props.headingRef} tabIndex={-1}>
        {props.title}
      </h1>
      {props.children}
      {(props.onBack || props.onNext) && (
        <div className="actions">
          {props.onBack && (
            <button className="secondary" onClick={props.onBack}>
              Back
            </button>
          )}
          {props.onNext && (
            <button className="primary" onClick={props.onNext}>
              Continue
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function NsWrite(props: {
  value: string;
  onChange: (v: string) => void;
  status: SaveStatus;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  onNext: () => void;
}) {
  const over = charCount(props.value) > MAX_CHARS;
  return (
    <section className="card">
      <p className="eyebrow">IOTA North Star · Step 3 of 4</p>
      <h1 className="title" ref={props.headingRef} tabIndex={-1}>
        <label htmlFor="north-star">Write</label>
      </h1>
      <p id="north-star-help">{NORTH_STAR.write}</p>
      <textarea
        id="north-star"
        className="answer"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        rows={5}
        aria-describedby="north-star-help"
        aria-invalid={over}
        autoComplete="off"
        spellCheck
      />
      <div className="meta">
        <Counter value={props.value} />
        <SaveIndicator status={props.status} />
      </div>
      <details className="examples">
        <summary>See examples</summary>
        <p className="muted small">These are examples only. Write your own.</p>
        <ul>
          {NORTH_STAR.examples.map((e) => (
            <li key={e.slice(0, 24)}>{e}</li>
          ))}
        </ul>
      </details>
      <div className="actions">
        <button className="secondary" onClick={props.onBack}>
          Back
        </button>
        <button className="primary" onClick={props.onNext} disabled={over || !props.value.trim()}>
          Continue
        </button>
      </div>
    </section>
  );
}
