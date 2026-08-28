const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');

const DENSITIES = {
  mdpi: 24,
  hdpi: 36,
  xhdpi: 48,
  xxhdpi: 72,
  xxxhdpi: 96,
};

function digest(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function snapshotFiles(roots) {
  const snapshot = [];

  function visit(root, current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const filePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(root, filePath);
      } else {
        snapshot.push([path.relative(root, filePath), digest(filePath)]);
      }
    }
  }

  for (const root of roots) {
    visit(root, root);
  }
  return snapshot.sort(([left], [right]) => left.localeCompare(right));
}

function alphaBounds(data, info) {
  const bounds = { minX: info.width, maxX: -1, minY: info.height, maxY: -1 };
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + 3];
      if (alpha > 0) {
        bounds.minX = Math.min(bounds.minX, x);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxY = Math.max(bounds.maxY, y);
      }
    }
  }
  return bounds;
}

function fileList(root) {
  const files = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const filePath = path.join(current, entry.name);
      if (entry.isDirectory()) visit(filePath);
      else files.push(path.relative(root, filePath));
    }
  }
  visit(root);
  return files.sort();
}

async function writeFixtureSource(filePath) {
  // The glyph occupies an 8x4 rectangle inside a 12x10 transparent canvas.
  // Its RGB is intentionally not white, so the generator must discard it.
  const width = 12;
  const height = 10;
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 3; y < 7; y += 1) {
    for (let x = 2; x < 10; x += 1) {
      const offset = (y * width + x) * 4;
      pixels[offset] = 32;
      pixels[offset + 1] = 96;
      pixels[offset + 2] = 160;
      pixels[offset + 3] = x === 2 || x === 9 || y === 3 || y === 6 ? 128 : 255;
    }
  }
  await sharp(pixels, { raw: { width, height, channels: 4 } }).png().toFile(filePath);
}

async function main() {
  const repositoryRoot = path.join(__dirname, '..');
  const canonicalRoots = [
    path.join(repositoryRoot, 'apps', 'mobile', 'assets', 'images'),
    path.join(
      repositoryRoot,
      'apps',
      'mobile',
      'modules',
      'live-update-notification',
      'android',
      'src',
      'main',
      'res'
    ),
  ];
  const canonicalBefore = snapshotFiles(canonicalRoots);
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'generate-ic-stat-timber-test-'));

  try {
    const fixtureScript = path.join(temporaryRoot, 'tools', 'generate-ic-stat-timber.js');
    const fixtureSource = path.join(
      temporaryRoot,
      'apps',
      'mobile',
      'assets',
      'images',
      'android-icon-monochrome.png'
    );
    fs.mkdirSync(path.dirname(fixtureScript), { recursive: true });
    fs.mkdirSync(path.dirname(fixtureSource), { recursive: true });
    fs.copyFileSync(path.join(__dirname, 'generate-ic-stat-timber.js'), fixtureScript);
    await writeFixtureSource(fixtureSource);
    const sourceBefore = digest(fixtureSource);

    const output = execFileSync(process.execPath, [fixtureScript], {
      cwd: temporaryRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_PATH: path.join(repositoryRoot, 'node_modules'),
      },
    });
    assert.match(output, /trimmed 8x4 \(source was 1024x1024\)/);

    const expectedOutputFiles = [];
    for (const [density, size] of Object.entries(DENSITIES)) {
      const relativeOutput = path.join(
        'apps',
        'mobile',
        'modules',
        'live-update-notification',
        'android',
        'src',
        'main',
        'res',
        `drawable-${density}`,
        'ic_stat_timber.png'
      );
      expectedOutputFiles.push(relativeOutput);
      const outputFile = path.join(temporaryRoot, relativeOutput);
      const { data, info } = await sharp(outputFile).raw().toBuffer({ resolveWithObject: true });
      assert.equal(info.width, size, `${density} width`);
      assert.equal(info.height, size, `${density} height`);

      const bounds = alphaBounds(data, info);
      assert.deepEqual(
        [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY],
        [0, size / 4, size - 1, (size * 3) / 4 - 1],
        `${density} preserves the trimmed 2:1 glyph ratio`
      );

      let opaquePixels = 0;
      for (let index = 0; index < data.length; index += 4) {
        const alpha = data[index + 3];
        if (alpha === 255) {
          opaquePixels += 1;
          assert.deepEqual(
            [...data.subarray(index, index + 3)],
            [255, 255, 255],
            `${density} opaque glyph pixels are pure white`
          );
        } else if (alpha > 0) {
          assert.ok(
            data[index] >= 240 && data[index + 1] >= 240 && data[index + 2] >= 240,
            `${density} antialiased glyph pixels do not retain fixture RGB`
          );
        }
      }
      assert.ok(opaquePixels > 0, `${density} contains opaque glyph pixels`);
      assert.equal(data[3], 0, `${density} transparent corner remains transparent`);
    }

    const expectedFiles = [
      path.join('tools', 'generate-ic-stat-timber.js'),
      path.relative(temporaryRoot, fixtureSource),
      ...expectedOutputFiles,
    ].sort();
    assert.deepEqual(fileList(temporaryRoot), expectedFiles, 'generator stays inside fixture image/resource boundaries');
    assert.equal(digest(fixtureSource), sourceBefore, 'generator does not rewrite its source image');
    assert.deepEqual(snapshotFiles(canonicalRoots), canonicalBefore, 'canonical assets remain untouched');
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }

  console.log('generate-ic-stat-timber.test.js passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
