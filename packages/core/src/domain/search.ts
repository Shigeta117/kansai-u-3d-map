import type { BuildingFloorPlan, LocationSearchItem } from './indoor-types';
import type { BuildingCategory, BuildingFeature, FacilityTag } from './types';
import { findWing, wingFloorsText, wingLabel, wingSearchAliases, wingTitle, type Wing } from './wings';

export interface CategoryFilterOption {
  id: BuildingCategory | 'all';
  label: string;
  shortLabel: string;
  color: string;
}

export const CATEGORY_OPTIONS: CategoryFilterOption[] = [
  { id: 'all', label: 'すべて', shortLabel: 'すべて', color: '#1B365D' },
  { id: 'area1', label: '第1学舎（法・文）', shortLabel: '第1学舎', color: '#BC5D42' },
  { id: 'area2', label: '第2学舎（経・商）', shortLabel: '第2学舎', color: '#D9A760' },
  { id: 'area3', label: '第3学舎（社会）', shortLabel: '第3学舎', color: '#438990' },
  { id: 'area4', label: '第4学舎（理工）', shortLabel: '第4学舎', color: '#3E6FA8' },
  { id: 'shared', label: '共用・学生施設', shortLabel: '学生施設', color: '#E3B76B' },
  { id: 'heritage', label: '図書館・歴史', shortLabel: '図書館・歴史', color: '#9E4B39' },
  { id: 'sports', label: '体育・体育館', shortLabel: '体育施設', color: '#5D8E6D' },
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

export function expandRoomRange(
  prefix: string,
  start: number,
  end: number,
  padWidth = 0,
): string[] {
  const out: string[] = [];
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  for (let n = lo; n <= hi; n++) {
    const numStr = padWidth > 0 ? String(n).padStart(padWidth, '0') : String(n);
    out.push(`${prefix}${numStr}`);
  }
  return out;
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
    const label = normalizeSearchText(FACILITY_TAG_LABELS[tag] ?? '');
    if (label.includes(normalizedQuery)) {
      score += 20;
      break;
    }
  }

  if (score > 0 && building.landmarkId) {
    score += Math.max(1, 10 - building.labelPriority);
  }

  return score;
}

export function searchBuildings(
  buildings: BuildingFeature[],
  query: string,
  categoryFilter: BuildingCategory | 'all' = 'all',
): BuildingFeature[] {
  const normalized = normalizeSearchText(query);

  const candidates = buildings.filter((b) => {
    if (!isSearchableBuilding(b)) return false;
    if (categoryFilter !== 'all' && b.category !== categoryFilter) return false;
    return true;
  });

  const scored = candidates
    .map((b) => ({ building: b, score: scoreBuildingMatch(b, normalized) }))
    .filter((entry) => entry.score > 0);

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.building.labelPriority - b.building.labelPriority;
  });

  return scored.map((s) => s.building);
}

/**
 * 棟の名前で検索したときの点数（0 は当たらない）。名前がそのまま一致すれば 140（部屋の番号の一致 142 のすぐ下で、
 * 棟の名前を含む部屋〈64〉より上）、2 文字以上の頭の一致は 85。学舎の名前（'第3学舎'）だけでは棟を出さない
 * （建物の候補の下に 4 棟が並ばないように）
 */
export function scoreWingMatch(wing: Wing, normalizedQuery: string): number {
  if (normalizedQuery.length < 2) return 0;
  const school = normalizeSearchText(wing.school);
  let best = 0;
  for (const alias of wingSearchAliases(wing)) {
    const a = normalizeSearchText(alias);
    if (a === normalizedQuery) return 140;
    if (a.startsWith(normalizedQuery)) {
      const onlySchoolName = school.length > 0 && a.startsWith(school) && normalizedQuery.length <= school.length;
      if (!onlySchoolName) best = Math.max(best, 85);
    }
  }
  return best;
}

