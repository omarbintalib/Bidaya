"""Build the map's terrain from Natural Earth (public domain), in the same projection as src/data/land.ts.

Writes:
  public/map/relief.webp   shaded relief (Natural Earth SR_HR, 1:10m) as soft brown shadows only: sunlit slopes and
                           flat ground stay clear, so the land keeps its own colour (a paler land made the map glare)
  public/map/wash.webp     soft washes on the land: sand seas, fertile lands, and a shade just inside the coast
  public/map/depth.webp    the sea's depth: a slight darkening offshore (the sea keeps its colour at the coast)
  src/data/terrain.ts      outlines of the sand seas (for their dune texture), rivers and lakes
The soft layers are baked into images because a browser redraws an SVG on every frame of a pan or zoom, and wide
blurred strokes along a long coastline are slow to draw; an image costs almost nothing to move.

Only what existed in the 7th century is kept: modern canals (Suez, Ismailiya, Hindiyah, Gharraf) and modern
reservoirs (Nasser, Assad, Tharthar, Habbaniyah, Razazah...) are left out.

Run (needs Pillow, numpy and scipy):
  mkdir -p /tmp/ne && cd /tmp/ne
  curl -O https://naciscdn.org/naturalearth/10m/raster/SR_HR.zip && unzip SR_HR.zip
  for f in ne_10m_geography_regions_polys ne_10m_rivers_lake_centerlines ne_10m_lakes; do
    curl -O https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/$f.geojson; done
  python3 scripts/build-terrain.py /tmp/ne
"""
import json, math, re, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/ne')
APP = Path(__file__).resolve().parent.parent
BOX = dict(west=28, east=60, south=4, north=38)   # as scripts/build-land.mjs
K = 40
COS = math.cos(math.radians((BOX['south'] + BOX['north']) / 2))
WIDTH, HEIGHT = (BOX['east'] - BOX['west']) * COS * K, (BOX['north'] - BOX['south']) * K
SCALE = 1.25  # relief pixels per map unit: sharp enough when zoomed in, small enough to load fast

def project(lon, lat):
    return ((lon - BOX['west']) * COS * K, (BOX['north'] - lat) * K)

# --- Relief -------------------------------------------------------------------------------------------------
Image.MAX_IMAGE_PIXELS = None
sr = Image.open(SRC / 'SR_HR.tif')                       # 21600 x 10800, 60 px per degree, from -180 / 90
ppd = sr.size[0] / 360
crop = sr.crop((round((BOX['west'] + 180) * ppd), round((90 - BOX['north']) * ppd),
                round((BOX['east'] + 180) * ppd), round((90 - BOX['south']) * ppd)))
crop = crop.resize((round(WIDTH * SCALE), round(HEIGHT * SCALE)), Image.LANCZOS)
v = np.asarray(crop).astype(np.float32)
flat = float(np.median(v))                               # level ground (206 in SR_HR)
d = v - flat
rgba = np.zeros(v.shape + (4,), np.uint8)
shade = d < 0
rgba[..., :3] = (86, 58, 30)                            # shadow: warm brown
# Near-level ground (within a few shades of flat) is left fully clear: it is most of the map, and noise there would
# only add weight to the file.
dead = 6
alpha = np.where(shade, np.clip((-d - dead) / 120, 0, 1) ** 0.85 * 150, 0)
alpha = np.round(alpha / 6) * 6                          # fewer distinct levels compress far better
rgba[..., 3] = alpha.astype(np.uint8)
out = APP / 'public' / 'map'
out.mkdir(parents=True, exist_ok=True)
Image.fromarray(rgba, 'RGBA').save(out / 'relief.webp', 'WEBP', quality=50, alpha_quality=40, method=6)

# --- Vectors ------------------------------------------------------------------------------------------------
def rdp(pts, eps):
    """Douglas-Peucker simplification (map units)."""
    if len(pts) < 3: return pts
    (x0, y0), (x1, y1) = pts[0], pts[-1]
    dx, dy = x1 - x0, y1 - y0
    n = math.hypot(dx, dy)
    i, dmax = 0, -1.0
    for j in range(1, len(pts) - 1):
        # A closed ring starts and ends on the same point: measure from that point instead of from a line.
        dist = abs(dy * pts[j][0] - dx * pts[j][1] + x1 * y0 - y1 * x0) / n if n else math.hypot(pts[j][0] - x0, pts[j][1] - y0)
        if dist > dmax: i, dmax = j, dist
    if dmax <= eps: return [pts[0], pts[-1]]
    return rdp(pts[:i + 1], eps)[:-1] + rdp(pts[i:], eps)

def near(pts):
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    return max(xs) > -60 and min(xs) < WIDTH + 60 and max(ys) > -60 and min(ys) < HEIGHT + 60

def path(lines, closed, eps=0.7):
    out = []
    for line in lines:
        pts = [project(lon, lat) for lon, lat in line]
        if not near(pts): continue
        pts = rdp(pts, eps)
        if len(pts) < (3 if closed else 2): continue
        out.append('M' + 'L'.join(f'{x:.1f} {y:.1f}' for x, y in pts) + ('Z' if closed else ''))
    return ''.join(out)

