/** Selected effects adapted from globe effects.textClipping for the morphing canvas. */
export const ORB_LOOKS = [
  'base', 'reasoning-twins', 'searching-lighthouse', 'working-gyro',
  'working', 'waiting', 'compacting-squeeze',
] as const;
export type OrbLook = typeof ORB_LOOKS[number];
// Thinking, Searching, Analyzing, Composing; shared by both languages.
export const THINK_LOOKS: readonly OrbLook[] = [
  'reasoning-twins', 'searching-lighthouse', 'working-gyro', 'working',
];
const TAU = Math.PI * 2;
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => (1 - Math.cos(Math.PI * x)) / 2;

export function globePose(t: number, weights: readonly number[]) {
  const gyro = weights[3], squeeze = weights[6];
  const axis = t / 5 * TAU;
  const twist = Math.sin(t / 2.6 * TAU);
  return {
    pitch: 0.35 + gyro * 10 * Math.PI / 180 * Math.cos(axis),
    roll: gyro * 12 * Math.PI / 180 * Math.sin(axis),
    twist: (0.5 * gyro + squeeze) * twist,
    scale: 1 - squeeze * 0.12 * (0.5 + 0.5 * twist),
  };
}

export function globeLight(
  t: number, x: number, y: number, z: number,
  vx: number, vy: number, vz: number, weights: readonly number[],
) {
  let light = 0;
  for (let q = 0; q < ORB_LOOKS.length; q++) {
    if (weights[q] < 0.001) continue;
    let glow = 0;
    switch (ORB_LOOKS[q]) {
      case 'base':
        glow = 0.12 + 0.08 * Math.sin(t * 1.6 + y * 3);
        break;
      case 'reasoning-twins':
        // Two independent paths of light roam the sphere while it reasons.
        for (let w = 0; w < 2; w++) {
          const lon = t * (w ? 0.55 : 0.8) + w * 2.1;
          const lat = Math.sin(t * (w ? 0.42 : 0.5) + w * Math.PI / 2) * 0.9;
          const facing = x * Math.cos(lat) * Math.cos(lon) + y * Math.sin(lat) + z * Math.cos(lat) * Math.sin(lon);
          glow = Math.max(glow, clamp((facing - 0.72) / 0.28) ** 2);
        }
        break;
      case 'searching-lighthouse': {
        // A beam leaning 30 degrees with a fading quarter-turn trail.
        const across = vx * Math.cos(Math.PI / 6) - vy * Math.sin(Math.PI / 6);
        const toward = -Math.sin(0.35) * (vx * Math.sin(Math.PI / 6) + vy * Math.cos(Math.PI / 6)) + Math.cos(0.35) * vz;
        const off = Math.atan2(across, toward) - ((t / 2.5 % 1) * TAU - Math.PI);
        const angle = Math.atan2(Math.sin(off), Math.cos(off));
        const beam = angle < 0 ? clamp(1 + angle / (Math.PI / 2)) : Math.exp(-((angle / 0.45) ** 2));
        glow = beam * (0.25 + 0.75 * clamp(((vz + 1) / 2 - 0.4) / 0.3));
        break;
      }
      case 'working-gyro':
      case 'working': {
        // The source's 1.7s cycle: a ring descends for 1.2s, then releases.
        const cycle = t % 1.7;
        const at = 1.3 - 2.6 * ease(Math.min(1, cycle / 1.2));
        glow = cycle < 1.2 ? Math.exp(-(((y - at) / 0.2) ** 2)) : 0;
        break;
      }
      case 'waiting': {
        // A comet circles every 2s and descends from 70 north to 70 south.
        const head = t / 2 * TAU, ahead = TAU / 2;
        const latitude = Math.asin(Math.max(-1, Math.min(1, y)));
        const lon = Math.atan2(z, x);
        const off = Math.atan2(Math.sin(lon - head), Math.cos(lon - head));
        const along = off * Math.cos(latitude);
        const sample = ((t + off / ahead) % 6 + 6) % 6;
        const headLat = 70 * Math.PI / 180 * (1 - 2 * sample / 6);
        const fade = Math.min(1, 3 * Math.sin(Math.PI * (t % 6) / 6));
        glow = fade * (Math.exp(-(((latitude - headLat) / 0.28) ** 2)) * Math.exp(-((along / (off > 0 ? 0.12 : 1)) ** 2))) ** 0.6;
        break;
      }
      case 'compacting-squeeze':
        glow = Math.exp(-(((y - Math.sin(t / 2.6 * TAU)) / 0.22) ** 2));
        break;
    }
    light += glow * weights[q];
  }
  return clamp(light);
}
