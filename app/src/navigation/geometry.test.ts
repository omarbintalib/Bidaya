import { expect, it } from 'vitest';
import { connectWaypoints, type WaypointCircle } from './waypointGeometry';
import { reconstructionOpacity, RECONSTRUCTION_BANDS } from './LogoTransition';

it('reconstructs seven fixed sections in right-to-left order and completes by 500ms', () => {
  const bands = [...RECONSTRUCTION_BANDS].reverse();
  expect(bands[0].x).toBe(0);
  expect(bands.at(-1)!.x + bands.at(-1)!.width).toBe(1407);
  expect(bands.reduce((total, band) => total + band.width, 0)).toBe(1407);
  bands.slice(1).forEach((band, i) => expect(band.x).toBe(bands[i].x + bands[i].width));
  for (const elapsed of [0,60,140,250,360,499,500,600]) {
    const opacity = RECONSTRUCTION_BANDS.map((_, i) => reconstructionOpacity(i, elapsed));
    opacity.slice(1).forEach((value, i) => expect(value).toBeLessThanOrEqual(opacity[i]));
    if (elapsed >= 500) expect(opacity).toEqual(Array(7).fill(1));
  }
});
it.each([false,true])('meets every outer circle border in both languages (vertical=%s)', vertical => {
  for (const rtl of [false,true]) for (const width of [280, 900, 1600]) {
    const circles: WaypointCircle[] = vertical ? [{x:width/2,y:70,radius:12},{x:width/2,y:240,radius:12},{x:width/2,y:460,radius:12}] : [{x:width/6,y:112,radius:12},{x:width/2,y:170,radius:12},{x:width*5/6,y:112,radius:12}];
    if (rtl && !vertical) circles.reverse();
    circles.slice(0,2).forEach((circle, i) => {
      const next = circles[i + 1], segment = connectWaypoints(circle, next, vertical, (rtl ? -1 : 1) * (i ? -1 : 1));
      expect(Math.hypot(segment.start.x-circle.x, segment.start.y-circle.y)).toBeCloseTo(circle.radius);
      expect(Math.hypot(segment.end.x-next.x, segment.end.y-next.y)).toBeCloseTo(next.radius);
    });
  }
});
