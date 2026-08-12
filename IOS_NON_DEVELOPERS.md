# Non-Developer iOS local setup

## Prerequisites:

You the following external dependencies.

Use homebrew to install what you need to make it easy.

### Hombrew Installation:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### Dependencies:

1. [XCode](https://developer.apple.com/xcode/) (download from the app store)
2. Node (install via `brew install node` if homebrew is installed or visit [here](https://nodejs.org/en/download)) — Xcode's React Native build phase still shells out to `node` directly, independent of the package manager
3. Bun (install via `brew install bun` if homebrew is installed or visit [here](https://bun.sh))

## Installation:

1. Connect your iPhone to your Mac
2. Sign into Xcode with your apple account (you do NOT need a paid membership)
3. run the following commands:

```bash
bun install
bunx expo run:ios --device --configuration Release
```

You will have approx 7 days until Apple invalidates the app credentials and you have to reinstall.

To renistall the latest version after the initial setup, just run

```bash
bun run install:apple

```
