#!/usr/bin/env bash
#
# First-time setup: takes a Mac with nothing on it and puts Timber on an iPhone.
# Safe to re-run — every step checks before it does anything.
#
#   bash scripts/ios/setup.sh
#
# After this, use scripts/ios/update.sh for day-to-day work.

set -uo pipefail

# shellcheck source=scripts/ios/_common.sh
source "$(dirname -- "${BASH_SOURCE[0]}")/_common.sh"

preflight

banner "Timber — iPhone setup"
cat <<'INTRO'
This will get Timber running on your iPhone. It takes about 20-40 minutes,
most of which is downloads and one long first build.

It will ask before installing anything, and it's safe to stop (Ctrl-C) and
re-run later — it picks up where it left off.

You'll need:
  • Xcode installed from the App Store
  • Your iPhone and its USB cable
  • Your own Apple ID (any free one — you don't need a paid developer account)
  • The block of settings text Aidan sent you

INTRO
confirm "Ready to start?" y || { say "No problem — run this again whenever you are."; exit 0; }

# ---------------------------------------------------------------------------
step "Xcode"

if [ ! -d /Applications/Xcode.app ]; then
  cat <<'MSG'
Xcode isn't installed yet, and it's a big download (~10 GB) that has to come
from the App Store, so this script can't do it for you.

  1. Open the App Store
  2. Search for "Xcode"
  3. Install it, then OPEN it once and let it finish "installing components"
  4. Run this script again

MSG
  die "Install Xcode first, then re-run: bash scripts/ios/setup.sh"
fi
ok "Xcode is installed."

# Command Line Tools: needed by Homebrew and by the build.
if ! xcode-select -p >/dev/null 2>&1; then
  say "Installing the Xcode Command Line Tools. A system dialog will pop up —"
  say "click ${BOLD}Install${RESET} and wait for it to finish."
  xcode-select --install >/dev/null 2>&1 || true
  say ""
  tries=0
  while ! xcode-select -p >/dev/null 2>&1; do
    tries=$((tries + 1))
    if [ $tries -gt 240 ]; then  # 20 minutes
      die "Still waiting on the Command Line Tools. Finish that installer, then re-run this script."
    fi
    printf '\r%s' "${DIM}  waiting for the Command Line Tools installer...${RESET}"
    sleep 5
  done
  printf '\n'
fi
ok "Command Line Tools are installed."

# Building to a device needs the full Xcode toolchain, not just the CLT.
if [[ "$(xcode-select -p)" != *"Xcode.app"* ]]; then
  warn "Your developer tools are pointed at the Command Line Tools, but building"
  warn "to an iPhone needs the full Xcode. This needs your Mac password."
  if confirm "Point them at Xcode now?" y; then
    sudo xcode-select -s /Applications/Xcode.app/Contents/Developer \
      || die "Couldn't switch to Xcode. Run: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
  else
    die "Can't build to a device until this is switched over."
  fi
fi

# The license prompt blocks builds with an unhelpful error if it's unaccepted.
if ! xcodebuild -version >/dev/null 2>&1; then
  warn "Xcode's licence hasn't been accepted yet. This needs your Mac password."
  sudo xcodebuild -license accept || die "Run 'sudo xcodebuild -license accept' and try again."
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
  say "Homebrew is the package manager we'll use to install everything else."
  say "It's the standard tool for this and installs to ${BREW_PREFIX}."
  confirm "Install Homebrew?" y || die "Homebrew is required to continue."

  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" \
    || die "Homebrew install failed. See https://brew.sh for manual instructions."

  [ -x "$BREW_PREFIX/bin/brew" ] || die "Homebrew installed but wasn't found at $BREW_PREFIX/bin/brew."
  eval "$("$BREW_PREFIX/bin/brew" shellenv)"

  # Make brew available in future terminal windows too.
  SHELL_PROFILE="$HOME/.zprofile"
  [ "$(basename -- "${SHELL:-/bin/zsh}")" = "bash" ] && SHELL_PROFILE="$HOME/.bash_profile"
  BREW_LINE="eval \"\$($BREW_PREFIX/bin/brew shellenv)\""
  if ! grep -qF "$BREW_LINE" "$SHELL_PROFILE" 2>/dev/null; then
    printf '\n%s\n' "$BREW_LINE" >> "$SHELL_PROFILE"
    info "Added Homebrew to $SHELL_PROFILE so new terminals can find it."
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
    warn "Node $(node -v) is too old — this project needs Node 20 or newer."
  fi
fi

if [ "$NODE_OK" = false ]; then
  confirm "Install Node.js with Homebrew?" y || die "Node.js is required to continue."
  brew install node || die "Node install failed."
  have node || die "Node installed but isn't on your PATH. Open a new terminal and re-run this script."
fi
ok "Node $(node -v), npm $(npm -v)"

# ---------------------------------------------------------------------------
step "Build tools (CocoaPods, Watchman)"

# CocoaPods from Homebrew rather than 'gem install' — the macOS system Ruby
# makes gem installs fail in confusing ways.
for tool in cocoapods watchman; do
  if brew list --formula "$tool" >/dev/null 2>&1; then
    ok "$tool is already installed."
  else
    say "Installing $tool..."
    brew install "$tool" || die "Failed to install $tool."
  fi
done
have pod && ok "CocoaPods $(pod --version)"

# ---------------------------------------------------------------------------
step "App settings (.env)"

if validate_env .env --quiet; then
  ok "Your .env is already set up."
else
  [ -f .env ] && warn "The existing .env is incomplete — we'll replace it."
  cat <<'MSG'

Timber needs a small block of settings (database keys) to run. Aidan sent you
this as a message — it's about 10 lines and starts with:

    EXPO_PUBLIC_FIREBASE_API_KEY=...

MSG
  attempt=0
  while true; do
    attempt=$((attempt + 1))
    if [ $attempt -gt 3 ]; then
      die "Couldn't read a valid .env. Ask Aidan to re-send it, then run this script again."
    fi

    say "${BOLD}Paste the whole block below, then press Enter and Ctrl-D to finish:${RESET}"
    say ""
    TMP_ENV=$(mktemp)
    cat > "$TMP_ENV" < /dev/tty
    say ""

    if ENV_LABEL="What you pasted" validate_env "$TMP_ENV"; then
      mv "$TMP_ENV" .env
      chmod 600 .env
      ok "Saved .env"
      break
    fi
    rm -f "$TMP_ENV"
    say ""
    warn "That paste was incomplete. Make sure you copied the entire message."
    say ""
  done
fi

# ---------------------------------------------------------------------------
step "Project dependencies"

say "Installing the app's packages. This takes a few minutes the first time."
if ! npm ci; then
  warn "npm ci failed (usually the lockfile is out of date) — falling back to npm install."
  npm install || die "Couldn't install dependencies."
fi
ok "Dependencies installed."

# ---------------------------------------------------------------------------
step "Connect your iPhone"

cat <<'MSG'

Now plug your iPhone into the Mac with its cable:

  1. Plug it in
  2. Unlock the phone
  3. If it asks "Trust This Computer?", tap Trust and enter your passcode
  4. On the phone, turn on Developer Mode:
       Settings → Privacy & Security → Developer Mode → On
     (the phone will restart — that's normal)

MSG
pause "Press Enter once your iPhone is plugged in and unlocked."

# ---------------------------------------------------------------------------
step "Build and install"

cat <<'MSG'

Building now. The first build takes 10-25 minutes — it's compiling the whole
app from scratch. Later builds are much faster.

Two things will ask for input along the way:

  • "Select a device"  → pick your iPhone from the list (not a simulator)
  • "Apple ID"         → sign in with YOUR OWN Apple ID. Any free Apple ID
                         works. This is only used to sign the app so your
                         phone will run it. Aidan never sees it.

MSG
pause "Press Enter to start the build."
say ""

if ! npx expo run:ios --device; then
  say ""
  warn "The build didn't finish. The most common causes:"
  cat <<'MSG'

  • iPhone locked or unplugged  → plug it back in, unlock it, re-run this script
  • "Developer Mode disabled"   → Settings → Privacy & Security → Developer Mode
  • Signing / bundle ID error   → someone else already registered this app ID.
                                  Re-run with your own ID instead:
                                    APP_VARIANT=development bash scripts/ios/setup.sh
  • Anything else               → send Aidan the last 20 lines of the output

MSG
  die "Build failed."
fi

# ---------------------------------------------------------------------------
banner "Almost there — one step on the phone"

cat <<'MSG'

The app is installed, but iOS won't let it open until you approve it:

  On your iPhone:  Settings → General → VPN & Device Management
                   → tap your Apple ID → Trust

Then open Timber from your home screen.

MSG

cat <<'MSG'
Two things worth knowing:

  • Because this uses a free Apple ID, the app STOPS WORKING AFTER 7 DAYS.
    That's an Apple rule, not a bug. To fix it, plug the phone in and run:

        bash scripts/ios/update.sh

    and choose "Rebuild". Same thing whenever Aidan ships an update.

  • From now on, use update.sh — never this script again.

MSG
ok "Setup complete."
