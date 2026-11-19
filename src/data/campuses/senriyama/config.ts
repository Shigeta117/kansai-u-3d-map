import { createProjectionOrigin } from '@/domain/projection';
import type { CampusConfig } from '@/domain/types';

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
      id: 'approach',
      label: '関大前→正門',
      description: '阪急関大前駅から関大前通りを抜けて正門へ',
      position: [-510, 155, 490],
      target: [-175, 22, 165],
    },
    {
      id: 'hobunzaka',
      label: '法文坂',
      description: '以文館・簡文館脇を抜け第1学舎へ上る名物の坂道',
      position: [-270, 155, 165],
      target: [-50, 46, -135],
    },
    {
      id: 'yukyu',
      label: '悠久の庭',
      description: '芝生の広場と凜風館の屋上緑化を望む中心エリア',
      position: [-110, 185, 225],
      target: [88, 36, -15],
    },
    {
      id: 'area4',
      label: '第4学舎',
      description: 'システム理工・環境都市工・化学生命工学部の理工系エリア',
      position: [390, 200, 270],
      target: [155, 34, 55],
    },
  ],
};