def rings(geom):
    if geom['type'] == 'Polygon': return geom['coordinates']
    if geom['type'] == 'MultiPolygon': return [r for poly in geom['coordinates'] for r in poly]
    return []

def lines(geom):
    if geom['type'] == 'LineString': return [geom['coordinates']]
    if geom['type'] == 'MultiLineString': return geom['coordinates']
    return []

load = lambda name: json.loads((SRC / f'{name}.geojson').read_text())['features']
regions = load('ne_10m_geography_regions_polys')
SAND = {"RUB’ AL KHALI", 'An Nafud Desert', 'Wahiba Sands'}
sand = path([r for f in regions if f['properties']['NAME'] in SAND for r in rings(f['geometry'])], True, 1.0)
FERTILE = {'Nile Delta', 'Mesopotamia', 'Levant Coast'}

modern = ('Canal', 'Channel')
rivers = [f for f in load('ne_10m_rivers_lake_centerlines')
          if (f['properties'].get('scalerank') or 9) <= 7 and not any(m in (f['properties'].get('name') or '') for m in modern)]
river = path([l for f in rivers for l in lines(f['geometry'])], False, 0.5)
LAKES = {'Lake Tana', 'Sea of Galilee', 'Dead Sea', 'Lake Urmia', 'Lake Turkana', 'Lake Abaya', 'Lake Chamo',
         'Lake Hammar', 'Lake Assal', 'Lake Abbe', 'Beyşehir', 'Eğirdir'}
lakes = [f for f in load('ne_10m_lakes') if f['properties'].get('name') in LAKES and f['properties'].get('featurecla') != 'Reservoir']
lake = path([r for f in lakes for r in rings(f['geometry'])], True, 0.4)

ts = f"""// Generated by scripts/build-terrain.py — Natural Earth 1:10m (public domain), same projection as land.ts.
// Sand seas (outlines, for the dune texture), rivers and natural lakes; modern canals and reservoirs are left out.
export const MAP_IMAGES = {{ relief: 'map/relief.webp', wash: 'map/wash.webp', depth: 'map/depth.webp', width: {WIDTH:.1f}, height: {HEIGHT:.1f} }};
export const SAND = '{sand}';
export const RIVERS = '{river}';
export const LAKES = '{lake}';
"""
(APP / 'src' / 'data' / 'terrain.ts').write_text(ts)
print('relief', crop.size, round((out / 'relief.webp').stat().st_size / 1024), 'KB; terrain.ts',
      round(len(ts) / 1024), 'KB; rivers', len(rivers), 'lakes', len(lakes))

# --- Soft layers, baked ---------------------------------------------------------------------------------------
WS = 0.5   # pixels per map unit: these layers are smooth, so a small image is enough
def mask(polys):
    im = Image.new('L', (round(WIDTH * WS), round(HEIGHT * WS)), 0)
    draw = ImageDraw.Draw(im)
    for ring in polys:
        if len(ring) > 2: draw.polygon([(x * WS, y * WS) for x, y in ring], fill=255)
    return np.asarray(im).astype(np.float32) / 255
projected = lambda names: [[project(lon, lat) for lon, lat in r] for f in regions if f['properties']['NAME'] in names for r in rings(f['geometry'])]
land_d = re.search(r"LAND = '([^']*)'", (APP / 'src' / 'data' / 'land.ts').read_text()).group(1)
land = mask([[tuple(map(float, pt.split())) for pt in sub.rstrip('Z').split('L')] for sub in land_d.split('M')[1:]])
inland = ndimage.distance_transform_edt(land > .5) / WS           # map units from the coast, on land
offshore = ndimage.distance_transform_edt(land <= .5) / WS        # map units from the coast, at sea
feather = lambda m, units: ndimage.gaussian_filter(m, units * WS)

def over(base, rgb, a):
    """Paint colour rgb with alpha a (0-1 array) over an RGBA float image."""
    a = a[..., None]
    out_a = a + base[..., 3:] * (1 - a)
    base[..., :3] = np.where(out_a > 0, (np.array(rgb) * a + base[..., :3] * base[..., 3:] * (1 - a)) / np.maximum(out_a, 1e-6), 0)
    base[..., 3:] = out_a
    return base

def save(img, name):
    rgba = np.clip(img * [1, 1, 1, 255], 0, 255).astype(np.uint8)
    Image.fromarray(rgba, 'RGBA').save(out / name, 'WEBP', quality=80, alpha_quality=70, method=6)
    return round((out / name).stat().st_size / 1024)

wash = np.zeros(land.shape + (4,), np.float32)
wash = over(wash, (138, 154, 88), feather(mask(projected(FERTILE)), 10) * .14)      # fertile: olive
wash = over(wash, (232, 201, 140), feather(mask(projected(SAND)), 9) * .22)         # sand: warm gold, light enough for lines to read over it
wash = over(wash, (168, 141, 99), np.exp(-inland / 7) * .13 * (land > .5))         # shade inside the coast
depth = np.zeros(land.shape + (4,), np.float32)
depth = over(depth, (60, 84, 86), (1 - np.exp(-offshore / 70)) * .14)               # deep water: a little darker
print('wash', save(wash, 'wash.webp'), 'KB; depth', save(depth, 'depth.webp'), 'KB')
