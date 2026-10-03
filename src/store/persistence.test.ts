import { beforeEach, describe, expect, it } from 'vitest';
import { buildDemoData } from '../domain/demo';
import { emptyAppData } from '../domain/schema';
import { clearData, loadData, parseImport, saveData, serializeExport } from './persistence';

describe('persistence', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearData();
  });

  it('starts empty', async () => {
    const { data, recoveredFrom } = await loadData();
    expect(data).toEqual(emptyAppData());
    expect(recoveredFrom).toBeUndefined();
  });

  it('round-trips saved data through IndexedDB', async () => {
    const demo = buildDemoData('2026-06-01');
    await saveData(demo);
    expect(localStorage.getItem('physicality:journal')).toBeNull();
    const { data } = await loadData();
    expect(data.workouts.length).toBe(demo.workouts.length);
    expect(data.profile?.name).toBe('Alex');
  });

  it('replays the journal when the IndexedDB write did not land', async () => {
    const demo = buildDemoData('2026-06-01');
    localStorage.setItem('physicality:journal', JSON.stringify({ seq: 99, data: demo }));
    const { data } = await loadData();
    expect(data.profile?.name).toBe('Alex');
    expect(localStorage.getItem('physicality:journal')).toBeNull();
  });

  it('validates imports and accepts exported backups', () => {
    const demo = buildDemoData('2026-06-01');
    const parsed = parseImport(serializeExport(demo));
    expect(parsed.ok).toBe(true);
    expect(parseImport('not json').ok).toBe(false);
    const bad = parseImport(JSON.stringify({ ...demo, workouts: [{ id: 'x', date: 'yesterday', exercises: [] }] }));
    expect(bad.ok).toBe(false);
  });
});

describe('migrations', () => {
  it('upgrades v1 data to the current version', async () => {
    const { parseAppData } = await import('./persistence');
    const v1 = {
      version: 1,
      profile: null,
      workouts: [],
      checkIns: [],
      measurements: [],
      customExercises: [],
      settings: { units: 'imperial', theme: 'dark' },
    };
    const parsed = parseAppData(v1);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.version).toBe(3);
      expect(parsed.data.scans).toEqual([]);
      expect(parsed.data.settings).toEqual({ units: 'imperial', theme: 'dark', modelDetail: 'precise' });
    }
  });

  it('upgrades v2 data with scans to v3 unchanged', async () => {
    const { parseAppData } = await import('./persistence');
    const demo = buildDemoData('2026-06-01');
    const parsed = parseAppData({ ...demo, version: 2 });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.version).toBe(3);
      expect(parsed.data.scans).toEqual(demo.scans);
    }
  });
});
