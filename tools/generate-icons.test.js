#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(__dirname, 'generate-icons.js');

function attributes(source) {
  return Object.fromEntries([...source.matchAll(/([\w-]+)="([^"]+)"/g)].map((match) => [match[1], match[2]]));
}

function pixel(raw, x, y) {
  const offset = (y * raw.info.width + x) * raw.info.channels;
  return [...raw.data.subarray(offset, offset + raw.info.channels)];
}

function circlesWithRadius(circles, radius) {
  return circles.filter((circle) => Math.abs(Number(circle.r) - radius) < 0.001);
}

async function readRgba(file) {
  return sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

async function run() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'timber-generate-icons-'));
  try {
    const tempTools = path.join(tempRoot, 'tools');
    const tempImages = path.join(tempRoot, 'apps', 'mobile', 'assets', 'images');
    fs.mkdirSync(tempTools, { recursive: true });
    fs.mkdirSync(tempImages, { recursive: true });
    fs.copyFileSync(SOURCE, path.join(tempTools, 'generate-icons.js'));

    const result = spawnSync(process.execPath, [path.join(tempTools, 'generate-icons.js')], {
      cwd: tempRoot,
      encoding: 'utf8',
      env: { ...process.env, NODE_PATH: path.join(ROOT, 'node_modules') },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /wrote icon\.svg/);
    assert.match(result.stdout, /done/);

    const expectedFiles = [
      'android-icon-background.png',
      'android-icon-foreground.png',
      'android-icon-monochrome.png',
      'favicon.png',
      'icon.png',
      'icon.svg',
      'splash-icon.png',
    ];
    assert.deepEqual(fs.readdirSync(tempImages).sort(), expectedFiles, 'generator output contract');

    const svg = fs.readFileSync(path.join(tempImages, 'icon.svg'), 'utf8');
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 1024 1024" width="1024" height="1024">/);
    assert.match(svg, /<rect width="1024" height="1024" fill="#111111"\/>/);
    assert.equal((svg.match(/<rect\b/g) ?? []).length, 1, 'branded master has one background rect');

    const circles = [...svg.matchAll(/<circle\s+([^>]+)\/>/g)].map((match) => attributes(match[1]));
    assert.equal(circles.length, 36, 'six logs contain six circles each');
    const outerCircles = circles.filter((circle) => circle.r === '112');
    assert.equal(outerCircles.length, 6);
    assert.deepEqual(
      outerCircles.map(({ cx, cy }) => [Number(cx), Number(cy)]),
      [[288, 706], [512, 706], [736, 706], [400, 512], [624, 512], [512, 318]],
      'stacked-log geometry and draw order',
    );

    for (const circle of circles) {
      assert.ok(Number(circle.cx) >= 0 && Number(circle.cx) <= 1024);
      assert.ok(Number(circle.cy) >= 0 && Number(circle.cy) <= 1024);
    }
    for (let first = 0; first < outerCircles.length; first += 1) {
      for (let second = first + 1; second < outerCircles.length; second += 1) {
        const dx = Number(outerCircles[first].cx) - Number(outerCircles[second].cx);
        const dy = Number(outerCircles[first].cy) - Number(outerCircles[second].cy);
        assert.ok(Math.hypot(dx, dy) >= 224, 'outer logs remain tangent or separated');
      }
    }
    assert.deepEqual(
      circles.filter((circle) => circle.r === '112').map((circle) => circle.fill),
      Array(6).fill('#4A3324'),
      'bark palette',
    );
    assert.equal(circlesWithRadius(circles, 91.84).filter((circle) => circle.fill === '#6E4A30').length, 6, 'sapwood palette');
    assert.equal(circlesWithRadius(circles, 80.64).filter((circle) => circle.fill === '#C9A567').length, 6, 'face palette');
    assert.equal(circlesWithRadius(circles, 56).filter((circle) => circle.fill === 'none' && circle.stroke === '#E54242' && circle['stroke-width'] === '10').length, 6, 'inner ring palette');
    assert.equal(circlesWithRadius(circles, 31.36).filter((circle) => circle.fill === 'none' && circle.stroke === '#E54242' && circle['stroke-width'] === '10').length, 6, 'outer ring palette');
    assert.equal(circlesWithRadius(circles, 14).filter((circle) => circle.fill === '#E54242').length, 6, 'pith palette');

    const dimensions = {
      'icon.png': 1024,
      'android-icon-foreground.png': 1024,
      'android-icon-background.png': 1024,
      'android-icon-monochrome.png': 1024,
      'favicon.png': 196,
      'splash-icon.png': 400,
    };
    const images = {};
    for (const [file, size] of Object.entries(dimensions)) {
      const raw = await readRgba(path.join(tempImages, file));
      images[file] = raw;
      assert.deepEqual([raw.info.width, raw.info.height], [size, size], `${file} dimensions`);
    }

    assert.deepEqual(pixel(images['icon.png'], 0, 0), [17, 17, 17, 255], 'branded icon is opaque ground');
    assert.deepEqual(pixel(images['favicon.png'], 0, 0), [17, 17, 17, 255], 'favicon is opaque ground');
    assert.deepEqual(pixel(images['android-icon-background.png'], 0, 0), [17, 17, 17, 255], 'adaptive background is opaque ground');
    assert.deepEqual(pixel(images['android-icon-background.png'], 512, 512), [17, 17, 17, 255], 'adaptive background has no glyph');
    assert.deepEqual(pixel(images['android-icon-foreground.png'], 0, 0), [0, 0, 0, 0], 'foreground preserves transparency');
    assert.deepEqual(pixel(images['splash-icon.png'], 0, 0), [0, 0, 0, 0], 'splash preserves transparency');
    assert.deepEqual(pixel(images['android-icon-monochrome.png'], 0, 0), [0, 0, 0, 0], 'monochrome preserves transparency');
    assert.deepEqual(pixel(images['android-icon-foreground.png'], 512, 318), [229, 66, 66, 255], 'foreground keeps branded pith');
    assert.deepEqual(pixel(images['android-icon-monochrome.png'], 512, 318), [255, 255, 255, 255], 'monochrome is a white silhouette');

    console.log('generate-icons: geometry, palette, variants, and output contract passed');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