export function searchLocationItems(
  buildings: BuildingFeature[],
  floorPlans: Record<string, BuildingFloorPlan>,
  query: string,
  categoryFilter: BuildingCategory | 'all' = 'all',
): LocationSearchItem[] {
  const normalized = normalizeSearchText(query);
  const buildingMap = new Map<string, BuildingFeature>();
  for (const b of buildings) {
    buildingMap.set(b.id, b);
  }

  const matchedBuildings = searchBuildings(buildings, query, categoryFilter);
  const items: { item: LocationSearchItem; score: number }[] = matchedBuildings.map(
    (b) => ({
      item: {
        key: `building:${b.id}`,
        kind: 'building',
        buildingId: b.id,
        title: b.name,
        subtitle:
          b.faculties.length > 0
            ? `${getCategoryLabel(b.category)} ・ ${b.faculties.join(' / ')}`
            : getCategoryLabel(b.category),
        category: b.category,
        groundY: b.groundY,
        walkNodeId: b.walkNodeId,
        accessibleWalkNodeId: b.accessibleWalkNodeId,
      },
      score: scoreBuildingMatch(b, normalized) + 5,
    }),
  );

  if (normalized.length > 0) {
    // 建物の中の棟（第3学舎の A〜D棟など）。選ぶとその棟を選んだ状態で開く
    for (const b of matchedBuildingsForWings(buildings, categoryFilter)) {
      for (const wing of b.wings ?? []) {
        const score = scoreWingMatch(wing, normalized);
        if (score <= 0) continue;
        items.push({
          item: {
            key: `wing:${b.id}:${wing.id}`,
            kind: 'building',
            buildingId: b.id,
            wingId: wing.id,
            wing: wingLabel(wing),
            title: wingTitle(wing),
            subtitle: `${getCategoryLabel(b.category)} ・ ${wingFloorsText(wing)}`,
            category: b.category,
            groundY: b.groundY,
            walkNodeId: b.walkNodeId,
            accessibleWalkNodeId: b.accessibleWalkNodeId,
          },
          score,
        });
      }
    }

    for (const plan of Object.values(floorPlans)) {
      const b = buildingMap.get(plan.buildingId);
      if (!b) continue;
      if (categoryFilter !== 'all' && b.category !== categoryFilter) continue;

      const planWingNorm = normalizeSearchText(plan.wingLabel ?? '');

      for (const room of plan.rooms) {
        const code = normalizeSearchText(room.code);
        const rName = normalizeSearchText(room.name);
        const rNote = normalizeSearchText(room.note ?? '');
        const rWing = normalizeSearchText(room.wing ?? '');
        const floorLabel = room.floor < 0 ? `b${Math.abs(room.floor)}f` : `${room.floor}f`;

        let roomScore = 0;
        let matchedSpecificCode: string | undefined;

        if (room.searchableCodes && room.searchableCodes.length > 0) {
          const exactCode = room.searchableCodes.find(
            (c) => normalizeSearchText(c) === normalized,
          );
          if (exactCode) {
            roomScore = 142;
            matchedSpecificCode = exactCode;
          } else {
            const prefixCode = room.searchableCodes.find((c) =>
              normalizeSearchText(c).startsWith(normalized),
            );
            if (prefixCode && normalized.length >= 2) {
              roomScore = 94;
              matchedSpecificCode = prefixCode;
            }
          }
        }

        if (roomScore === 0) {
          if (code === normalized || rName === normalized) {
            roomScore = 136;
          } else if (code.startsWith(normalized) || rName.startsWith(normalized)) {
            roomScore = 96;
          } else if (
            code.includes(normalized) ||
            rName.includes(normalized) ||
            rNote.includes(normalized) ||
            rWing.includes(normalized) ||
            planWingNorm.includes(normalized) ||
            floorLabel === normalized
          ) {
            roomScore = 64;
          }
        }

        if (roomScore > 0) {
          const floorText = room.floor < 0 ? `B${Math.abs(room.floor)}F` : `${room.floor}F`;
          const baseTitle = room.name.includes(room.code)
            ? room.name
            : `${room.code} ${room.name}`.trim();
          const title =
            matchedSpecificCode && matchedSpecificCode !== room.code
              ? `${matchedSpecificCode}（${baseTitle}）`
              : baseTitle;
          const subtitle = room.wing
            ? `${b.shortName}（${room.wing}）・${floorText}`
            : `${b.shortName} ・ ${floorText}`;

          items.push({
            item: {
              key: `room:${b.id}:${room.id}`,
              kind: 'room',
              buildingId: b.id,
              title,
              subtitle,
              category: b.category,
              floor: room.floor,
              wing: room.wing,
              ...(findWing(b, room.wingId) ? { wingId: room.wingId } : {}),
              roomCode: matchedSpecificCode ?? room.code,
              groundY: b.groundY,
              walkNodeId: b.walkNodeId,
              accessibleWalkNodeId: b.accessibleWalkNodeId,
            },
            score: roomScore,
          });
        }
      }
    }
  }

  items.sort((a, b) => b.score - a.score);
  return items.map((x) => x.item);
}

/** 棟を持つ建物（検索の対象で、カテゴリの絞り込みに合う物） */
function matchedBuildingsForWings(
  buildings: BuildingFeature[],
  categoryFilter: BuildingCategory | 'all',
): BuildingFeature[] {
  return buildings.filter(
    (b) =>
      (b.wings?.length ?? 0) > 0 &&
      isSearchableBuilding(b) &&
      (categoryFilter === 'all' || b.category === categoryFilter),
  );
}
