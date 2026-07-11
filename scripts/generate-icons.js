/**
 * Timber icon generator.
 *
 * Single source of truth for the stacked-log-ends mark: a bundle of three cut-log
 * rounds (woodgrain faces) on a forest-green ground. Defines the geometry once,
 * writes the canonical `assets/images/icon.svg`, and rasterizes every PNG asset
 * Expo needs (icon / adaptive foreground+background+monochrome / favicon / splash).
 *
 * Run: npm run generate:icons
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const IMAGES_DIR = path.join(__dirname, '..', 'assets', 'images');

// Palette — matches the app's dark charcoal + red accent theme
const GROUND = '#111111'; // charcoal ground (tab bar / screens)
const BARK = '#4A3324';
const SAPWOOD = '#6E4A30';
const FACE = '#C9A567';
const RING = '#E54242'; // app accent red
const PITH = '#E54242';

// Six logs in a 3-2-1 pyramid (hex-packed). Kept inside the center ~66% safe zone
// (max extent ~330 of 512 from center) so Android adaptive masking never clips.
// Lower rows drawn first, top last (front).
const R = 112;
const LOGS = [
  // bottom row (touching, tangent — no overlap)
  { cx: 288, cy: 706 },
  { cx: 512, cy: 706 },
  { cx: 736, cy: 706 },
  // middle row (resting tangent in the crevices)
  { cx: 400, cy: 512 },
  { cx: 624, cy: 512 },
  // top
  { cx: 512, cy: 318 },
];

/**
 * One cut-log end. The logs are tangent (touching, never overlapping), so no
 * separating seam is drawn — the BARK fill (radius R) is the true edge. When
 * `mono` is set, the whole log is a single flat filled circle in that color
 * (for the Android monochrome layer).
 */
function log({ cx, cy, mono = null }) {
  if (mono) {
    return `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${mono}"/>`;
  }
  return [
    `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${BARK}"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${R * 0.82}" fill="${SAPWOOD}"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${R * 0.72}" fill="${FACE}"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${R * 0.5}" fill="none" stroke="${RING}" stroke-width="10"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${R * 0.28}" fill="none" stroke="${RING}" stroke-width="10"/>`,
    `<circle cx="${cx}" cy="${cy}" r="14" fill="${PITH}"/>`,
  ].join('\n');
}

/**
 * Build the mark SVG.
 * @param {object} opts
 * @param {string|null} opts.background  full-bleed rect fill, or null for transparent
 * @param {string|null} opts.mono        single color for a flat silhouette, or null for the branded palette
 */
function markSvg({ background = null, mono = null } = {}) {
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">`,
  ];
  if (background) {
    parts.push(`<rect width="1024" height="1024" fill="${background}"/>`);
  }
  for (const l of LOGS) {
    parts.push(log({ cx: l.cx, cy: l.cy, mono }));
  }
  parts.push(`</svg>`);
  return parts.join('\n');
}

async function toPng(svg, file, size) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(path.join(IMAGES_DIR, file));
  console.log(`  wrote ${file} (${size}x${size})`);
}

async function main() {
  // Canonical master SVG (branded, on green).
  const master = markSvg({ background: GROUND });
  fs.writeFileSync(path.join(IMAGES_DIR, 'icon.svg'), master + '\n');
  console.log('wrote icon.svg');

  const branded = markSvg({ background: GROUND }); // opaque, with background
  const foreground = markSvg({ background: null }); // logs only, transparent
  const background = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"><rect width="1024" height="1024" fill="${GROUND}"/></svg>`;
  const monochrome = markSvg({ background: null, mono: '#FFFFFF' });

  await toPng(branded, 'icon.png', 1024);
  await toPng(foreground, 'android-icon-foreground.png', 1024);
  await toPng(background, 'android-icon-background.png', 1024);
  await toPng(monochrome, 'android-icon-monochrome.png', 1024);
  await toPng(branded, 'favicon.png', 196);
  await toPng(foreground, 'splash-icon.png', 400);

  console.log('done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
