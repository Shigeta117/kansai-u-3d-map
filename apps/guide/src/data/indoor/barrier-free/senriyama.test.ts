import { describe, expect, it } from 'vitest';
import {
  SENRIYAMA_LANDMARKS,
  SENRIYAMA_WING_BUILDINGS,
  SENRIYAMA_WINGS,
  wingHasFloor,
  type AccessStatus,
  type BarrierFreeBuilding,
} from '@kansai-u-3d/core';
import { SENRIYAMA_FLOOR_PLANS } from '../senriyama-indoor';
import { SENRIYAMA_OFFICIAL_ACCESS } from '../senriyama-official-access';
import { BARRIER_FREE_SOURCE, SENRIYAMA_BARRIER_FREE, SENRIYAMA_BF_CONNECTORS } from './senriyama';

const wings = new Map(SENRIYAMA_WINGS.map((w) => [w.id, w]));
const linkOf = new Map(SENRIYAMA_WING_BUILDINGS.map((l) => [l.wingId, l.buildingId]));

/** 棟がその建物の物か（実験棟は部屋のデータと同じく hitech-core の下にまとめている） */
function wingBelongsTo(wingId: string, buildingId: string): boolean {
  if (buildingId === 'hitech-core') return /^area4-x[1-6]$/.test(wingId);
  return linkOf.get(wingId) === buildingId;
}

/** 建物シートの概要（senriyama-official-access.ts）と同じ決め方で、事実の表から「自動扉の入口」を出す */
function autoDoorEntrance(b: BarrierFreeBuilding): AccessStatus {
  if (b.entrances.length > 0) return b.entrances.some((e) => e.door === 'auto') ? 'yes' : 'no';
  const ends = SENRIYAMA_BF_CONNECTORS.flatMap((c) => [c.from, c.to]).filter((end) => end.buildingId === b.buildingId);
  return ends.some((end) => end.door === 'auto') ? 'yes' : 'unknown';
}

