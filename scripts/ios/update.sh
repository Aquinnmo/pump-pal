#!/usr/bin/env bash
#
# Get the latest Timber code and install a standalone Release build on an iPhone.
# Run npm run ios:setup once before using this command.
#
#   npm run install:apple

set -uo pipefail

# shellcheck source=scripts/ios/_common.sh
source "$(dirname -- "${BASH_SOURCE[0]}")/_common.sh"

preflight

# Homebrew is not always on PATH in a non-login shell on Apple Silicon.
BREW_PREFIX="/usr/local"
[ "$(uname -m)" = "arm64" ] && BREW_PREFIX="/opt/homebrew"
if ! have brew && [ -x "$BREW_PREFIX/bin/brew" ]; then
  eval "$("$BREW_PREFIX/bin/brew" shellenv)"
fi

banner "Timber — install on iPhone"

# ---------------------------------------------------------------------------
step "Checking the one-time setup"

have git || die "Git is missing. Re-run the one-time setup: npm run ios:setup"
have node || die "Node.js is missing. Re-run the one-time setup: npm run ios:setup"
have npm || die "npm is missing. Re-run the one-time setup: npm run ios:setup"
have npx || die "npx is missing. Re-run the one-time setup: npm run ios:setup"
have pod || die "CocoaPods is missing. Re-run the one-time setup: npm run ios:setup"
have xcodebuild || die "Xcode is missing. Re-run the one-time setup: npm run ios:setup"

NODE_MAJOR=$(node -v | sed 's/^v\([0-9]*\).*/\1/')
[ "${NODE_MAJOR:-0}" -ge 20 ] \
  || die "Node $(node -v) is too old. Re-run the one-time setup: npm run ios:setup"
[[ "$(xcode-select -p 2>/dev/null || true)" == *"Xcode.app"* ]] \
  || die "The full Xcode toolchain is not selected. Re-run: npm run ios:setup"
validate_env .env \
  || die "Your .env is missing or incomplete. Ask Aidan for the latest file, then re-run the setup script."
load_apple_config "$APPLE_CONFIG_FILE" \
  || die "The one-time Apple setup is missing. Run: npm run ios:setup"
require_tracking_branch \
  || die "This clone has no tracked Git branch to update. Run npm run ios:setup for guidance."

ok "Node $(node -v), Xcode $(xcodebuild -version | head -n 1), and app settings are ready."
info "Private iOS app identifier: $TIMBER_IOS_BUNDLE_IDENTIFIER"

# ---------------------------------------------------------------------------
step "Getting the latest code"

if [ -n "$(git status --porcelain --untracked-files=no 2>/dev/null)" ]; then
  warn "Tracked files in this repo have local changes:"
  git status --short --untracked-files=no
  say ""
  say "The installer will not merge or discard them. Send Aidan the lines above"
  say "and ask what to do; after they are resolved, run npm run install:apple again."
  die "Stopped before pulling or installing anything."
fi

HEAD_BEFORE=$(git rev-parse HEAD) || die "Could not read the current Git revision."
git pull --ff-only \
  || die "Could not fast-forward to the latest code. Send Aidan the Git error above."
HEAD_AFTER=$(git rev-parse HEAD) || die "Could not read the updated Git revision."

if [ "$HEAD_BEFORE" != "$HEAD_AFTER" ]; then
  ok "Downloaded the latest code. Restarting with the updated installer..."
  exec bash scripts/ios/update.sh
fi
ok "Code is up to date."

# ---------------------------------------------------------------------------
step "Installing project dependencies"

say "Installing the exact package versions from package-lock.json..."
npm ci \
  || die "npm ci failed. Send Aidan the last 20 lines above; the lockfile was not changed."
ok "Dependencies are up to date."

# A pull can introduce new required settings, so validate again after npm ci.
validate_env .env \
  || die "Timber now needs updated settings. Ask Aidan for a new .env file."

# ---------------------------------------------------------------------------
step "Connect your iPhone"

cat <<'MSG'
Connect the iPhone to this Mac with its USB cable, then:

  1. Unlock the phone
  2. Tap Trust and enter the phone passcode if "Trust This Computer?" appears
  3. Turn on Settings → Privacy & Security → Developer Mode if it is off
     (the phone restarts and asks for confirmation)

During the build, choose the connected iPhone—not a simulator. If Xcode asks
for a development team, choose the Personal Team for your Apple Account.

MSG
pause "Press Enter when the iPhone is connected and unlocked."

# ---------------------------------------------------------------------------
step "Build and install"

say "The first Release build normally takes 10-25 minutes. Later builds are faster."
say ""

if ! npx expo run:ios --device --configuration Release --no-bundler; then
  say ""
  warn "The install did not finish. Common fixes:"
  cat <<'MSG'

  • Phone not found          → reconnect it, unlock it, and tap Trust
  • Developer Mode disabled → Settings → Privacy & Security → Developer Mode
  • No development team     → open Xcode → Settings → Accounts and add your Apple Account
  • Signing error           → run npm run ios:setup to repair the private app identifier
  • iOS version unsupported → update Xcode (and macOS if the App Store requires it)

If those do not help, send Aidan the last 20 lines of output.
MSG
  die "Build or installation failed."
fi

# ---------------------------------------------------------------------------
banner "Timber is installed"

cat <<'MSG'
You can disconnect the phone and close this terminal. This Release build runs
without the Mac or a development server.

If iOS blocks the app the first time, open:
  Settings → General → VPN & Device Management → your Apple Account → Trust

A free Apple Personal Team expires after 7 days. When Timber stops opening—or
when Aidan tells you there is an update—connect the phone and run:

    npm run install:apple

That refreshes the signing period and installs the latest code.
MSG
ok "Install complete."
