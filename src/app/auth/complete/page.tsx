import { cookies } from 'next/headers';
import { HANDOFF_COOKIE } from '@/lib/session';
import { config } from '@/lib/config';
import HandoffClient from './HandoffClient';

export const dynamic = 'force-dynamic';

const MESSAGES: Record<string, string> = {
  cancelled: 'Connection was cancelled.',
  state: 'This sign-in link expired.',
  exchange: 'We could not finish connecting to Mighty.',
  issuer: 'We could not verify the sign-in.',
  code: 'We could not finish connecting to Mighty.',
  rate: 'Too many attempts. Please wait a minute.',
};

export default async function AuthComplete({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const error = sp.e && MESSAGES[sp.e] ? sp.e : null;
  const handoff = error ? null : ((await cookies()).get(HANDOFF_COOKIE)?.value ?? null);
  return (
    <main className="shell center">
      <HandoffClient
        handoff={handoff && handoff.length <= 128 ? handoff : null}
        error={error ? MESSAGES[error] : null}
        appOrigin={config.appOrigin}
        popup={sp.m === 'popup'}
      />
    </main>
  );
}
