#!/usr/bin/env bash
#
# One-time Mac setup for installing Timber on an iPhone.
#
#   bash scripts/ios/setup.sh
#
# After this succeeds, only use: npm run install:apple

set -uo pipefail

# shellcheck source=scripts/ios/_common.sh
source "$(dirname -- "${BASH_SOURCE[0]}")/_common.sh"

preflight

banner "Timber — one-time Apple setup"
cat <<'INTRO'
This prepares your Mac to build Timber for your iPhone. It can take 10-30
minutes if it needs to download developer tools.

It will ask before installing anything, and it is safe to stop with Ctrl-C and
run it again later.

Before continuing, you need:
  • Xcode installed from the App Store and opened once
  • The .env file Aidan sent you, saved in this repo
  • Your Apple Account credentials and two-factor authentication

INTRO
confirm "Ready to start?" y || { say "No problem — run this again whenever you are ready."; exit 0; }

# ---------------------------------------------------------------------------
step "Xcode"

if [ ! -d /Applications/Xcode.app ]; then
  cat <<'MSG'
Xcode is not installed yet, and it is a large App Store download that this
script cannot perform for you.

  1. Open the App Store
  2. Search for "Xcode" and install it
  3. Open Xcode once and let it finish installing components
  4. Run this script again

MSG
  die "Install Xcode first, then re-run: bash scripts/ios/setup.sh"
fi
ok "Xcode is installed."

if ! xcode-select -p >/dev/null 2>&1; then
  say "Installing the Xcode Command Line Tools. A system dialog will appear —"
  say "click ${BOLD}Install${RESET} and wait for it to finish."
  xcode-select --install >/dev/null 2>&1 || true
  tries=0
  while ! xcode-select -p >/dev/null 2>&1; do
    tries=$((tries + 1))
    if [ $tries -gt 240 ]; then
      die "Still waiting for the Command Line Tools. Finish the installer, then re-run this script."
    fi
    printf '\r%s' "${DIM}  waiting for the Command Line Tools installer...${RESET}"
    sleep 5
  done
  printf '\n'
fi
ok "Command Line Tools are installed."

if [[ "$(xcode-select -p)" != *"Xcode.app"* ]]; then
  warn "Developer tools are not pointed at the full Xcode installation."
  warn "Changing this requires your Mac password."
  if confirm "Point them at Xcode now?" y; then
    sudo xcode-select -s /Applications/Xcode.app/Contents/Developer \
      || die "Could not switch to Xcode. Run: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
  else
    die "Building for an iPhone requires the full Xcode toolchain."
  fi
fi

if ! xcodebuild -version >/dev/null 2>&1; then
  warn "Xcode's license has not been accepted. This requires your Mac password."
  sudo xcodebuild -license accept \
    || die "Run 'sudo xcodebuild -license accept' and try again."
fi
ok "Xcode toolchain is ready: $(xcodebuild -version | head -n 1)"

# ---------------------------------------------------------------------------
step "Homebrew"

BREW_PREFIX="/usr/local"
[ "$(uname -m)" = "arm64" ] && BREW_PREFIX="/opt/homebrew"

if ! have brew && [ -x "$BREW_PREFIX/bin/brew" ]; then
  eval "$("$BREW_PREFIX/bin/brew" shellenv)"
fi

if ! have brew; then
  say "Homebrew is the package manager used to install the remaining tools."
  confirm "Install Homebrew?" y || die "Homebrew is required to continue."

  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" \
    || die "Homebrew installation failed. See https://brew.sh for manual instructions."

  [ -x "$BREW_PREFIX/bin/brew" ] \
    || die "Homebrew installed but was not found at $BREW_PREFIX/bin/brew."
  eval "$("$BREW_PREFIX/bin/brew" shellenv)"

  SHELL_PROFILE="$HOME/.zprofile"
  [ "$(basename -- "${SHELL:-/bin/zsh}")" = "bash" ] && SHELL_PROFILE="$HOME/.bash_profile"
  BREW_LINE="eval \"\$($BREW_PREFIX/bin/brew shellenv)\""
  if ! grep -qF "$BREW_LINE" "$SHELL_PROFILE" 2>/dev/null; then
    printf '\n%s\n' "$BREW_LINE" >> "$SHELL_PROFILE"
    info "Added Homebrew to $SHELL_PROFILE for future terminal windows."
  fi
fi
ok "Homebrew is ready: $(brew --version | head -n 1)"

# ---------------------------------------------------------------------------
step "Node.js"

NODE_OK=false
if have node; then
  NODE_MAJOR=$(node -v | sed 's/^v\([0-9]*\).*/\1/')
  if [ "${NODE_MAJOR:-0}" -ge 20 ]; then
    NODE_OK=true
  else
    warn "Node $(node -v) is too old — Timber needs Node 20 or newer."
  fi
fi

if [ "$NODE_OK" = false ]; then
  confirm "Install Node.js with Homebrew?" y || die "Node.js is required to continue."
  brew install node || die "Node.js installation failed."
  have node \
    || die "Node installed but is not on PATH. Open a new terminal and re-run this script."
fi
ok "Node $(node -v), npm $(npm -v)"

# ---------------------------------------------------------------------------
step "CocoaPods"

if brew list --formula cocoapods >/dev/null 2>&1; then
  ok "CocoaPods is already installed."
else
  say "Installing CocoaPods, which Xcode uses for the app's native packages..."
  brew install cocoapods || die "CocoaPods installation failed."
fi
have pod || die "CocoaPods installed but 'pod' is not on PATH. Open a new terminal and re-run this script."
ok "CocoaPods $(pod --version)"

# ---------------------------------------------------------------------------
step "App settings"

validate_env .env \
  || die "Add the complete .env file Aidan sent you to this repo, then re-run: bash scripts/ios/setup.sh"
ok ".env contains the required Timber settings."

ensure_apple_config "$APPLE_CONFIG_FILE"
load_apple_config "$APPLE_CONFIG_FILE" \
  || die "Could not validate the local Apple setup. Re-run: bash scripts/ios/setup.sh"
ok "Using this clone's private app identifier: $TIMBER_IOS_BUNDLE_IDENTIFIER"

# ---------------------------------------------------------------------------
step "Apple Account in Xcode"

cat <<'MSG'
Xcode needs your Apple Account to sign an app for your phone. A free Personal
Team works; you do not need a paid Apple Developer membership.

In Xcode:
  1. Open Xcode → Settings → Accounts
  2. Click + and choose Apple Account if your account is not already listed
  3. Sign in and complete two-factor authentication

MSG
if ! confirm "Is your Apple Account listed in Xcode?" n; then
  open -a Xcode >/dev/null 2>&1 || true
  pause "Add your account in Xcode Settings → Accounts, then press Enter here."
fi

# ---------------------------------------------------------------------------
banner "One-time setup is ready"

cat <<'MSG'
From now on, this is the only command you need:

    npm run install:apple

That command gets the latest code and installs a standalone copy of Timber on
your connected iPhone. The first install normally takes 10-25 minutes.

Have your iPhone, USB cable, phone passcode, and Apple Account available before
you run it.
MSG
ok "Setup complete."
