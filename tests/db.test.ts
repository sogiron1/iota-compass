import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

let db: PGlite;
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

async function asMember<T>(member: string | null, fn: () => Promise<T>) {
  await db.exec('begin');
  try {
    await db.exec('set local role compass_app');
    if (member) await db.query("select set_config('app.member_id', $1, true)", [member]);
    const r = await fn();
    await db.exec('commit');
    return r;
  } catch (e) {
    await db.exec('rollback');
    throw e;
  }
}

beforeAll(async () => {
  db = new PGlite();
  // pglite runs as superuser "postgres"; create a non-superuser owner to mimic Neon.
  await db.exec(readFileSync('db/migrations/0001_init.sql', 'utf8'));
  await db.query('insert into members(id, mighty_member_id) values ($1, $2), ($3, $4)', [A, 'mA', B, 'mB']);
});

describe('schema + RLS', () => {
  it('member sees only own drafts', async () => {
    await asMember(A, () => db.query("insert into drafts(member_id, draft_key, answer) values ($1,'q1','dummy A')", [A]));
    await asMember(B, () => db.query("insert into drafts(member_id, draft_key, answer) values ($1,'q1','dummy B')", [B]));
    const rowsA = await asMember(A, () => db.query<{ answer: string }>('select answer from drafts'));
    expect(rowsA.rows.map((r) => r.answer)).toEqual(['dummy A']);
  });

  it('member cannot write rows for another member', async () => {
    await expect(
      asMember(A, () => db.query("insert into drafts(member_id, draft_key, answer) values ($1,'q2','x')", [B])),
    ).rejects.toThrow(/row-level security/);
  });

  it('member cannot update another member draft (0 rows)', async () => {
    const r = await asMember(A, () => db.query("update drafts set answer='hijack' where member_id=$1", [B]));
    expect(r.affectedRows).toBe(0);
    const rowsB = await asMember(B, () => db.query<{ answer: string }>('select answer from drafts'));
    expect(rowsB.rows[0].answer).toBe('dummy B');
  });

  it('no member context sees nothing', async () => {
    const r = await asMember(null, () => db.query('select * from drafts'));
    expect(r.rows.length).toBe(0);
  });

  it('baseline is created once and is immutable', async () => {
    const s1 = await asMember(A, () => db.query<{ id: string }>("select submit_baseline($1::jsonb) as id", [JSON.stringify({ q1: 'a1', q8: 'a8' })]));
    const s2 = await asMember(A, () => db.query<{ id: string }>("select submit_baseline($1::jsonb) as id", [JSON.stringify({ q1: 'CHANGED' })]));
    expect(s2.rows[0].id).toBe(s1.rows[0].id);
    const ans = await asMember(A, () => db.query<{ answer: string }>("select answer from snapshot_answers where question_key='q1'"));
    expect(ans.rows[0].answer).toBe('a1');
    await expect(asMember(A, () => db.query("update snapshot_answers set answer='x'"))).rejects.toThrow();
    await expect(asMember(A, () => db.query('delete from snapshot_answers'))).rejects.toThrow(/permission denied/);
    const bSees = await asMember(B, () => db.query('select * from snapshot_answers'));
    expect(bSees.rows.length).toBe(0);
  });

  it('north star versions: new row per save, one active, history immutable', async () => {
    await asMember(A, () => db.query('select save_north_star($1)', ['v1 text']));
    await asMember(A, () => db.query('select save_north_star($1)', ['v2 text']));
    const r = await asMember(A, () => db.query<{ version: number; is_active: boolean; statement: string }>('select version, is_active, statement from north_stars order by version'));
    expect(r.rows).toEqual([
      { version: 1, is_active: false, statement: 'v1 text' },
      { version: 2, is_active: true, statement: 'v2 text' },
    ]);
    await expect(asMember(A, () => db.query("update north_stars set statement='x'"))).rejects.toThrow(/permission denied/);
  });

  it('runtime role cannot change identity or role', async () => {
    await expect(asMember(A, () => db.query("update members set role='host'"))).rejects.toThrow(/permission denied/);
    await expect(asMember(A, () => db.query("update members set mighty_member_id='x'"))).rejects.toThrow(/permission denied/);
  });

  it('sync_events rejects anything but a safe error code', async () => {
    const sid = (await asMember(A, () => db.query<{ id: string }>("select id from snapshot_submissions"))).rows[0].id;
    await expect(
      asMember(A, () => db.query("insert into sync_events(member_id, record_type, record_id, field_key, mighty_custom_field_id, safe_error_code) values ($1,'snapshot',$2,'q1','F1','this has spaces and text')", [A, sid])),
    ).rejects.toThrow();
  });

  it('draft length limit enforced in code points (emoji counts once)', async () => {
    const ok = '😀'.repeat(2000);
    await asMember(A, () => db.query("insert into drafts(member_id, draft_key, answer) values ($1,'q3',$2)", [A, ok]));
    await expect(
      asMember(A, () => db.query("insert into drafts(member_id, draft_key, answer) values ($1,'q4',$2)", [A, ok + 'x'])),
    ).rejects.toThrow();
  });
});
