import { BOX, COS, HEIGHT, K, WIDTH } from '../data/land';

export { HEIGHT, WIDTH };
export const project = (lon: number, lat: number): [number, number] => [(lon - BOX.west) * COS * K, (BOX.north - lat) * K];

export interface View { x: number; y: number; w: number; h: number }

/** A view covering the given lon/lat bounds, padded and fitted to an aspect ratio (width / height). */
export function fit(west: number, east: number, south: number, north: number, aspect: number, pad = 0.12): View {
  const [x0, y0] = project(west, north), [x1, y1] = project(east, south);
  let w = (x1 - x0) * (1 + pad * 2), h = (y1 - y0) * (1 + pad * 2);
  if (w / h > aspect) h = w / aspect; else w = h * aspect;
  return clampView({ x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h });
}

/** The closest zoom: about 4° of longitude across, so a view always shows places around the one in focus. */
export const MIN_W = 150;
export function clampView(v: View): View {
  const aspect = v.w / v.h;
  let w = Math.min(Math.max(v.w, MIN_W), WIDTH), h = w / aspect;
  if (h > HEIGHT) { h = HEIGHT; w = h * aspect; }
  // A size limit keeps the view's centre, so zooming against it never drifts away from what was in view.
  const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
  // Stay inside the drawn area so the edge of the land data never shows.
  const x = w >= WIDTH ? (WIDTH - w) / 2 : Math.min(Math.max(cx - w / 2, 0), WIDTH - w);
  const y = h >= HEIGHT ? (HEIGHT - h) / 2 : Math.min(Math.max(cy - h / 2, 0), HEIGHT - h);
  return { x, y, w, h };
}

/** The default view: the whole peninsula with its neighbours, so the regions of the time read at a glance. */
export const homeView = (aspect: number) => fit(34, 50, 14, 32, aspect, 0.02);
export const centerOn = (v: View, lon: number, lat: number, w = v.w): View => {
  const [x, y] = project(lon, lat), h = w / (v.w / v.h);
  return clampView({ x: x - w / 2, y: y - h / 2, w, h });
};
