// Monorepo Metro setup. Without this, Metro only watches and resolves from
// apps/mobile, so an edit in packages/contract never triggers a rebuild and its
// import fails to resolve at all — the installer hoists shared dependencies to
// the workspace root, which is outside Metro's default search path.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// Deliberately NOT setting resolver.disableHierarchicalLookup. It appears in
// Expo's monorepo snippet, but it confines resolution to exactly the two paths
// above, which breaks any dependency the installer chose to nest rather than
// hoist: expo-router keeps its own copy of standard-navigation at
// node_modules/expo-router/node_modules/, and with the flag on Metro never
// looks there — "Unable to resolve standard-navigation".

module.exports = config;
