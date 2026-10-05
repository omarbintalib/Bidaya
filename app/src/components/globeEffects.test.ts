import { describe, expect, it } from 'vitest';
import { ORB_LOOKS, globeLight, globePose } from './globeEffects';

describe('selected globe effects', () => {
  it('keeps projection and lighting finite across the poles and cycle boundaries', () => {
    for (let state = 0; state < ORB_LOOKS.length; state++) {
      const weights = ORB_LOOKS.map((_, i) => i === state ? 1 : 0);
      for (const t of [0, 0.6, 1.2, 1.7, 2.5, 2.6, 5.999, 6, 13]) {
        const pose = globePose(t, weights);
        Object.values(pose).forEach(value => expect(Number.isFinite(value)).toBe(true));
        expect(pose.scale).toBeGreaterThan(0.8);
        for (const [x, y, z] of [[0, 1, 0], [0, -1, 0], [1, 0, 0], [0, 0, 1]]) {
          const light = globeLight(t, x, y, z, x, y, z, weights);
          expect(light).toBeGreaterThanOrEqual(0);
          expect(light).toBeLessThanOrEqual(1);
        }
      }
    }
  });
  it('uses distinct geometry for gyro and squeeze and blends it without jumping', () => {
    const base = [1, 0, 0, 0, 0, 0, 0];
    const gyro = [0, 0, 0, 1, 0, 0, 0];
    const squeeze = [0, 0, 0, 0, 0, 0, 1];
    expect(globePose(0.65, gyro).roll).not.toBe(0);
    expect(globePose(0.65, squeeze).scale).toBeCloseTo(0.88);
    const halfway = globePose(0.65, [0.5, 0, 0, 0.5, 0, 0, 0]);
    expect(halfway.roll).toBeCloseTo((globePose(0.65, base).roll + globePose(0.65, gyro).roll) / 2);
  });
});
