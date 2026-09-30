import 'server-only';
import { config } from '../config';

export class MightyApiError extends Error {
  constructor(
    public readonly safeCode: string,
    public readonly transient: boolean,
    public readonly httpStatus?: number,
  ) {
    super(safeCode);
  }
}

type GraphQLError = { message?: string; extensions?: { code?: string } };

// Minimal GraphQL client. Never logs variables (they contain answer text).
export async function mightyGraphql<T>(
  accessToken: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(config.mightyGraphqlUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': config.userAgent, // required: empty UA gets an HTML 403
      },
      body: JSON.stringify({ query, variables }),
      cache: 'no-store',
    });
  } catch {
    throw new MightyApiError('network_error', true);
  }

  if (res.status === 401) throw new MightyApiError('UNAUTHENTICATED', false, 401);
  if (res.status === 429) throw new MightyApiError('RATE_LIMITED', true, 429);
  if (res.status >= 500) throw new MightyApiError(`http_${res.status}`, true, res.status);
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new MightyApiError(`non_json_${res.status}`, res.status >= 500, res.status);
  }

  const json = (await res.json()) as { data?: T; errors?: GraphQLError[] };
  // GraphQL returns 200 for application errors: always inspect `errors`.
  if (json.errors?.length) {
    const code = json.errors[0]?.extensions?.code ?? 'GRAPHQL_ERROR';
    const safe = /^[A-Z_]{1,40}$/.test(code) ? code : 'GRAPHQL_ERROR';
    const transient = safe === 'INTERNAL_SERVER_ERROR';
    throw new MightyApiError(safe, transient, res.status);
  }
  if (!json.data) throw new MightyApiError('NO_DATA', false, res.status);
  return json.data;
}
