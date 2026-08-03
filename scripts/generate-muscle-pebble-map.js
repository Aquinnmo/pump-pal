#!/usr/bin/env node

/*
 * Original, dependency-free body pebble generator for Timber.
 *
 * Each muscle is drawn as one or more hand-placed smooth pebbles (ellipses
 * and capsules) positioned anatomically on anterior/posterior figures.
 * Nothing is fetched and no anatomy or artwork package is involved.
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

function fmt(value) {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0$/, '');
}

function ellipsePath(cx, cy, rx, ry) {
  // Keep the same winding direction as the torso and capsule primitives so
  // overlapping subpaths form a non-zero union inside a single clip path.
  return `M${fmt(cx - rx)} ${fmt(cy)}C${fmt(cx - rx)} ${fmt(cy + ry * 0.5523)} ${fmt(cx - rx * 0.5523)} ${fmt(cy + ry)} ${fmt(cx)} ${fmt(cy + ry)}C${fmt(cx + rx * 0.5523)} ${fmt(cy + ry)} ${fmt(cx + rx)} ${fmt(cy + ry * 0.5523)} ${fmt(cx + rx)} ${fmt(cy)}C${fmt(cx + rx)} ${fmt(cy - ry * 0.5523)} ${fmt(cx + rx * 0.5523)} ${fmt(cy - ry)} ${fmt(cx)} ${fmt(cy - ry)}C${fmt(cx - rx * 0.5523)} ${fmt(cy - ry)} ${fmt(cx - rx)} ${fmt(cy - ry * 0.5523)} ${fmt(cx - rx)} ${fmt(cy)}Z`;
}

function capsulePath(ax, ay, bx, by, radius) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy);
  const nx = (-dy / length) * radius;
  const ny = (dx / length) * radius;
  const k = 0.5523;
  return [
    `M${fmt(ax + nx)} ${fmt(ay + ny)}`,
    `L${fmt(bx + nx)} ${fmt(by + ny)}`,
    `C${fmt(bx + nx + (dx / length) * radius * k)} ${fmt(by + ny + (dy / length) * radius * k)} ${fmt(bx + (dx / length) * radius + nx * k)} ${fmt(by + (dy / length) * radius + ny * k)} ${fmt(bx + (dx / length) * radius)} ${fmt(by + (dy / length) * radius)}`,
    `C${fmt(bx + (dx / length) * radius - nx * k)} ${fmt(by + (dy / length) * radius - ny * k)} ${fmt(bx - nx + (dx / length) * radius * k)} ${fmt(by - ny + (dy / length) * radius * k)} ${fmt(bx - nx)} ${fmt(by - ny)}`,
    `L${fmt(ax - nx)} ${fmt(ay - ny)}`,
    `C${fmt(ax - nx - (dx / length) * radius * k)} ${fmt(ay - ny - (dy / length) * radius * k)} ${fmt(ax - (dx / length) * radius - nx * k)} ${fmt(ay - (dy / length) * radius - ny * k)} ${fmt(ax - (dx / length) * radius)} ${fmt(ay - (dy / length) * radius)}`,
    `C${fmt(ax - (dx / length) * radius + nx * k)} ${fmt(ay - (dy / length) * radius + ny * k)} ${fmt(ax + nx - (dx / length) * radius * k)} ${fmt(ay + ny - (dy / length) * radius * k)} ${fmt(ax + nx)} ${fmt(ay + ny)}Z`,
  ].join('');
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

// Shape shorthands. Coordinates are local: x is the offset from the figure
// centerline (positive values sit on the figure's right half; mirrored specs
// emit both signs). y is absolute within the 448-high viewbox.
const E = (x, y, rx, ry) => ({ type: 'ellipse', x, y, rx, ry });
const C = (ax, ay, bx, by, r) => ({ type: 'capsule', ax, ay, bx, by, r });

/*
 * Hand-authored pebble layout. One entry per muscle (or neutral filler) per
 * view. `mirror: true` emits each shape twice, reflected across the figure
 * centerline. Shapes were placed against the silhouette dimensions above and
 * tuned so neighbouring pebbles keep a visible gap; the body clip path trims
 * any slight overhang at the silhouette edge.
 */
