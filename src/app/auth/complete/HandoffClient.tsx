'use client';

import { useEffect, useState } from 'react';

export default function HandoffClient({
  handoff,
  error,
  appOrigin,
}: {
  handoff: string | null;
  error: string | null;
  appOrigin: string;
}) {
  const [status, setStatus] = useState<'sending' | 'sent' | 'orphan'>('sending');

  useEffect(() => {
    if (error) return;
    const opener = window.opener as Window | null;
    if (handoff && opener && !opener.closed) {
      // Only our own app origin can receive the one-time code.
      opener.postMessage({ type: 'iota-compass-handoff', code: handoff }, appOrigin);
      setStatus('sent');
      const t = setTimeout(() => window.close(), 400);
      return () => clearTimeout(t);
    }
    setStatus('orphan');
  }, [handoff, error, appOrigin]);

  if (error) {
    return (
      <section className="card" role="alert">
        <h1 className="title">Not connected</h1>
        <p>{error}</p>
      </section>
    );
  }
  return (
    <section className="card" aria-live="polite">
      <h1 className="title">{status === 'orphan' ? 'Connected' : 'Connecting…'}</h1>
      <p>
        {status === 'orphan'
          ? 'You are connected. Close this window and return to IOTA Compass in Mighty.'
          : 'You can close this window if it does not close by itself.'}
      </p>
    </section>
  );
}
