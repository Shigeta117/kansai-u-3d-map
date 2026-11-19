import { describe, expect, it } from 'vitest';
import { normalizeSearchText, searchBuildings } from './search';
import type { BuildingFeature } from './types';

function makeBuilding(partial: Partial<BuildingFeature>): BuildingFeature {
  return {
    id: 'b1',
    name: 'テスト棟',
    shortName: 'テスト',
    kana: 'てすと',
    englishName: 'Test Bldg',
    category: 'shared',
    inCampus: true,
    faculties: [],
    facilityTags: [],
    keywords: [],
    description: '',
    sculptStyle: 'standard',
    labelPriority: 5,
    polygon: [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ],
    centroid: { x: 5, z: 5 },
    groundY: 30,
    minGroundY: 30,
    maxGroundY: 30,
    height: 15,
    levels: 4,
    walkNodeId: 'n_1',
    ...partial,
  };
}

describe('search', () => {
  const sample: BuildingFeature[] = [
    makeBuilding({
      id: 'rimpukan',
      landmarkId: 'rimpukan',
      name: '凜風館（総合学生会館）',
      shortName: '凜風館',
      kana: 'りんぷうかん',
      category: 'shared',
      facilityTags: ['cafeteria', 'study'],
      keywords: ['学食', '食堂', '生協'],
      labelPriority: 1,
    }),
    makeBuilding({
      id: 'area4-1',
      landmarkId: 'area4-1',
      name: '第4学舎 1号館',
      shortName: '第4学舎1号館',
      kana: 'だいよんがくしゃ',
      category: 'area4',
      faculties: ['システム理工学部', '環境都市工学部'],
      labelPriority: 2,
    }),
    makeBuilding({
      id: 'house',
      name: '',
      shortName: '',
      category: 'surrounding',
      inCampus: false,
      labelPriority: 99,
    }),
  ];

  it('normalizes katakana and full-width digits', () => {
    expect(normalizeSearchText('リンプウカン')).toBe('りんぷうかん');
    expect(normalizeSearchText('第４学舎')).toBe('第4学舎');
  });

  it('matches by katakana reading, faculty, and facility keyword, excluding surrounding houses', () => {
    expect(searchBuildings(sample, 'リンプウ').map((b) => b.id)).toEqual(['rimpukan']);
    expect(searchBuildings(sample, '学食').map((b) => b.id)).toEqual(['rimpukan']);
    expect(searchBuildings(sample, 'システム理工').map((b) => b.id)).toEqual(['area4-1']);
    expect(searchBuildings(sample, '').map((b) => b.id)).toEqual(['rimpukan', 'area4-1']);
  });

  it('filters by category', () => {
    expect(searchBuildings(sample, '', 'area4').map((b) => b.id)).toEqual(['area4-1']);
  });
});

