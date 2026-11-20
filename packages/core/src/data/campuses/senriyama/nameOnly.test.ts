import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BuildingFeature } from '../../../domain/types';

const buildings = JSON.parse(
  readFileSync(new URL('../../../../../../public/data/senriyama/buildings.json', import.meta.url), 'utf8'),
) as BuildingFeature[];

describe('中学校・高等学校・幼稚園の施設は名称だけを出す', () => {
  const nameOnly = buildings.filter((b) => b.infoPolicy === 'name-only');

  it('一中・一高・秀麗館・幼稚園の 4 件が name-only になっている', () => {
    expect(nameOnly.map((b) => b.name).sort()).toEqual(
      ['秀麗館', '関西大学幼稚園', '関西大学第一中学校', '関西大学第一高等学校'].sort(),
    );
  });

  it('説明は空で、検索の語は名前と略称だけ（用途などを含まない）', () => {
    const allowed = new Set(['一高', '関大一高', '一中', '関大一中']);
    for (const b of nameOnly) {
      expect(b.description).toBe('');
      for (const k of b.keywords) {
        expect(k === b.name || allowed.has(k)).toBe(true);
      }
      expect(b.faculties).toEqual([]);
      expect(b.facilityTags).toEqual([]);
    }
  });
});
