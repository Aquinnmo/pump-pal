const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const filename = require.resolve('expo-router/build/fork/useLinking.native');
const source = fs.readFileSync(filename, 'utf8');

function setup(getInitialURL, currentPath = '/other') {
  const effects = [];
  const notifications = [];
  let listener;
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    process,
    console,
    setTimeout,
    require(name) {
      if (name === 'react') return {
        useRef: (current) => ({ current }),
        useCallback: (callback) => callback,
        useEffect: (effect) => effects.push(effect),
      };
      if (name === 'react-native') return { Linking: {}, Platform: { OS: 'android' } };
      if (name === 'expo-linking') return {};
      if (name === './extractPathFromURL') return { extractExpoPathFromURL: (_, url) => url?.replace('timber://', '/') };
      if (name === '../react-navigation/native') return { useNavigationIndependentTree: () => false };
      throw new Error(`Unexpected import: ${name}`);
    },
  }, { filename });
  const navigation = {
    getCurrentRoute: () => ({ path: currentPath }),
    getRootState: () => ({ routeNames: ['target'] }),
    dispatch() {},
  };
  const { getInitialState } = exports.useLinking({ current: navigation }, {
    prefixes: ['timber://'],
    getInitialURL,
    getStateFromPath: (path) => ({ routes: [{ name: 'target', path }] }),
    getActionFromState: () => ({ type: 'NAVIGATE' }),
    subscribe: (callback) => { listener = callback; return () => {}; },
  }, (path) => notifications.push(path));
  return {
    getInitialState, notifications,
    mount: () => { const cleanups = effects.map((effect) => effect()); return () => cleanups.forEach((cleanup) => cleanup?.()); },
    receiveLink: (url) => listener(url),
  };
}

(async () => {
  for (const url of ['timber://target', Promise.resolve('timber://target')]) {
    const hook = setup(() => url);
    const state = await hook.getInitialState();
    assert.equal(state.routes[0].path, '/target', 'initial navigation state is preserved');
    assert.deepEqual(hook.notifications, [], 'initial link must not update an uncommitted navigator');
    const unmount = hook.mount();
    assert.deepEqual(hook.notifications, ['/target'], 'pending initial link is reported after mount');
    hook.receiveLink('timber://later');
    assert.deepEqual(hook.notifications, ['/target', '/later'], 'live deep links still report immediately');
    unmount();
  }

  const handled = setup(() => Promise.resolve('timber://target'), '/target');
  await handled.getInitialState();
  handled.mount()();
  assert.deepEqual(handled.notifications, [], 'a link already handled by onReady stays cleared');

  const mounted = setup(() => Promise.resolve('timber://target'));
  const cleanup = mounted.mount();
  await mounted.getInitialState();
  assert.deepEqual(mounted.notifications, ['/target'], 'initial link resolved after mount reports immediately');
  cleanup();

  let resolve;
  const hook = setup(() => new Promise((done) => { resolve = done; }));
  const state = hook.getInitialState();
  const unmount = hook.mount();
  unmount();
  resolve('timber://target');
  await state;
  assert.deepEqual(hook.notifications, [], 'late initial link must not update an unmounted navigator');
  console.log('Expo Router initial links: no pre-mount or post-unmount state updates; navigation preserved');
})().catch((error) => { console.error(error); process.exitCode = 1; });
