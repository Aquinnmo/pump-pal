#!/usr/bin/env node

/*
 * Original, dependency-free body tile generator for Timber.
 *
 * The figure is built entirely out of tiles. Muscles are ovoids — a shape
 * grammar borrowed from Northwest Coast formline geometry: convex top, tight
 * upper corners, shallow concave underside, uniform relief gaps between forms.
 * Small filler muscles and the neutral structural tiles (head, neck, hands,
 * knees, feet) use Material-ish squircles. Abstract geometry only — no crest
 * or figure imagery.
 *
 * Geometry, layout, and silhouettes in this file were authored for this
 * project. Nothing is fetched and no anatomy or artwork package is involved.
 */

const fs = require('node:fs');
const path = require('node:path');

const WIDTH = 360;
const HEIGHT = 448;
const CENTERS = { anterior: 90, posterior: 270 };
const VIEWS = ['anterior', 'posterior'];
const CANONICAL_MUSCLES = [
  'chest', 'upper back', 'lower back', 'lats', 'upper traps', 'mid traps',
  'lower traps', 'front delts', 'side delts', 'rear delts', 'rotator cuff',
  'biceps', 'triceps', 'forearm flexors', 'forearm extensors',
  'serratus anterior', 'upper abs', 'lower abs', 'obliques', 'quads',
  'hamstrings', 'glutes', 'glute medius', 'adductors', 'hip flexors',
  'gastrocnemius', 'soleus',
];

const K = 0.5523; // circular bezier constant

function fmt(value) {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0$/, '');
}

/*
 * Shapes are authored in local coordinates (origin at the tile centre) as a
 * list of cubic segments, then emitted through one formatter that applies the
 * tile's rotation and translation. Rotating here rather than via an SVG
 * transform keeps the generated `d` self-contained.
 */
function emitPath(points, { cx, cy, angle = 0, scale = 1 }) {
  const radians = (angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const place = ([px, py]) => {
    const x = px * scale;
    const y = py * scale;
    return `${fmt(cx + x * cos - y * sin)} ${fmt(cy + x * sin + y * cos)}`;
  };
  const [start, ...curves] = points;
  return `M${place(start)}${curves
    .map(([c1, c2, end]) => `C${place(c1)} ${place(c2)} ${place(end)}`)
    .join('')}Z`;
}

function ellipsePoints(rx, ry) {
  return [
    [-rx, 0],
    [[-rx, ry * K], [-rx * K, ry], [0, ry]],
    [[rx * K, ry], [rx, ry * K], [rx, 0]],
    [[rx, -ry * K], [rx * K, -ry], [0, -ry]],
    [[-rx * K, -ry], [-rx, -ry * K], [-rx, 0]],
  ];
}

/*
 * Formline ovoid: convex top, corners pulled tight (a lower control weight
 * makes the turn happen closer to the corner), and an underside that sags
 * upward instead of bulging down.
 */
function ovoidPoints(rx, ry, { corner = 0.48, base = 0.32, sag = 0.24 } = {}) {
  const lift = ry * sag;
  return [
    [-rx, -ry * 0.08],
    [[-rx, ry * base], [-rx * base, ry - lift], [0, ry - lift]],
    [[rx * base, ry - lift], [rx, ry * base], [rx, -ry * 0.08]],
    [[rx, -ry * corner], [rx * corner, -ry], [0, -ry]],
    [[-rx * corner, -ry], [-rx, -ry * corner], [-rx, -ry * 0.08]],
  ];
}

// Material-ish squircle: a rounded rectangle whose corner control points are
// pulled toward the corner (higher `k`) so the sides run flatter than an
// ellipse before turning.
function squirclePoints(rx, ry, k = 0.78) {
  const cx = rx * (1 - k);
  const cy = ry * (1 - k);
  return [
    [-rx, -cy],
    [[-rx, ry * k], [-rx * k, ry], [-cx, ry]],
    [[cx, ry], [cx, ry], [cx, ry]],
    [[rx * k, ry], [rx, ry * k], [rx, cy]],
    [[rx, -cy], [rx, -cy], [rx, -cy]],
    [[rx, -ry * k], [rx * k, -ry], [cx, -ry]],
    [[-cx, -ry], [-cx, -ry], [-cx, -ry]],
    [[-rx * k, -ry], [-rx, -ry * k], [-rx, -cy]],
  ];
}

function capsulePoints(length, radius) {
  const half = length / 2;
  return [
    [-radius, -half],
    [[-radius, -half - radius * K], [-radius * K, -half - radius], [0, -half - radius]],
    [[radius * K, -half - radius], [radius, -half - radius * K], [radius, -half]],
    [[radius, half], [radius, half], [radius, half]],
    [[radius, half + radius * K], [radius * K, half + radius], [0, half + radius]],
    [[-radius * K, half + radius], [-radius, half + radius * K], [-radius, half]],
    [[-radius, -half], [-radius, -half], [-radius, -half]],
  ];
}

function shapePoints(shape) {
  switch (shape.type) {
    case 'ovoid':
      return ovoidPoints(shape.rx, shape.ry, shape);
    case 'squircle':
      return squirclePoints(shape.rx, shape.ry, shape.k);
    case 'capsule':
      return capsulePoints(shape.len, shape.r);
    default:
      return ellipsePoints(shape.rx, shape.ry);
  }
}

/* ---------------------------------------------------------------------------
 * Backing silhouette. Unchanged: it defines the body outline the tiles are
 * placed against and shows through the relief gaps between them.
 * ------------------------------------------------------------------------ */

function ellipsePath(cx, cy, rx, ry) {
  return emitPath(ellipsePoints(rx, ry), { cx, cy });
}

function capsulePath(ax, ay, bx, by, radius) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI - 90;
  return emitPath(capsulePoints(length, radius), {
    cx: (ax + bx) / 2,
    cy: (ay + by) / 2,
    angle,
  });
}

