import * as THREE from 'three';
import type { LightingTheme } from '@/domain/types';
import { SCENE_PALETTE } from './palette';

export class LightingRig {
  readonly group = new THREE.Group();
  private readonly hemiLight: THREE.HemisphereLight;
  private readonly sunLight: THREE.DirectionalLight;
  private readonly fillLight: THREE.DirectionalLight;

  constructor(isMobile: boolean) {
    this.group.name = 'lighting-rig';

    this.hemiLight = new THREE.HemisphereLight('#FFFDF7', '#BFAF9B', 0.92);
    this.group.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight('#FFF6E6', 1.65);
    this.sunLight.position.set(-340, 480, 320);
    this.sunLight.castShadow = true;

    const shadowSize = isMobile ? 1024 : 2048;
    this.sunLight.shadow.mapSize.set(shadowSize, shadowSize);
    this.sunLight.shadow.camera.near = 60;
    this.sunLight.shadow.camera.far = 1600;
    const d = 580;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.6;
    this.group.add(this.sunLight);

    this.fillLight = new THREE.DirectionalLight('#D2E2F2', 0.45);
    this.fillLight.position.set(360, 260, -320);
    this.group.add(this.fillLight);
  }

  applyTheme(theme: LightingTheme, scene: THREE.Scene): void {
    if (theme === 'day') {
      scene.background = new THREE.Color(SCENE_PALETTE.background.day);
      scene.fog = new THREE.Fog(SCENE_PALETTE.fog.day, 1150, 2400);
      this.hemiLight.color.set('#FFFDF7');
      this.hemiLight.groundColor.set('#BFAF9B');
      this.hemiLight.intensity = 0.94;
      this.sunLight.color.set('#FFF6E6');
      this.sunLight.intensity = 1.65;
      this.sunLight.position.set(-340, 480, 320);
      this.fillLight.color.set('#D2E2F2');
      this.fillLight.intensity = 0.48;
    } else {
      scene.background = new THREE.Color(SCENE_PALETTE.background.golden);
      scene.fog = new THREE.Fog(SCENE_PALETTE.fog.golden, 1050, 2250);
      this.hemiLight.color.set('#FFE0C2');
      this.hemiLight.groundColor.set('#7D6874');
      this.hemiLight.intensity = 0.85;
      this.sunLight.color.set('#FFB06E');
      this.sunLight.intensity = 1.95;
      this.sunLight.position.set(-520, 210, 260);
      this.fillLight.color.set('#96A8CF');
      this.fillLight.intensity = 0.55;
    }
  }
}

