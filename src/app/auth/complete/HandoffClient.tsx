'use client';

import { useEffect, useState } from 'react';

export default function HandoffClient({
  handoff,
  error,
  appOrigin,
  popup,
}: {
  handoff: string | null;
  error: string | null;
  appOrigin: string;
  popup: boolean;
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
        {popup ? (
          <p>You can close this window and try again.</p>
        ) : (
          <div className="actions">
            {/* manual=1 shows the Connect button instead of retrying automatically */}
            <a className="button primary" href="/?manual=1">
              Back to IOTA Compass
            </a>
          </div>
        )}
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
