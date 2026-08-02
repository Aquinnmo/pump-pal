/**
 * ic_stat_timber generator.
 *
 * Android draws status-bar / Live Update small icons as a plain white silhouette
 * (RGB is discarded, only alpha is used), and expects the artwork to fill most of
 * the canvas — unlike an adaptive-icon layer, which reserves an outer safe zone
 * the OS can crop away when applying its mask shape. The monochrome adaptive-icon
 * source (assets/images/android-icon-monochrome.png, see generate-icons.js) has
 * exactly that safe-zone padding, so this script trims it via the alpha channel's
 * bounding box, re-asserts pure white RGB, and rasterizes the result into every
 * density bucket the live-update-notification module ships resources for.
 *
 * Run: node scripts/generate-ic-stat-timber.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SOURCE = path.join(__dirname, '..', 'assets', 'images', 'android-icon-monochrome.png');
const RES_DIR = path.join(
  __dirname,
  '..',
  'modules',
  'live-update-notification',
  'android',
  'src',
  'main',
  'res'
);

// Status-bar small icon size (24dp) rasterized per density bucket.
const SIZES = { mdpi: 24, hdpi: 36, xhdpi: 48, xxhdpi: 72, xxxhdpi: 96 };

async function main() {
  // Trim the adaptive-icon safe-zone padding using the alpha channel's bounding box.
  const { data: trimmed, info } = await sharp(SOURCE).trim().png().toBuffer({ resolveWithObject: true });
  console.log(`trimmed ${info.width}x${info.height} (source was 1024x1024)`);

  // Force pure white RGB, keep the source alpha as the glyph shape. Sampling
  // showed every partially-transparent (antialiased) pixel in the source is
  // already exactly (255,255,255) — this re-asserts that rather than trusting
  // it forever if the source icon is ever redrawn.
  const alpha = await sharp(trimmed).extractChannel(3).raw().toBuffer();
  const whiteRgb = await sharp({
    create: { width: info.width, height: info.height, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .raw()
    .toBuffer();
  const whiteOnTransparent = await sharp(whiteRgb, { raw: { width: info.width, height: info.height, channels: 3 } })
    .joinChannel(alpha, { raw: { width: info.width, height: info.height, channels: 1 } })
    .png()
    .toBuffer();

  for (const [density, size] of Object.entries(SIZES)) {
    const dir = path.join(RES_DIR, `drawable-${density}`);
    fs.mkdirSync(dir, { recursive: true });
    const outFile = path.join(dir, 'ic_stat_timber.png');
    await sharp(whiteOnTransparent)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(outFile);
    console.log(`wrote drawable-${density}/ic_stat_timber.png (${size}x${size})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
