import { describe, it, expect } from 'vitest';
import { mightyNorthStarToAdopt } from '../src/lib/northStarAdopt';

const active = { statement: 'My app version.', createdAt: '2026-10-01T10:00:00.000Z' };

describe('adopting a North Star edited in Mighty', () => {
  it('adopts a newer, different edit', () => {
    expect(
      mightyNorthStarToAdopt({ active, activeSynced: true, mighty: { text: ' Edited in Mighty. ', lastEditedAt: '2026-10-02T09:00:00Z' } }),
    ).toBe('Edited in Mighty.');
  });
  it('ignores identical text (including CRLF/whitespace differences)', () => {
    expect(mightyNorthStarToAdopt({ active, activeSynced: true, mighty: { text: 'My app version.\r\n', lastEditedAt: '2026-10-02T09:00:00Z' } })).toBeNull();
  });
  it('never adopts while the app version is still on its way to Mighty', () => {
    expect(mightyNorthStarToAdopt({ active, activeSynced: false, mighty: { text: 'Old text', lastEditedAt: '2026-10-02T09:00:00Z' } })).toBeNull();
  });
  it('ignores a Mighty copy older than the app version', () => {
    expect(mightyNorthStarToAdopt({ active, activeSynced: true, mighty: { text: 'Older', lastEditedAt: '2026-09-30T09:00:00Z' } })).toBeNull();
  });
  it('ignores an empty field and members who have not done the exercise', () => {
    expect(mightyNorthStarToAdopt({ active, activeSynced: true, mighty: { text: '   ', lastEditedAt: null } })).toBeNull();
    expect(mightyNorthStarToAdopt({ active: null, activeSynced: false, mighty: { text: 'Profile answer', lastEditedAt: null } })).toBeNull();
  });
  it('ignores text over the 2,000-character limit', () => {
    expect(mightyNorthStarToAdopt({ active, activeSynced: true, mighty: { text: 'x'.repeat(2001), lastEditedAt: null } })).toBeNull();
  });
});