const PEBBLE_SPECS = {
  anterior: [
    { muscle: 'upper traps', mirror: true, shapes: [C(10, 66, 30, 78, 5.5)] },
    { muscle: 'side delts', mirror: true, shapes: [C(44, 86, 50, 102, 7)] },
    { muscle: 'front delts', mirror: true, shapes: [E(33, 94, 7.5, 9)] },
    { muscle: 'chest', mirror: true, shapes: [E(20, 114, 17, 15)] },
    { muscle: 'biceps', mirror: true, shapes: [C(46, 116, 52, 148, 8)] },
    { muscle: 'forearm flexors', mirror: true, shapes: [C(58, 168, 65, 210, 6.5)] },
    { muscle: 'serratus anterior', mirror: true, shapes: [E(31, 141, 4.5, 8)] },
    { muscle: 'upper abs', mirror: false, shapes: [C(-5, 139, 5, 139, 7.5), C(-5, 157, 5, 157, 7.5)] },
    { muscle: 'lower abs', mirror: false, shapes: [C(-4, 177, 4, 177, 8.5)] },
    { muscle: 'obliques', mirror: true, shapes: [C(20, 142, 19, 186, 5.5)] },
    { muscle: 'hip flexors', mirror: true, shapes: [C(14, 198, 24, 212, 6)] },
    { muscle: 'quads', mirror: true, shapes: [C(33, 246, 34, 318, 6.5), C(18, 252, 20, 322, 6)] },
    { muscle: 'adductors', mirror: true, shapes: [C(7, 250, 8, 284, 4)] },
  ],
  posterior: [
    { muscle: 'upper traps', mirror: false, shapes: [E(0, 77, 6, 7)] },
    { muscle: 'upper traps', mirror: true, shapes: [C(10, 66, 30, 78, 5.5)] },
    { muscle: 'mid traps', mirror: false, shapes: [E(0, 98, 9, 13)] },
    { muscle: 'lower traps', mirror: false, shapes: [E(0, 124, 7, 11)] },
    { muscle: 'side delts', mirror: true, shapes: [C(44, 86, 50, 102, 7)] },
    { muscle: 'rear delts', mirror: true, shapes: [E(33, 94, 7.5, 9)] },
    { muscle: 'rotator cuff', mirror: true, shapes: [E(20, 98, 5.5, 6.5)] },
    { muscle: 'upper back', mirror: true, shapes: [E(16, 116, 7, 9)] },
    { muscle: 'lats', mirror: true, shapes: [C(30, 128, 19, 184, 8)] },
    { muscle: 'lower back', mirror: true, shapes: [C(5, 158, 5, 198, 4)] },
    { muscle: 'triceps', mirror: true, shapes: [C(46, 116, 52, 148, 8)] },
    { muscle: 'forearm extensors', mirror: true, shapes: [C(58, 168, 65, 210, 6.5)] },
    { muscle: 'glute medius', mirror: true, shapes: [E(26, 203, 7, 6.5)] },
    { muscle: 'glutes', mirror: true, shapes: [E(15, 224, 13, 16)] },
    { muscle: 'adductors', mirror: true, shapes: [C(6.5, 250, 7, 280, 4)] },
    { muscle: 'hamstrings', mirror: true, shapes: [C(17, 266, 18, 322, 6), C(31, 260, 33, 320, 6.5)] },
    { muscle: 'gastrocnemius', mirror: true, shapes: [E(17.5, 363, 5, 14), E(29.5, 361, 5, 13)] },
    { muscle: 'soleus', mirror: true, shapes: [C(23, 390, 25, 408, 7)] },
  ],
};

function shapePath(shape, cx, sign) {
  if (shape.type === 'ellipse') return ellipsePath(cx + shape.x * sign, shape.y, shape.rx, shape.ry);
  return capsulePath(cx + shape.ax * sign, shape.ay, cx + shape.bx * sign, shape.by, shape.r);
}

function generateMap() {
  const silhouettes = VIEWS.map((view) => ({
    view,
    d: silhouetteParts(view).map(partPath).join(''),
  }));
  const pebbles = [];
  const raw = {};
  for (const view of VIEWS) {
    const cx = CENTERS[view];
    const mirrorPairs = [];
    let index = 0;
    const nextId = () => {
      index += 1;
      return `${view}-${String(index).padStart(2, '0')}`;
    };
    for (const spec of PEBBLE_SPECS[view]) {
      for (const shape of spec.shapes) {
        if (spec.mirror) {
          const leftId = nextId();
          const rightId = nextId();
          pebbles.push({ id: leftId, view, muscle: spec.muscle, d: shapePath(shape, cx, -1) });
          pebbles.push({ id: rightId, view, muscle: spec.muscle, d: shapePath(shape, cx, 1) });
          mirrorPairs.push([leftId, rightId]);
        } else {
          pebbles.push({ id: nextId(), view, muscle: spec.muscle, d: shapePath(shape, cx, 1) });
        }
      }
    }
    raw[view] = { mirrorPairs, count: index };
  }
  return { silhouettes, pebbles, raw };
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
    return `<path d="${pebble.d}" clip-path="url(#${pebble.view})" fill="${pebble.muscle ? previewColor(scores.get(pebble.muscle)) : '#4b4b4b'}"${selected ? ' class="selected"' : ''}><title>${pebble.muscle || 'neutral'}</title></path>`;
  }).join('');
  return `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#181818;color:#eee;font:14px system-ui}main{max-width:720px;margin:auto;padding:20px}.frame{background:#242424;border:1px solid #404040;border-radius:12px;padding:12px}svg{display:block;width:100%;height:auto}path{stroke:#0f0f0f;stroke-width:2.15;stroke-linejoin:round;stroke-linecap:round}.body{stroke:none}.selected{stroke:#fff;stroke-width:3}h1{font-size:16px;margin:0 0 12px}.labels{display:flex;justify-content:space-around;color:#aaa}</style><main><h1>Hand-designed pebble body — ${mode} (hover a pebble for its muscle)</h1><div class="frame"><div class="labels"><span>Anterior</span><span>Posterior</span></div><svg viewBox="0 0 ${WIDTH} ${HEIGHT}"><defs>${generated.silhouettes.map((s) => `<clipPath id="${s.view}"><path d="${s.d}"/></clipPath>`).join('')}</defs>${generated.silhouettes.map((s) => `<path class="body" d="${s.d}" fill="#3a3a3a"/>`).join('')}${paths}</svg></div></main>`;
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
  process.stdout.write(`Generated ${generated.pebbles.length} pebbles. Preview: ${previewTarget}\n`);
}

module.exports = {
  CANONICAL_MUSCLES,
  CENTERS,
  HEIGHT,
  PEBBLE_SPECS,
  VIEWS,
  WIDTH,
  generateMap,
  renderTypeScript,
  writeOutputs,
};
