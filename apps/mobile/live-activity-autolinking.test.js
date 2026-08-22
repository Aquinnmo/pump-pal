const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const mobileRoot = __dirname;
const repoRoot = path.join(mobileRoot, '..', '..');
const moduleRoot = path.join(mobileRoot, 'modules', 'live-update-notification');
const autolinkingBin = path.join(repoRoot, 'node_modules', '.bin', 'expo-modules-autolinking');
const podspecPath = path.join(moduleRoot, 'LiveUpdateNotification.podspec');
const moduleConfigPath = path.join(moduleRoot, 'expo-module.config.json');

const moduleConfig = JSON.parse(fs.readFileSync(moduleConfigPath, 'utf8'));
const podspec = fs.readFileSync(podspecPath, 'utf8');
assert.equal(moduleConfig.ios.podspecPath, './LiveUpdateNotification.podspec');
assert.deepEqual(moduleConfig.ios.modules, ['LiveUpdateNotificationModule']);
assert.match(podspec, /s\.name\s+=\s+'LiveUpdateNotification'/);
assert.match(podspec, /s\.dependency\s+'ExpoModulesCore'/);
assert.match(podspec, /s\.source_files\s+=\s+'ios\/\*\*\/\*\.\{h,m,mm,swift\}'/);

const resolved = JSON.parse(
  execFileSync(autolinkingBin, ['resolve', '--platform', 'ios', '--json'], {
    cwd: mobileRoot,
    encoding: 'utf8',
  }),
);
const resolvedModule = resolved.modules.find(
  (module) => module.packageName === 'live-update-notification',
);
assert.ok(resolvedModule, 'iOS autolinking must resolve the Live Activity module');
assert.deepEqual(resolvedModule.pods, [
  {
    podName: 'LiveUpdateNotification',
    podspecDir: moduleRoot,
  },
]);
assert.deepEqual(resolvedModule.swiftModuleNames, ['LiveUpdateNotification']);
assert.deepEqual(resolvedModule.modules, [{ name: null, class: 'LiveUpdateNotificationModule' }]);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'timber-live-activity-autolinking-'));
const providerPath = path.join(tempRoot, 'ExpoModulesProvider.swift');
try {
  execFileSync(
    autolinkingBin,
    [
      'generate-modules-provider',
      '--platform',
      'ios',
      '--project-root',
      mobileRoot,
      '--target',
      providerPath,
      '--entitlement',
      path.join(mobileRoot, 'ios', 'Timber', 'Timber.entitlements'),
      '--app-root',
      mobileRoot,
      '--podfile-properties-file-path',
      path.join(mobileRoot, 'ios', 'Podfile.properties.json'),
      '--packages',
      'live-update-notification',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  const provider = fs.readFileSync(providerPath, 'utf8');
  assert.match(provider, /internal import LiveUpdateNotification/);
  assert.match(provider, /\(module: LiveUpdateNotificationModule\.self, name: nil\)/);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('iOS Live Activity autolinking contract tests passed');