describe('バリアフリーマップの事実（docs/indoor-plan.md 3 節の「大学が公開している物」）', () => {
  it('carries the source and its edition apart from the date it was checked', () => {
    expect(BARRIER_FREE_SOURCE).toMatchObject({ kind: 'university-public', edition: '2025年12月現在', checkedAt: '2026-11-20' });
    expect(BARRIER_FREE_SOURCE.url).toMatch(/^https:\/\/www\.kansai-u\.ac\.jp\//);
    for (const c of SENRIYAMA_BF_CONNECTORS) expect(c.verified.sourceId).toBe(BARRIER_FREE_SOURCE.id);
  });

  it('lists the 24 buildings of the map and the 4 it does not list, once each, on known landmark ids', () => {
    const ids = SENRIYAMA_BARRIER_FREE.map((b) => b.buildingId);
    expect(ids).toHaveLength(28);
    expect(new Set(ids).size).toBe(28);
    const landmarks = new Set(SENRIYAMA_LANDMARKS.map((l) => l.id));
    for (const id of ids) expect(landmarks.has(id), id).toBe(true);
    expect(SENRIYAMA_BARRIER_FREE.filter((b) => !b.listed).map((b) => b.buildingId)).toEqual([
      'ibunkan',
      'gaifukan',
      'seishikan-4',
      'kanbunkan',
    ]);
    const count = (pick: (b: BarrierFreeBuilding) => number) => SENRIYAMA_BARRIER_FREE.reduce((s, b) => s + pick(b), 0);
    expect(count((b) => b.entrances.length)).toBe(89);
    expect(count((b) => b.restrooms.length)).toBe(42);
    expect(count((b) => b.elevator.groups.length)).toBe(35);
    expect(SENRIYAMA_BF_CONNECTORS).toHaveLength(14);
  });

  it('keeps ids unique and puts no picture coordinates or copied text in the data', () => {
    const ids = [
      ...SENRIYAMA_BARRIER_FREE.flatMap((b) => [...b.entrances.map((e) => e.id), ...b.restrooms.map((r) => r.id)]),
      ...SENRIYAMA_BF_CONNECTORS.map((c) => c.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    const text = JSON.stringify([SENRIYAMA_BARRIER_FREE, SENRIYAMA_BF_CONNECTORS]);
    expect(text).not.toMatch(/"px"|"detail"|"description"|\.jpg/);
  });

  it('agrees with the building sheet summary (elevator, auto-door entrance, restroom)', () => {
    for (const b of SENRIYAMA_BARRIER_FREE) {
      const summary = SENRIYAMA_OFFICIAL_ACCESS[b.buildingId];
      if (!b.listed) {
        expect(summary, b.buildingId).toBeUndefined();
        continue;
      }
      expect(summary, b.buildingId).toBeDefined();
      if (!summary) continue;
      expect(b.elevator.exists, b.buildingId).toBe(summary.elevator);
      expect(b.elevator.groups.length > 0, b.buildingId).toBe(b.elevator.exists === 'yes');
      expect(autoDoorEntrance(b), b.buildingId).toBe(summary.autoDoorEntrance);
      expect(b.restrooms.length > 0 ? 'yes' : 'unknown', b.buildingId).toBe(summary.accessibleRestroom);
    }
  });

  it('uses wing ids of the same building and floors that the wing has', () => {
    for (const b of SENRIYAMA_BARRIER_FREE) {
      const items = [
        ...b.entrances.map((e) => ({ id: e.id, wingIds: e.wingId ? [e.wingId] : [], floors: e.floors })),
        ...b.restrooms.map((r) => ({ id: r.id, wingIds: r.wingId ? [r.wingId] : [], floors: r.floors })),
        ...b.elevator.groups.map((g, i) => ({ id: `${b.buildingId}-ev${i + 1}`, wingIds: g.wingIds, floors: g.stops ?? [] })),
      ];
      for (const item of items) {
        for (const wingId of item.wingIds) {
          const wing = wings.get(wingId);
          expect(wing, item.id).toBeDefined();
          expect(wingBelongsTo(wingId, b.buildingId), item.id).toBe(true);
          for (const floor of item.floors) expect(wing && wingHasFloor(wing, floor), `${item.id} ${floor}`).toBe(true);
        }
      }
    }
  });

  it('joins wings at floors they have, and matches the sheet connectors that share an id (P0a)', () => {
    const sheet = new Map(
      Object.values(SENRIYAMA_FLOOR_PLANS).flatMap((plan) => plan.connectors.map((c) => [c.id, c] as const)),
    );
    for (const c of SENRIYAMA_BF_CONNECTORS) {
      for (const end of [c.from, c.to]) {
        if (!end.wingId) continue;
        const wing = wings.get(end.wingId);
        expect(wing && wingBelongsTo(end.wingId, end.buildingId), `${c.id} ${end.wingId}`).toBe(true);
        expect(wing && wingHasFloor(wing, end.floor), `${c.id} ${end.floor}`).toBe(true);
      }
      const old = sheet.get(c.id);
      if (old) {
        expect([old.fromBuildingId, old.fromFloor, old.toBuildingId, old.toFloor], c.id).toEqual([
          c.from.buildingId,
          c.from.floor,
          c.to.buildingId,
          c.to.floor,
        ]);
      }
    }
    // シートの連絡（P0a の 7 件）は全部この表にある
    for (const id of sheet.keys()) expect(SENRIYAMA_BF_CONNECTORS.some((c) => c.id === id), id).toBe(true);
  });

  it('keeps the restricted restrooms marked (尚文館 7 階・図書館の書庫)', () => {
    const restricted = SENRIYAMA_BARRIER_FREE.flatMap((b) =>
      b.restrooms.filter((r) => r.restricted).map((r) => [b.buildingId, r.floors] as const),
    );
    expect(restricted).toEqual([
      ['shobunkan', [7]],
      ['library', [-2]],
    ]);
  });
});
