import { describe, expect, it } from 'vitest';
import { AREA1_L1, AREA1_L1_TIERS, AREA1_L1_WING_ORDER } from '../data/indoor/l1/area1';
import { mergeL1Areas, type L1AreaDef } from './l1Areas';

const PUBLIC: L1AreaDef = {
  id: 'area1',
  title: '公開の図',
  graph: AREA1_L1,
  tiers: AREA1_L1_TIERS,
  order: AREA1_L1_WING_ORDER,
};

describe('mergeL1Areas（L1 の画面の学舎の表に手元だけの置き場を足す）', () => {
  it('置き場が空なら公開の表のまま（手元だけの印は付かない）', () => {
    const areas = mergeL1Areas([PUBLIC], {});
    expect(Object.keys(areas)).toEqual(['area1']);
    expect(areas.area1?.localOnly).toBeUndefined();
  });

  it('置き場のモジュールを id で足し、手元だけの印を付ける。notes も持ち越す', () => {
    const areas = mergeL1Areas([PUBLIC], {
      './private.local/l1-test.ts': {
        id: 'test-area',
        title: '試しの図',
        graph: AREA1_L1,
        tiers: AREA1_L1_TIERS,
        order: AREA1_L1_WING_ORDER,
        notes: ['注意書き'],
      },
    });
    expect(Object.keys(areas).sort()).toEqual(['area1', 'test-area']);
    expect(areas['test-area']?.localOnly).toBe(true);
    expect(areas['test-area']?.notes).toEqual(['注意書き']);
  });

  it('同じ id は手元の物で上書きする', () => {
    const areas = mergeL1Areas([PUBLIC], {
      './private.local/l1-area1.ts': { ...PUBLIC, title: '手元で足した図' },
    });
    expect(areas.area1?.title).toBe('手元で足した図');
    expect(areas.area1?.localOnly).toBe(true);
  });

  it('形の合わないモジュールは無視する', () => {
    const areas = mergeL1Areas([PUBLIC], {
      './private.local/l1-a.ts': { id: 'no-graph', title: '図が無い' },
      './private.local/l1-b.ts': { title: 'id が無い', graph: AREA1_L1, tiers: AREA1_L1_TIERS, order: [] },
      './private.local/l1-c.ts': {},
    });
    expect(Object.keys(areas)).toEqual(['area1']);
  });
});
