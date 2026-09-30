const { withPodfile } = require('@expo/config-plugins');

const hook = `
post_integrate do |installer|
  require_relative '../plugins/always-run-script-phases'
  always_run_script_phases(installer.aggregate_targets.map(&:user_project).uniq)
end
`;

function addPostIntegrate(contents) {
  if (contents.includes(hook)) return contents;
  if (/^\s*post_integrate\s+do\b/m.test(contents)) {
    throw new Error('iOS Podfile already has a different post_integrate hook; CocoaPods allows only one');
  }
  return contents + hook;
}

module.exports = function withAlwaysRunScriptPhases(config) {
  return withPodfile(config, (modConfig) => {
    modConfig.modResults.contents = addPostIntegrate(modConfig.modResults.contents);
    return modConfig;
  });
};
module.exports.addPostIntegrate = addPostIntegrate;
