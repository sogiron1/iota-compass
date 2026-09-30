import 'server-only';
import { mightyGraphql, MightyApiError } from './graphql';

// Verified 2026-09-29 by introspection in the hosted explorer for network 13510327:
//   Query.me: Member { id: ID!, resourceId: ID! }
//   Mutation.updateCustomFieldAnswer(input: UpdateCustomFieldAnswerInput!)
//     input { customFieldId: ID!, memberId: ID!, text: String, optionIds, newOptionTitles, clientMutationId }
//       - IDs accept numeric resource IDs or GlobalIDs
//       - naming a member other than the viewer requires host:write:network_members
//     payload { clientMutationId, errors: [..]!, response: MemberCustomFieldResponse }
//   MemberCustomFieldResponse { customField, lastEditedAt, member, selectedOptions, text }
//   Network.customField(id) / Network.customFields(first, ...) -> CustomField
//   CustomField.answers(memberId, first, ...) -> CustomFieldAnswerConnection

export const ME_QUERY = /* GraphQL */ `
  query CompassMe {
    me {
      id
    }
  }
`;

export const UPDATE_ANSWER_MUTATION = /* GraphQL */ `
  mutation CompassUpdateAnswer($input: UpdateCustomFieldAnswerInput!) {
    updateCustomFieldAnswer(input: $input) {
      errors
      response {
        text
        lastEditedAt
        customField { id }
        member { id }
      }
    }
  }
`;

export const OWN_ANSWER_QUERY = /* GraphQL */ `
  query CompassOwnAnswer($fieldId: ID!, $memberId: ID!) {
    network {
      customField(id: $fieldId) {
        answers(memberId: $memberId, first: 1) {
          nodes { text }
        }
      }
    }
  }
`;

// Member-visible read path for the viewer's own answers (works for hidden fields
// where network.customField(id) returns NOT_FOUND to members).
export const ME_RESPONSES_QUERY = /* GraphQL */ `
  query CompassMyResponses {
    me {
      customFieldResponses(first: 50, answeredOnly: true) {
        nodes { text lastEditedAt customField { id } }
      }
    }
  }
`;

// Used only by the Phase 0 probe to prove a member CANNOT read another member.
export const OTHER_MEMBER_RESPONSES_QUERY = /* GraphQL */ `
  query CompassOtherResponses($memberId: ID!) {
    node(id: $memberId) {
      ... on Member {
        customFieldResponses(first: 50, answeredOnly: true) {
          nodes { text customField { id } }
        }
      }
    }
  }
`;

type MeResult = { me: { id: string } | null };

export async function getViewerId(accessToken: string): Promise<string> {
  const data = await mightyGraphql<MeResult>(accessToken, ME_QUERY);
  const id = data.me?.id;
  if (!id) throw new MightyApiError('NO_VIEWER', false);
  return String(id);
}

type UpdateResult = {
  updateCustomFieldAnswer: {
    errors?: unknown[] | null;
    response?: {
      text?: string | null;
      customField?: { id: string } | null;
      member?: { id: string } | null;
    } | null;
  } | null;
};

/**
 * Writes the viewer's own answer. memberId is the viewer's own ID taken from
 * the verified session, never from the client. Succeeds only if Mighty echoes
 * back the same field, the same member and the same text.
 */
export async function writeOwnAnswer(
  accessToken: string,
  args: { customFieldId: string; memberId: string; text: string },
): Promise<void> {
  const data = await mightyGraphql<UpdateResult>(accessToken, UPDATE_ANSWER_MUTATION, {
    input: { customFieldId: args.customFieldId, memberId: args.memberId, text: args.text },
  });
  const payload = data.updateCustomFieldAnswer;
  if (!payload) throw new MightyApiError('NO_PAYLOAD', false);
  if (payload.errors && payload.errors.length) throw new MightyApiError('MUTATION_ERRORS', false);
  const r = payload.response;
  if (!r) throw new MightyApiError('NO_RESPONSE', false);
  if (r.customField?.id && String(r.customField.id) !== args.customFieldId) {
    throw new MightyApiError('FIELD_MISMATCH', false);
  }
  if (r.member?.id && String(r.member.id) !== args.memberId) {
    throw new MightyApiError('MEMBER_MISMATCH', false);
  }
  if (normalize(r.text ?? '') !== normalize(args.text)) {
    throw new MightyApiError('TEXT_MISMATCH', false);
  }
}

type ResponsesResult = {
  me: {
    customFieldResponses: {
      nodes: { text: string | null; lastEditedAt?: string | null; customField: { id: string } | null }[];
    };
  } | null;
};

export type OwnAnswer = { text: string; lastEditedAt: string | null };

/** The viewer's own answers with last-edited times, keyed by custom-field GlobalID. */
export async function readOwnAnswersDetailed(accessToken: string): Promise<Map<string, OwnAnswer>> {
  const data = await mightyGraphql<ResponsesResult>(accessToken, ME_RESPONSES_QUERY);
  const out = new Map<string, OwnAnswer>();
  for (const n of data.me?.customFieldResponses.nodes ?? []) {
    if (n.customField?.id && typeof n.text === 'string') {
      out.set(String(n.customField.id), { text: n.text, lastEditedAt: n.lastEditedAt ?? null });
    }
  }
  return out;
}

/** The viewer's own answers keyed by custom-field GlobalID. */
export async function readOwnAnswers(accessToken: string): Promise<Map<string, string>> {
  const data = await mightyGraphql<ResponsesResult>(accessToken, ME_RESPONSES_QUERY);
  const out = new Map<string, string>();
  for (const n of data.me?.customFieldResponses.nodes ?? []) {
    if (n.customField?.id && typeof n.text === 'string') out.set(String(n.customField.id), n.text);
  }
  return out;
}

/** Best-effort preload of the viewer's current answer; null if unavailable. */
export async function readOwnAnswer(
  accessToken: string,
  args: { customFieldId: string; memberId: string },
): Promise<string | null> {
  try {
    return (await readOwnAnswers(accessToken)).get(args.customFieldId) ?? null;
  } catch {
    return null;
  }
}

export function normalize(s: string) {
  return s.replace(/\r\n/g, '\n').trim();
}
