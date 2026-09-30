import { headers } from 'next/headers';
import CompassApp from '@/components/CompassApp';
import { config } from '@/lib/config';

export const dynamic = 'force-dynamic';

export default async function Home() {
  await headers(); // dynamic render so the CSP nonce applies
  const mode = process.env.EMBED_AUTH_MODE === 'popup' ? 'popup' : 'iframe';
  return <CompassApp embedAuthMode={mode} mightyOrigin={`https://${config.mightyNetworkHost}`} />;
}
