import type { BuildingCategory, BuildingFeature, FacilityTag } from './types';

export interface CategoryFilterOption {
  id: BuildingCategory | 'all';
  label: string;
  shortLabel: string;
  color: string;
}

export const CATEGORY_OPTIONS: CategoryFilterOption[] = [
  { id: 'all', label: 'すべて', shortLabel: 'すべて', color: '#1B365D' },
  { id: 'area1', label: '第1学舎（法・文）', shortLabel: '第1学舎', color: '#C86D51' },
  { id: 'area2', label: '第2学舎（経・商）', shortLabel: '第2学舎', color: '#D99B4E' },
  { id: 'area3', label: '第3学舎（社会）', shortLabel: '第3学舎', color: '#56949B' },
  { id: 'area4', label: '第4学舎（理工）', shortLabel: '第4学舎', color: '#4B7BB5' },
  { id: 'shared', label: '共用・学生施設', shortLabel: '学生施設', color: '#E3B76B' },
  { id: 'heritage', label: '歴史・図書館', shortLabel: '図書館・歴史', color: '#A85440' },
  { id: 'sports', label: '体育・体育館', shortLabel: '体育施設', color: '#6D9C7A' },
  { id: 'gate', label: '門・関大前駅', shortLabel: '門・駅', color: '#6B2336' },
];

export const FACILITY_TAG_LABELS: Record<FacilityTag, string> = {
  cafeteria: '食堂・カフェ',
  library: '図書館',
  study: '自習・ラーニング',
  museum: '博物館・展示',
  hall: '大ホール・講堂',
  admin: '事務・案内',
  station: '駅',
  gate: '門・入口',
  gym: '体育館・スポーツ',
  architecture: '村野藤吾建築',
};

export function getCategoryLabel(category: BuildingCategory): string {
  const found = CATEGORY_OPTIONS.find((opt) => opt.id === category);
  if (found) return found.label;
  if (category === 'other') return 'その他施設';
  return '周辺街区';
}

export function normalizeSearchText(input: string): string {
  return input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u30a1-\u30f6]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0x60),
    )
    .replace(/\s+/g, '')
    .trim();
}

export function isSearchableBuilding(b: BuildingFeature): boolean {
  if (b.category === 'surrounding') return false;
  return Boolean(b.landmarkId || b.name.trim().length > 0);
}

export function scoreBuildingMatch(
  building: BuildingFeature,
  normalizedQuery: string,
): number {
  if (!normalizedQuery) {
    return (building.landmarkId ? 50 : 10) + Math.max(0, 12 - building.labelPriority);
  }

  const name = normalizeSearchText(building.name);
  const shortName = normalizeSearchText(building.shortName);
  const kana = normalizeSearchText(building.kana);
  const english = normalizeSearchText(building.englishName);

  let score = 0;

  if (name === normalizedQuery || shortName === normalizedQuery || kana === normalizedQuery) {
    score += 120;
  } else if (
    name.startsWith(normalizedQuery) ||
    shortName.startsWith(normalizedQuery) ||
    kana.startsWith(normalizedQuery)
  ) {
    score += 80;
  } else if (
    name.includes(normalizedQuery) ||
    shortName.includes(normalizedQuery) ||
    kana.includes(normalizedQuery) ||
    english.includes(normalizedQuery)
  ) {
    score += 55;
  }

  for (const faculty of building.faculties) {
    if (normalizeSearchText(faculty).includes(normalizedQuery)) {
      score += 30;
      break;
    }
  }

  for (const kw of building.keywords) {
    if (normalizeSearchText(kw).includes(normalizedQuery)) {
      score += 25;
      break;
    }
  }

  for (const tag of building.facilityTags) {
    const tagLabel = normalizeSearchText(FACILITY_TAG_LABELS[tag]);
    if (tagLabel.includes(normalizedQuery) || tag.includes(normalizedQuery)) {
      score += 22;
      break;
    }
  }

  if (normalizeSearchText(building.description).includes(normalizedQuery)) {
    score += 10;
  }

  if (score === 0) return 0;

  if (building.landmarkId) score += 12;
  score += Math.max(0, 10 - building.labelPriority);

  return score;
}

export function searchBuildings(
  buildings: BuildingFeature[],
  query: string,
  categoryFilter: BuildingCategory | 'all' = 'all',
): BuildingFeature[] {
  const normalized = normalizeSearchText(query);
  const scored: { building: BuildingFeature; score: number }[] = [];

  for (const b of buildings) {
    if (!isSearchableBuilding(b)) continue;
    if (categoryFilter !== 'all' && b.category !== categoryFilter) continue;

    const score = scoreBuildingMatch(b, normalized);
    if (score > 0) {
      scored.push({ building: b, score });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.building.labelPriority !== b.building.labelPriority) {
      return a.building.labelPriority - b.building.labelPriority;
    }
    return a.building.name.localeCompare(b.building.name, 'ja');
  });

  return scored.map((s) => s.building);
}
