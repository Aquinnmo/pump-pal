// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // eslint-config-expo 57 pulls in eslint-plugin-react-hooks 7.x, which adds
    // new React Compiler-safety rules on top of rules-of-hooks/exhaustive-deps.
    // They false-positive heavily on patterns this codebase relies on:
    // - react-hooks/immutability flags Reanimated's `sharedValue.value = x`,
    //   which is that library's documented public API, not a hooks violation.
    // - react-hooks/refs flags `useRef(...).current` read during render, the
    //   standard idiom for a lazily-initialized ref (e.g. Animated.Value).
    // - react-hooks/set-state-in-effect and react-hooks/purity flag existing
    //   derived-state-in-effect and event-handler patterns across many
    //   screens; fixing those is an app-wide architecture change, out of
    //   scope for a dependency realignment.
    // Left enabled: rules-of-hooks, exhaustive-deps.
    rules: {
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
    },
  },
]);
