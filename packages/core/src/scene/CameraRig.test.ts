import { describe, expect, it } from 'vitest';
import { SENRIYAMA_CONFIG } from '../data/campuses/senriyama/config';
import {
  clampTargetToDiorama,
  formatCameraParam,
  parseCameraParam,
} from './CameraRig';

describe('camera param parsing and formatting', () => {
  it('parses valid 6-number comma-separated cam parameter', () => {
    expect(parseCameraParam('-430,420.5,540,25,38.2,-15')).toEqual({
      position: [-430, 420.5, 540],
      target: [25, 38.2, -15],
    });
  });

  it('trims whitespace around numbers', () => {
    expect(parseCameraParam(' -100 , 200 , 300 , 10 , 20 , 30 ')).toEqual({
      position: [-100, 200, 300],
      target: [10, 20, 30],
    });
  });

  it('ignores invalid, missing, empty, or degenerate values', () => {
    expect(parseCameraParam(null)).toBeUndefined();
    expect(parseCameraParam('')).toBeUndefined();
    expect(parseCameraParam('1,2,3,4,5')).toBeUndefined();
    expect(parseCameraParam('1,2,3,4,5,6,7')).toBeUndefined();
    expect(parseCameraParam('1,2,3,,,')).toBeUndefined();
    expect(parseCameraParam('1,2,foo,4,5,6')).toBeUndefined();
    expect(parseCameraParam('1,2,Infinity,4,5,6')).toBeUndefined();
    expect(parseCameraParam('1,2,NaN,4,5,6')).toBeUndefined();
    expect(parseCameraParam('10,20,30,10,20,30')).toBeUndefined();
  });

  it('formats camera pose as cam= query fragment and avoids -0.0', () => {
    expect(formatCameraParam([-430.04, 420.16, 540], [-0.01, 38, 25])).toBe(
      'cam=-430.0,420.2,540.0,0.0,38.0,25.0',
    );
  });

  it('roundtrips formatted param through parseCameraParam', () => {
    const param = formatCameraParam([-110.4, 185.2, 225.8], [88.1, 36.0, -15.3]);
    expect(param.startsWith('cam=')).toBe(true);
    const parsed = parseCameraParam(param.slice(4));
    expect(parsed).toEqual({
      position: [-110.4, 185.2, 225.8],
      target: [88.1, 36, -15.3],
    });
  });
});

describe('clampTargetToDiorama', () => {
  it('clamps target coordinates to 40m inside the diorama bounds', () => {
    const diorama = SENRIYAMA_CONFIG.diorama;

    expect(clampTargetToDiorama({ x: 0, y: 30, z: 50 }, diorama)).toEqual({
      x: 0,
      y: 30,
      z: 50,
    });

    expect(clampTargetToDiorama({ x: -600, y: -20, z: -500 }, diorama)).toEqual({
      x: -440,
      y: -5,
      z: -310,
    });

    expect(clampTargetToDiorama({ x: 700, y: 200, z: 700 }, diorama)).toEqual({
      x: 490,
      y: 140,
      z: 525,
    });
  });

  it('keeps every Senriyama camera preset target inside the clamped diorama range', () => {
    for (const preset of SENRIYAMA_CONFIG.cameraPresets) {
      const [tx, ty, tz] = preset.target;
      const clamped = clampTargetToDiorama(
        { x: tx, y: ty, z: tz },
        SENRIYAMA_CONFIG.diorama,
      );
      expect(clamped).toEqual({ x: tx, y: ty, z: tz });
    }
  });
});
