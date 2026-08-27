const { withDangerousMod, withXcodeProject, IOSConfig } = require('@expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const SOURCE_FILENAME = 'WorkoutLiveActivityIntents.swift';
const TARGET_RELATIVE_PATH = path.join('Timber', SOURCE_FILENAME);

/**
 * WorkoutLiveActivityIntents.swift conforms to LiveActivityIntent, which iOS runs in
 * the APP's process (not the widget extension's) — that is the entire reason the
 * protocol exists instead of plain AppIntent. The file lives under
 * targets/widget/ as its one source of truth (so it can't drift the way the two
 * LiveUpdateSharedStore.swift copies already do) and compiles into the TimberWidget
 * extension via @bacons/apple-targets. This plugin gives the app target its own
 * membership of the same file, copied fresh on every prebuild.
 *
 * The intent's LiveUpdateSharedStore reference resolves against the app target's own
 * copy at modules/live-update-notification/ios/LiveUpdateSharedStore.swift — same
 * appGroupId, same UserDefaults keys, one container.
 */
module.exports = function withLiveActivityIntents(config) {
  config = withDangerousMod(config, [
    'ios',
    (modConfig) => {
      const sourcePath = path.join(
        modConfig.modRequest.projectRoot,
        'targets',
        'widget',
        SOURCE_FILENAME,
      );
      const destPath = path.join(modConfig.modRequest.platformProjectRoot, TARGET_RELATIVE_PATH);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(sourcePath, destPath);
      return modConfig;
    },
  ]);

  return withXcodeProject(config, (modConfig) => {
    const project = modConfig.modResults;
    const alreadyLinked = Object.values(project.hash.project.objects.PBXBuildFile ?? {}).some(
      (entry) => entry && typeof entry === 'object' && entry.fileRef_comment === SOURCE_FILENAME,
    );

    if (!alreadyLinked) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath: TARGET_RELATIVE_PATH,
        groupName: 'Timber',
        project,
      });
    }

    return modConfig;
  });
};