function torsoPath(cx, posterior) {
  const shoulder = posterior ? 43 : 42;
  const waist = posterior ? 28 : 27;
  return `M${cx} 62C${cx - 14} 62 ${cx - shoulder + 8} 70 ${cx - shoulder} 87C${cx - shoulder + 2} 114 ${cx - 33} 142 ${cx - 31} 165C${cx - 30} 188 ${cx - waist} 209 ${cx - 31} 230C${cx - 20} 239 ${cx - 10} 243 ${cx} 243C${cx + 10} 243 ${cx + 20} 239 ${cx + 31} 230C${cx + waist} 209 ${cx + 30} 188 ${cx + 31} 165C${cx + 33} 142 ${cx + shoulder - 2} 114 ${cx + shoulder} 87C${cx + shoulder - 8} 70 ${cx + 14} 62 ${cx} 62Z`;
}

function silhouetteParts(view) {
  const cx = CENTERS[view];
  const posterior = view === 'posterior';
  return [
    { type: 'ellipse', cx, cy: 29, rx: 17, ry: 22 },
    { type: 'capsule', ax: cx, ay: 48, bx: cx, by: 72, radius: 11 },
    { type: 'ellipse', cx, cy: 88, rx: posterior ? 48 : 47, ry: 22 },
    { type: 'torso', cx, posterior },
    { type: 'ellipse', cx, cy: 228, rx: posterior ? 34 : 33, ry: 28 },
    { type: 'capsule', ax: cx - 40, ay: 88, bx: cx - 56, by: 160, radius: 11 },
    { type: 'capsule', ax: cx + 40, ay: 88, bx: cx + 56, by: 160, radius: 11 },
    { type: 'capsule', ax: cx - 56, ay: 158, bx: cx - 66, by: 218, radius: 8.5 },
    { type: 'capsule', ax: cx + 56, ay: 158, bx: cx + 66, by: 218, radius: 8.5 },
    { type: 'ellipse', cx: cx - 67, cy: 228, rx: 9, ry: 13 },
    { type: 'ellipse', cx: cx + 67, cy: 228, rx: 9, ry: 13 },
    { type: 'capsule', ax: cx - 18, ay: 239, bx: cx - 23, by: 330, radius: 17 },
    { type: 'capsule', ax: cx + 18, ay: 239, bx: cx + 23, by: 330, radius: 17 },
    { type: 'ellipse', cx: cx - 23, cy: 339, rx: 14, ry: 14 },
    { type: 'ellipse', cx: cx + 23, cy: 339, rx: 14, ry: 14 },
    { type: 'capsule', ax: cx - 23, ay: 346, bx: cx - 25, by: 417, radius: 12 },
    { type: 'capsule', ax: cx + 23, ay: 346, bx: cx + 25, by: 417, radius: 12 },
    { type: 'ellipse', cx: cx - 28, cy: 434, rx: 18, ry: 8 },
    { type: 'ellipse', cx: cx + 28, cy: 434, rx: 18, ry: 8 },
  ];
}

