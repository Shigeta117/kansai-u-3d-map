import type * as THREE from 'three';
import type { BuildingFeature } from '../../domain/types';

/**
 * 主役の建物（ヒーロー）を、OSM の輪郭の押し出しの代わりに専用の形で組むための約束事。
 *
 * - 座標はシーンのローカル座標（単位 m）。+X が東、-Z が北、+Y が上
 * - 建物の高さ（m）は強調しない。地形の高さだけが強調率つきで表示上の高さ（groundVisualY）になる
 * - 返す group は原点に置かれたまま使われる（ワールド座標で組む）。回転・移動を group 自体に掛けてもよい
 */
export interface HeroBuildContext {
  /** OSM の輪郭（polygon: [x, z][]）・重心（centroid）・高さ（height, m）・階数（levels）など */
  building: BuildingFeature;
  /** 建物の地面の表示上の高さ（重心の標高から計算した値） */
  groundVisualY: number;
  /**
   * 任意の地点 (x, z) の地面の表示上の高さ（地形の標高を強調率つきで換算した値）。
   * 斜面の上で階段や足元が浮かない・埋まらないように、置く地点ごとに引く。
   * 地形が無いとき（書き出しなど）は常に groundVisualY を返す
   */
  sampleGroundVisualY: (x: number, z: number) => number;
}

export interface HeroBuildResult {
  /** 建物を構成するメッシュをまとめた group（すべてのメッシュが選択の当たり判定の対象になる） */
  group: THREE.Group;
  /** 主な材質（外壁など）。baseHex はその材質の元の色。選択の見た目と薄める処理には使わない（建物全体の殻と group の全部の材質を使う） */
  primaryMaterials: { mat: THREE.MeshStandardMaterial; baseHex: string }[];
  /** 回転などのアニメーションをする物（無ければ空配列） */
  animated: THREE.Object3D[];
}

export type HeroBuilder = (ctx: HeroBuildContext) => HeroBuildResult;
