import { describe, expect, it } from 'vitest';
import { SENRIYAMA_FLOOR_PLANS } from './senriyama-indoor';
import { SENRIYAMA_OFFICIAL_ACCESS } from './senriyama-official-access';

describe('SENRIYAMA_OFFICIAL_ACCESS', () => {
  const planIds = new Set(Object.keys(SENRIYAMA_FLOOR_PLANS));
  it('refers only to buildings that have a floor plan', () => {
    for (const id of Object.keys(SENRIYAMA_OFFICIAL_ACCESS)) {
      expect(planIds.has(id), id).toBe(true);
    }
  });
  it('uses only yes / no / unknown', () => {
    for (const a of Object.values(SENRIYAMA_OFFICIAL_ACCESS)) {
      for (const v of [a.elevator, a.autoDoorEntrance, a.accessibleRestroom]) {
        expect(['yes', 'no', 'unknown']).toContain(v);
      }
    }
  });
  it('never claims an elevator for buildings the map shows no elevator mark for', () => {
    expect(SENRIYAMA_OFFICIAL_ACCESS['area1-2']?.elevator).toBe('unknown');
    expect(SENRIYAMA_OFFICIAL_ACCESS['area2-3']?.elevator).toBe('unknown');
  });
});
