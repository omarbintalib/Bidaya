export type WaypointCircle = { x: number; y: number; radius: number };
export function connectWaypoints(a: WaypointCircle, b: WaypointCircle, vertical: boolean, bend = 1) {
  if (vertical) {
    const direction = Math.sign(b.y - a.y) || 1;
    const start = { x: a.x, y: a.y + a.radius * direction };
    const end = { x: b.x, y: b.y - b.radius * direction };
    const distance = (end.y - start.y) / 3;
    const bulge = Math.min(28, Math.abs(distance) * .6) * bend;
    return { start, end, path: `M${start.x} ${start.y}C${start.x + bulge} ${start.y + distance} ${end.x + bulge} ${end.y - distance} ${end.x} ${end.y}` };
  }
  const direction = Math.sign(b.x - a.x) || 1;
  const start = { x: a.x + a.radius * direction, y: a.y };
  const end = { x: b.x - b.radius * direction, y: b.y };
  const middle = (start.x + end.x) / 2;
  return { start, end, path: `M${start.x} ${start.y}C${middle} ${start.y} ${middle} ${end.y} ${end.x} ${end.y}` };
}
