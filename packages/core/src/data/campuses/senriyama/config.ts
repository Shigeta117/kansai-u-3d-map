import { createProjectionOrigin } from '../../../domain/projection';
import type { CampusConfig } from '../../../domain/types';

export const SENRIYAMA_CONFIG: CampusConfig = {
  id: 'senriyama',
  name: '関西大学 千里山キャンパス',
  shortName: '千里山キャンパス',
  subtitle: '大阪府吹田市山手町・千里丘陵の立体キャンパス',
  prefectureCity: '大阪府吹田市',
  origin: createProjectionOrigin(34.7745, 135.5105),
  bounds: {
    minX: -540,
    maxX: 580,
    minZ: -480,
    maxZ: 580,
  },
  diorama: {
    minX: -480,
    maxX: 530,
    minZ: -350,
    maxZ: 565,
    baseDepth: 22,
  },
  verticalExaggeration: 1.35,
  cameraPresets: [
    {
      id: 'overview',
      label: '全体俯瞰',
      description: '関大前駅から千里丘陵のキャンパス全体を見渡す',
      position: [-530, 455, 650],
      target: [-35, 34, 65],
    },
    {
      id: 'west-access',
      label: '西門・新アクセス路',
      description: '関大前駅北口からエスカレーター上屋・第3学舎・秀麗橋高架を望む',
      position: [-435, 145, 425],
      target: [-215, 25, 195],
    },
    {
      id: 'approach',
      label: '関大前→正門',
      description: '関大前通りを抜けて正門・新関西大学会館へ向かう定番ルート',
      position: [-470, 155, 455],
      target: [-140, 26, 135],
    },
    {
      id: 'hobunzaka',
      label: '法文坂・秀麗橋',
      description: '秀麗橋高架から以文館・簡文館脇を抜け第1学舎高台へ',
      position: [-265, 165, 195],
      target: [-55, 42, -90],
    },
    {
      id: 'yukyu',
      label: '悠久の庭・凜風館',
      description: '芝生の広場と凜風館の段丘屋上緑化・総合図書館を望む中心エリア',
      position: [-110, 185, 225],
      target: [88, 36, -15],
    },
    {
      id: 'area4',
      label: '第4学舎（理工）',
      description: 'システム理工・環境都市工・化学生命工学部の理工系エリア',
      position: [390, 200, 270],
      target: [155, 34, 55],
    },
  ],
};

