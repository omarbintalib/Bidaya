import { describe, expect, it } from 'vitest';
import { km, pathKm, roundKm } from './geo';

describe('distances', () => {
  it('measures great-circle distance', () => {
    // Makkah (al-Masjid al-Haram) to al-Madinah: about 340 km in a straight line.
    const d = km({ lat: 21.4225, lon: 39.8262 }, { lat: 24.4672, lon: 39.6111 });
    expect(d).toBeGreaterThan(330); expect(d).toBeLessThan(345);
  });
  it('adds up a path and rounds for reading', () => {
    expect(pathKm([[39.8262, 21.4225], [39.6111, 24.4672], [39.8262, 21.4225]])).toBeCloseTo(2 * km({ lat: 21.4225, lon: 39.8262 }, { lat: 24.4672, lon: 39.6111 }), 6);
    expect(roundKm(337)).toBe(340); expect(roundKm(1234)).toBe(1250);
  });
});