function partPath(part) {
  if (part.type === 'ellipse') return ellipsePath(part.cx, part.cy, part.rx, part.ry);
  if (part.type === 'capsule') return capsulePath(part.ax, part.ay, part.bx, part.by, part.radius);
  return torsoPath(part.cx, part.posterior);
}

function pointInSilhouette(view, x, y) {
  return silhouetteParts(view).some((part) => {
    if (part.type === 'ellipse') {
      return ((x - part.cx) / part.rx) ** 2 + ((y - part.cy) / part.ry) ** 2 <= 1;
    }
    if (part.type === 'capsule') {
      const dx = part.bx - part.ax;
      const dy = part.by - part.ay;
      const t = Math.max(0, Math.min(1, ((x - part.ax) * dx + (y - part.ay) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(x - (part.ax + dx * t), y - (part.ay + dy * t)) <= part.radius;
    }
    if (y < 62 || y > 243) return false;
    const halfWidth = y < 90
      ? 9 + (part.posterior ? 39 : 38) * ((y - 62) / 28)
      : y < 165
        ? (part.posterior ? 43 : 42) - 12 * ((y - 90) / 75)
        : 31 - 3 * ((y - 165) / 45) + 4 * Math.max(0, (y - 210) / 33);
    return Math.abs(x - part.cx) <= halfWidth;
  });
}

/* ---------------------------------------------------------------------------
 * Packing. Shapes below are authored generously — deliberately a little larger
 * than their slot — and this pass shrinks each one about its own centre until
 * it clears its neighbours by RELIEF_GAP and sits inside the silhouette. That
 * keeps placement anatomical (nothing ever moves) while guaranteeing the even
 * negative-space channel between forms, which hand-tuning never held onto.
 * ------------------------------------------------------------------------ */

const RELIEF_GAP = 2;
const MIN_SCALE = 0.45;
// Detail forms may fill their gap but must not balloon into anatomical
// nonsense, so growth stops at half again their authored size.
const MAX_SCALE = 1.7;
const SHRINK_STEP = 0.975;
// pointInSilhouette models the torso with straight-line half-widths while the
// drawn outline is bezier, so demanding every outline sample land strictly
// inside over-trims the tiles that sit against the body edge. Judge each sample
// from slightly inside its own tile instead.
const EDGE_TOLERANCE = 2;

// Local outline samples. Every primitive scales linearly about its own origin,
// so sampling once at scale 1 is enough — a scaled sample is just `point * s`.
function outlineSamples(shape, perSegment = 12) {
  const points = shapePoints(shape);
  const [start, ...curves] = points;
  const samples = [];
  let from = start;
  for (const [c1, c2, end] of curves) {
    for (let step = 0; step < perSegment; step += 1) {
      const t = step / perSegment;
      const u = 1 - t;
      samples.push([
        u * u * u * from[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * end[0],
        u * u * u * from[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * end[1],
      ]);
    }
    from = end;
  }
  return samples;
}

function worldSamples(tile) {
  if (tile.cachedScale === tile.scale) return tile.cached;
  const radians = (tile.angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  tile.cached = tile.local.map(([x, y]) => [
    tile.cx + (x * tile.scale) * cos - (y * tile.scale) * sin,
    tile.cy + (x * tile.scale) * sin + (y * tile.scale) * cos,
  ]);
  tile.cachedScale = tile.scale;
  return tile.cached;
}

// Signed clearance: positive is the gap between outlines, negative means the
// tiles intersect. Bounding circles reject the far pairs before any sampling.
function clearance(a, b) {
  const span = Math.hypot(a.cx - b.cx, a.cy - b.cy) - (a.radius * a.scale + b.radius * b.scale);
  if (span > RELIEF_GAP) return span;
  const aPoints = worldSamples(a);
  const bPoints = worldSamples(b);
  if (aPoints.some(([x, y]) => pointInTile(b, x, y))) return -1;
  if (bPoints.some(([x, y]) => pointInTile(a, x, y))) return -1;
  let nearest = Infinity;
  for (const [ax, ay] of aPoints) {
    for (const [bx, by] of bPoints) {
      nearest = Math.min(nearest, Math.hypot(ax - bx, ay - by));
    }
  }
  return nearest;
}

function shrink(tile) {
  tile.scale *= SHRINK_STEP;
  if (tile.partner) tile.partner.scale = tile.scale;
}

function packTiles(view, tiles) {
  // Pull every tile inside the body first, so neighbour spacing is negotiated
  // between shapes that already fit.
  const escapes = (tile) => worldSamples(tile).some(([x, y]) => {
    const span = Math.hypot(x - tile.cx, y - tile.cy) || 1;
    const pull = Math.min(EDGE_TOLERANCE, span) / span;
    return !pointInSilhouette(view, x + (tile.cx - x) * pull, y + (tile.cy - y) * pull);
  });
  for (const tile of tiles) {
    while (tile.scale > MIN_SCALE && escapes(tile)) shrink(tile);
  }

  const area = (tile) => tile.radius * tile.radius * tile.scale * tile.scale;
  for (let pass = 0; pass < 300; pass += 1) {
    const crowded = new Set();
    for (let i = 0; i < tiles.length; i += 1) {
      for (let j = i + 1; j < tiles.length; j += 1) {
        if (clearance(tiles[i], tiles[j]) >= RELIEF_GAP) continue;
        // Shrink the bigger of the offending pair: the small tiles are the
        // detail forms, and letting them evaporate under a large neighbour
        // looks worse than trimming the anchor beside them.
        const bigger = area(tiles[i]) >= area(tiles[j]) ? tiles[i] : tiles[j];
        const other = bigger === tiles[i] ? tiles[j] : tiles[i];
        crowded.add(bigger.scale > MIN_SCALE ? bigger : other);
      }
    }
    if (crowded.size === 0) break;
    let moved = false;
    for (const tile of crowded) {
      if (tile.scale <= MIN_SCALE) continue;
      shrink(tile);
      moved = true;
    }
    if (!moved) break;
  }

  growTiles(tiles, escapes);
}

/*
 * Authored sizes are only a seed. Once nothing overlaps, every tile inflates
 * about its own centre until it is one relief gap from its neighbours or from
 * the body edge — that is what closes the dead space without anyone
 * hand-tuning radii against their neighbours' radii.
 */
function growTiles(tiles, escapes) {
  const fits = (tile) => !escapes(tile)
    && tiles.every((other) => other === tile || clearance(tile, other) >= RELIEF_GAP);
  for (let pass = 0; pass < 120; pass += 1) {
    let grew = false;
    for (const tile of tiles) {
      if (tile.scale >= MAX_SCALE) continue;
      const previous = tile.scale;
      tile.scale = Math.min(MAX_SCALE, tile.scale / SHRINK_STEP);
      if (tile.partner) tile.partner.scale = tile.scale;
      if (fits(tile) && (!tile.partner || fits(tile.partner))) {
        grew = true;
        continue;
      }
      tile.scale = previous;
      if (tile.partner) tile.partner.scale = previous;
    }
    if (!grew) return;
  }
}

/* ---------------------------------------------------------------------------
 * Tile layout. `x` is the offset from the figure centreline (mirrored specs
 * emit both signs), `y` is absolute in the 448-high viewbox, `a` is rotation in
 * degrees (positive = clockwise on the figure's right side; mirrored tiles get
 * the negated angle so the pair stays symmetric).
 * ------------------------------------------------------------------------ */

const O = (x, y, rx, ry, a = 0, opts = {}) => ({ type: 'ovoid', x, y, rx, ry, a, ...opts });
const S = (x, y, rx, ry, a = 0, k) => ({ type: 'squircle', x, y, rx, ry, a, k });
const C = (x, y, len, r, a = 0) => ({ type: 'capsule', x, y, len, r, a });

const PEBBLE_SPECS = {
  anterior: [
    // Head and neck — neutral structure, same vocabulary.
    { muscle: null, mirror: false, shapes: [O(0, 29, 15, 19.5, 0, { sag: 0.05 }), S(0, 59, 9.5, 9)] },

    // Shoulder girdle. Sizes are budgeted against the silhouette: the shoulder
    // ellipse reaches x±47, the upper-arm capsule runs (±40,88) to (±56,160).
    { muscle: 'upper traps', mirror: true, shapes: [O(22, 77, 12, 8.5, -12)] },
    { muscle: 'front delts', mirror: true, shapes: [O(30, 99, 12.5, 13, 6)] },
    { muscle: 'side delts', mirror: true, shapes: [O(46, 105, 9.5, 14, 12)] },

    // Chest and ribcage.
    { muscle: 'chest', mirror: true, shapes: [O(18, 126, 17, 15, 3)] },
    { muscle: 'serratus anterior', mirror: true, shapes: [O(26, 156, 7, 10, 12)] },

    // Core column: two columns of blocks flanked by the obliques.
    { muscle: 'upper abs', mirror: true, shapes: [S(8, 149, 7, 8.5), S(8, 169, 7, 8.5)] },
    { muscle: 'lower abs', mirror: true, shapes: [S(8, 189, 7, 8.5), S(8, 208, 7, 8)] },
    { muscle: 'obliques', mirror: true, shapes: [O(24, 186, 6.5, 15, 2)] },
    { muscle: 'hip flexors', mirror: true, shapes: [O(18, 226, 11, 8, -10)] },

    // Arms.
    { muscle: 'biceps', mirror: true, shapes: [O(48, 133, 10, 19, 12)] },
    { muscle: 'forearm flexors', mirror: true, shapes: [O(60, 182, 8, 20, 9), S(66, 213, 6.5, 9, 9)] },
    { muscle: null, mirror: true, shapes: [S(68, 231, 7, 10, 9)] },

    // Thighs: the capsule is ~34 wide, so it takes one outer and one inner
    // column with the relief channel down the middle.
    { muscle: 'quads', mirror: true, shapes: [O(28, 264, 8.5, 21, -2), O(30, 308, 8.5, 19, -3)] },
    { muscle: 'adductors', mirror: true, shapes: [O(10, 268, 7, 21, -2), S(11, 308, 6.5, 17, -3)] },

    // Knees, ankles, calves, feet.
    { muscle: null, mirror: false, shapes: [S(0, 232, 9, 9)] },
    { muscle: null, mirror: true, shapes: [O(23, 339, 11.5, 9.5, 0, { sag: 0.06 })] },
    { muscle: 'gastrocnemius', mirror: true, shapes: [O(23.5, 368, 10, 16, -2)] },
    { muscle: 'soleus', mirror: true, shapes: [S(24.5, 398, 9, 11, -2)] },
    { muscle: null, mirror: true, shapes: [S(25.5, 419, 8, 5), S(28, 433, 15, 6)] },
  ],
  posterior: [
    { muscle: null, mirror: false, shapes: [O(0, 29, 15, 19.5, 0, { sag: 0.05 }), S(0, 59, 9.5, 9)] },

    // Traps run down the spine; the paired yoke sits on the shoulder slope.
    { muscle: 'upper traps', mirror: true, shapes: [O(22, 78, 12, 8.5, -12)] },
    { muscle: 'mid traps', mirror: false, shapes: [O(0, 108, 11, 14)] },
    { muscle: 'lower traps', mirror: false, shapes: [O(0, 140, 9, 13)] },

    // Shoulder girdle.
    { muscle: 'rear delts', mirror: true, shapes: [O(30, 99, 12.5, 13, 6)] },
    { muscle: 'side delts', mirror: true, shapes: [O(46, 105, 9.5, 14, 12)] },
    { muscle: 'rotator cuff', mirror: true, shapes: [O(22, 114, 7.5, 9, -8)] },

    // Back.
    { muscle: 'upper back', mirror: true, shapes: [O(22, 138, 7.5, 11, 4)] },
    { muscle: 'lats', mirror: true, shapes: [O(24, 168, 8, 15, 5), O(23, 196, 7.5, 10, 3)] },
    { muscle: 'lower back', mirror: false, shapes: [S(0, 170, 8, 13), S(0, 198, 8, 12)] },

    // Arms.
    { muscle: 'triceps', mirror: true, shapes: [O(48, 133, 10, 19, 12)] },
    { muscle: 'forearm extensors', mirror: true, shapes: [O(60, 182, 8, 20, 9), S(66, 213, 6.5, 9, 9)] },
    { muscle: null, mirror: true, shapes: [S(68, 231, 7, 10, 9)] },

    // Hips.
    { muscle: 'glute medius', mirror: true, shapes: [O(29, 217, 9, 8, -12)] },
    { muscle: 'glutes', mirror: true, shapes: [O(16, 233, 13, 14, 2)] },

    // Thighs.
    { muscle: 'hamstrings', mirror: true, shapes: [O(28, 266, 8.5, 21, -2), O(30, 308, 8.5, 19, -3)] },
    { muscle: 'adductors', mirror: true, shapes: [O(10, 268, 7, 21, -2), S(11, 308, 6.5, 17, -3)] },

    // Knees, ankles, calves, feet.
    { muscle: null, mirror: true, shapes: [O(23, 339, 11.5, 9.5, 0, { sag: 0.06 })] },
    { muscle: 'gastrocnemius', mirror: true, shapes: [O(23.5, 368, 10, 16, -2)] },
    { muscle: 'soleus', mirror: true, shapes: [S(24.5, 398, 9, 11, -2)] },
    { muscle: null, mirror: true, shapes: [S(25.5, 419, 8, 5), S(28, 433, 15, 6)] },
  ],
};

function layoutTiles(view) {
  const cx = CENTERS[view];
  const tiles = [];
  const mirrorPairs = [];
  let index = 0;
  for (const spec of PEBBLE_SPECS[view]) {
    for (const shape of spec.shapes) {
      const local = outlineSamples(shape);
      const radius = Math.max(...local.map(([x, y]) => Math.hypot(x, y)));
      const made = (spec.mirror ? [-1, 1] : [1]).map((sign) => {
        index += 1;
        return {
          id: `${view}-${String(index).padStart(2, '0')}`,
          muscle: spec.muscle,
          shape,
          local,
          radius,
          scale: 1,
          cx: cx + shape.x * sign,
          cy: shape.y,
          angle: (shape.a ?? 0) * sign,
        };
      });
      if (made.length === 2) {
        // Mirrored halves share a scale so packing can never break symmetry.
        made[0].partner = made[1];
        made[1].partner = made[0];
        mirrorPairs.push([made[0].id, made[1].id]);
      }
      tiles.push(...made);
    }
  }
  return { tiles, mirrorPairs };
}

function generateMap() {
  const silhouettes = VIEWS.map((view) => ({
    view,
    d: silhouetteParts(view).map(partPath).join(''),
  }));
  const pebbles = [];
  const raw = {};
  for (const view of VIEWS) {
    const { tiles, mirrorPairs } = layoutTiles(view);
    packTiles(view, tiles);
    for (const tile of tiles) {
      pebbles.push({
        id: tile.id,
        view,
        muscle: tile.muscle,
        d: emitPath(shapePoints(tile.shape), {
          cx: tile.cx,
          cy: tile.cy,
          angle: tile.angle,
          scale: tile.scale,
        }),
      });
    }
    raw[view] = { mirrorPairs, placed: tiles, count: tiles.length };
  }
  return { silhouettes, pebbles, raw };
}

/*
 * Approximate containment against the authored shapes (not the emitted path
 * strings): ovoid and U-form outer edge as ellipses, squircle as a rounded
 * rectangle, capsule exact. Only used by the coverage guard in the test, which
 * needs a floor rather than an exact area.
 */
function pointInTile(tile, x, y) {
  const radians = (-(tile.angle ?? 0) * Math.PI) / 180;
  const scale = tile.scale ?? 1;
  const dx = x - tile.cx;
  const dy = y - tile.cy;
  const lx = (dx * Math.cos(radians) - dy * Math.sin(radians)) / scale;
  const ly = (dx * Math.sin(radians) + dy * Math.cos(radians)) / scale;
  const { shape } = tile;
  if (shape.type === 'capsule') {
    const half = shape.len / 2;
    const clamped = Math.max(-half, Math.min(half, ly));
    return Math.hypot(lx, ly - clamped) <= shape.r;
  }
  if (shape.type === 'squircle') {
    return Math.abs(lx) <= shape.rx && Math.abs(ly) <= shape.ry;
  }
  return (lx / shape.rx) ** 2 + (ly / shape.ry) ** 2 <= 1;
}

function coverage(generated, view, step = 2) {
  let inside = 0;
  let covered = 0;
  const [minX, maxX] = view === 'anterior' ? [0, 180] : [180, 360];
  for (let y = 2; y < HEIGHT; y += step) {
    for (let x = minX + 2; x < maxX; x += step) {
      if (!pointInSilhouette(view, x, y)) continue;
      inside += 1;
      if (generated.raw[view].placed.some((tile) => pointInTile(tile, x, y))) covered += 1;
    }
  }
  return inside === 0 ? 0 : covered / inside;
}

function renderTypeScript(generated) {
  const lines = [
    '// GENERATED FILE — DO NOT EDIT.',
    '// Run `npm run generate:muscle-map` after changing the original parametric generator.',
    "import type { BodySilhouette, MusclePebble } from './muscle-map-paths';",
    '',
    'export const BODY_SILHOUETTES: readonly BodySilhouette[] = [',
  ];
  for (const silhouette of generated.silhouettes) {
    lines.push(`  { view: '${silhouette.view}', d: '${silhouette.d}' },`);
  }
  lines.push('] as const;', '', 'export const MUSCLE_PEBBLES: readonly MusclePebble[] = [');
  for (const pebble of generated.pebbles) {
    lines.push(`  { id: '${pebble.id}', view: '${pebble.view}', muscle: ${pebble.muscle ? `'${pebble.muscle}'` : 'null'}, d: '${pebble.d}' },`);
  }
  lines.push('] as const;', '');
  return `${lines.join('\n')}\n`;
}

function previewColor(score) {
  const ratio = Math.max(0, Math.min(1, score / 8));
  const channel = (from, to) => Math.round(from + (to - from) * ratio).toString(16).padStart(2, '0');
  return `#${channel(0x60, 0xe5)}${channel(0xa5, 0x42)}${channel(0xfa, 0x42)}`;
}

function renderPreview(generated, mode = 'mixed') {
  const selectedMuscle = 'lats';
  const scores = new Map(CANONICAL_MUSCLES.map((muscle, index) => [
    muscle,
    mode === 'zero' ? 0 : ((index * 5 + 2) % 9),
  ]));
  const paths = generated.pebbles.map((pebble) => {
    const selected = mode === 'selected' && pebble.muscle === selectedMuscle;
    return `<path d="${pebble.d}" fill="${pebble.muscle ? previewColor(scores.get(pebble.muscle)) : '#4b4b4b'}"${selected ? ' class="selected"' : ''}><title>${pebble.muscle || 'neutral'}</title></path>`;
  }).join('');
  const body = generated.silhouettes
    .map((s) => s.d.split(/(?=M)/).map((part) => `<path class="body" d="${part}" fill="#2b2b2b"/>`).join(''))
    .join('');
  const stats = VIEWS.map((view) => `${view} ${(coverage(generated, view) * 100).toFixed(0)}%`).join(' · ');
  return `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#181818;color:#eee;font:14px system-ui}main{max-width:720px;margin:auto;padding:20px}.frame{background:#242424;border:1px solid #404040;border-radius:12px;padding:12px}svg{display:block;width:100%;height:auto}path{stroke:#0f0f0f;stroke-width:2.15;stroke-linejoin:round;stroke-linecap:round}.body{stroke:none}.selected{stroke:#fff;stroke-width:3}h1{font-size:16px;margin:0 0 12px}.labels{display:flex;justify-content:space-around;color:#aaa}</style><main><h1>Tiled body — ${mode} · coverage ${stats} (hover a tile for its muscle)</h1><div class="frame"><div class="labels"><span>Anterior</span><span>Posterior</span></div><svg viewBox="0 0 ${WIDTH} ${HEIGHT}">${body}${paths}</svg></div></main>`;
}

function writeOutputs(options = {}) {
  const generated = generateMap();
  const target = path.join(__dirname, '..', 'constants', 'muscle-map.generated.ts');
  fs.writeFileSync(target, renderTypeScript(generated));
  const previewTarget = options.preview
    ?? path.join(__dirname, '..', 'temp', 'muscle-map-preview.html');
  fs.mkdirSync(path.dirname(previewTarget), { recursive: true });
  fs.writeFileSync(previewTarget, renderPreview(generated, options.previewMode));
  return { generated, previewTarget };
}

if (require.main === module) {
  const previewArgument = process.argv.find((argument) => argument.startsWith('--preview='));
  const previewModeArgument = process.argv.find((argument) => argument.startsWith('--preview-mode='));
  const { generated, previewTarget } = writeOutputs({
    preview: previewArgument?.slice('--preview='.length),
    previewMode: previewModeArgument?.slice('--preview-mode='.length),
  });
  const stats = VIEWS.map((view) => `${view} ${(coverage(generated, view) * 100).toFixed(1)}%`).join(', ');
  process.stdout.write(`Generated ${generated.pebbles.length} tiles. Coverage: ${stats}. Preview: ${previewTarget}\n`);
}

module.exports = {
  CANONICAL_MUSCLES,
  RELIEF_GAP,
  clearance,
  CENTERS,
  HEIGHT,
  PEBBLE_SPECS,
  VIEWS,
  WIDTH,
  coverage,
  generateMap,
  pointInSilhouette,
  pointInTile,
  renderTypeScript,
  writeOutputs,
};
