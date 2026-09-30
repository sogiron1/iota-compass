# IOTA Compass

IOTA Baseline and IOTA North Star for IOTA Genesis Program members, embedded in
The New Human University's Mighty network. Final answers are written to each member's
own private Mighty custom fields; the app database keeps the immutable baseline and
North Star history.

- Live (staging until approved): https://iota-compass.vercel.app
- Mighty network: https://the-new-human-university.mn.co (network ID 13510327)
- Hosting: Vercel project `iota-compass` (region iad1)
- Database: Neon project `iota-compass` (`proud-field-47136670`, aws-us-east-1, Postgres 17)

## How it works

1. A member opens the "My IOTA Compass" Page in the Iota Genesis Space. The Page embeds
   this app with Mighty's **Require Mighty Sign-in** option.
2. The member connects with Mighty OAuth (authorization code + PKCE S256, confidential
   client). There is no separate password. Sign-in runs inside the embed
   (`EMBED_AUTH_MODE=iframe`, the default): Mighty's sign-in page allows framing by
   same-origin parents, and the Page is on the Mighty origin. Popups were blocked in
   testing, so popup mode is kept only as an option. "Open IOTA Compass in a new tab"
   is the fallback.
3. Drafts autosave to Neon. Submitting the IOTA Baseline creates an immutable
   baseline, then writes each answer to its Mighty field, one `updateCustomFieldAnswer`
   per field, and verifies the echo. Success is shown only when every field confirms.
4. The North Star is saved as a new version each time it is edited. Only the active
   version is written to Mighty.

### Verified Mighty contract (network 13510327, 29 Sep 2026)

| Item | Value |
| --- | --- |
| Scopes (member only) | `read:userinfo read:network write:profile` |
| Authorize / token | `https://the-new-human-university.mn.co/oauth/authorize`, `/oauth/token` (client_secret_post) |
| Grant types | `authorization_code` only. There is no refresh grant, so access tokens last about 1 hour. |
| Identity | `me { id }` (GlobalID) |
| Write | `updateCustomFieldAnswer(input: { customFieldId, memberId, text })` → `{ errors, response { text customField { id } member { id } } }` |
| Read own (visible fields only) | `me { customFieldResponses(first, answeredOnly) { nodes { text customField { id } } } }` |
| GraphQL endpoint | `https://api.mn.co/networks/13510327/graphql` (non-empty User-Agent required) |
| Long text | 1–2,000 characters. Field names are at most 40 characters. |

Two-member privacy test: members can write only their own answers. Cross-member reads
return nothing or `NOT_FOUND`; cross-member writes return `FORBIDDEN`; other members'
profiles do not show Private fields; Hosts see answers on each field's Responses tab.

## Security model

- Tokens never reach the browser. Access and refresh tokens are AES-256-GCM encrypted
  at rest with a key held only in Vercel.
- The Mighty member ID comes only from `me` using the member's own token, never from
  request input.
- Every DB transaction runs `SET LOCAL ROLE compass_app`, a no-login role with minimum
  grants and no BYPASSRLS. Member tables use FORCE RLS keyed on `app.member_id`.
- Baseline answers cannot be updated or deleted by the runtime role (no grant, plus
  triggers). North Star history is append-only; only `is_active` can flip.
- CSRF: every write needs the `x-compass-request` header and a same-origin `Origin`.
- CSP uses a per-request nonce. `frame-ancestors` is limited to the network host,
  `*.mn.co` and `*.mightynetworks.com`.
- Logs are allow-listed fields only. Answer text, tokens and Mighty IDs are never logged.
- Disconnect revokes the Mighty tokens and ends the app session (signing out of Mighty
  does not do this).

## Environment variables

Names only; see `.env.example`. Secrets are entered by the owner directly in Vercel
(Sensitive): `MIGHTY_OAUTH_CLIENT_SECRET`, `DATABASE_URL`, optional `TOKEN_ENCRYPTION_KEY`.

## Field mapping

`mighty_field_map` maps stable keys (`q1`–`q8`, `north_star`) to Mighty GlobalIDs.
It is filled once by an admin after the fields are created:

```sql
insert into mighty_field_map(field_key, mighty_field_id, label) values
  ('north_star', '<GlobalID>', 'IOTA North Star'),
  ('q1', '<GlobalID>', '<label>'), ...;
```

Get GlobalIDs from the hosted explorer:
`network { customFields(first: 50) { nodes { id title status privacy } } }`.

### Page visibility

New Mighty Pages start **Hidden**. After adding the "My IOTA Compass" Page to a Space,
a Host opens the Page's three-dot menu and sets it to **Visible**. Hosts who are not
members of a private Space can open it directly at `/spaces/<id>`.

## Deploy

Deploys go through the Vercel API from this repository's files, and every file's SHA-1
is checked against `git` after upload.

1. `npm test && npx tsc --noEmit && npx next build` locally.
2. Deploy with target `production`.
3. Smoke test: `/` loads, `/api/me` returns 401 unauthenticated, and the CSP and frame
   headers are present.

## Rollback

Vercel → Deployments → pick the previous READY deployment → Promote. The database
schema is additive; there are no destructive migrations in the MVP.

## Backups and restore

- Neon keeps 6 hours of history (point-in-time restore) on the current plan. Before
  launch, raise history retention if the plan allows.
- Daily logical backup (recommended after launch):
  `pg_dump --format=custom "$DATABASE_URL" > compass-$(date +%F).dump`, stored encrypted.
- Restore drill: create a Neon branch at a past timestamp, check the row counts, then
  point `DATABASE_URL` at it only if needed.
- Mighty itself remains a second copy of every submitted answer.

## Monitoring

- Vercel runtime logs: look for `sync.alert`, `sync.field` with `status=failed`, and
  `route.error`.
- Database health check (counts only, no answer text):
  `select status, count(*) from sync_events group by status;`
- A `failed` or `NEEDS_RECONNECT` row means the member reconnects and taps "Finish
  sending to Mighty". Their answers are already safe in Neon.

## Incident procedures

| Incident | Action |
| --- | --- |
| Suspected secret exposure | Rotate the OAuth client secret in Mighty and update Vercel (stored tokens become unreadable, so members reconnect). Rotate the Neon password. |
| Cross-member data concern | Hide or remove the Page from the Space (the app becomes unreachable from Mighty), then investigate using `sync_events` and the logs. |
| Mighty API outage | Members can still save; submissions queue as pending. Retry when Mighty recovers. |
| Member deletion request | Delete the `members` row (cascades to all app data), clear their Mighty fields as a Host, and record the date. |

## Admin guide (plain language)

- **Where answers live:** each IOTA Baseline answer is in a private, hidden Mighty field
  (Admin → Custom Fields → the field → **Responses**). The North Star is in the
  "IOTA North Star" field, which is also visible on the member's own profile.
- **Who can see them:** Hosts in Admin, plus the member in IOTA Compass. Other members
  cannot.
- **If a member says it "didn't save":** ask them to open IOTA Compass again. If they
  see "we are finishing the connection to Mighty", they tap **Finish sending to
  Mighty**. Nothing is lost.
- **Never** edit a member's answers in Mighty on their behalf. The app keeps the
  original baseline, and the two would disagree.

## Facilitator guide (plain language)

- Before a member's first session, open Admin → Custom Fields → each **IOTA Baseline**
  field → Responses, and find the member.
- Their **IOTA North Star** is also on their profile under the IOTA North Star field.
- Treat answers as confidential. Do not copy them into email, chat or notes tools.
- Notifications never contain answers; they say only that a submission is ready.
