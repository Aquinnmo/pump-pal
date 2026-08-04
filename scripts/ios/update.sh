#!/usr/bin/env bash
#
# Day-to-day script: pull the latest code and run the app.
# Run scripts/ios/setup.sh once first.
#
#   bash scripts/ios/update.sh

set -uo pipefail

# shellcheck source=scripts/ios/_common.sh
source "$(dirname -- "${BASH_SOURCE[0]}")/_common.sh"

preflight

# Homebrew isn't on the PATH of a non-login shell on Apple Silicon.
BREW_PREFIX="/usr/local"
[ "$(uname -m)" = "arm64" ] && BREW_PREFIX="/opt/homebrew"
if ! have brew && [ -x "$BREW_PREFIX/bin/brew" ]; then
  eval "$("$BREW_PREFIX/bin/brew" shellenv)"
fi

banner "Timber — update"

# ---------------------------------------------------------------------------
step "Checking your setup"

have node || die "Node isn't installed. Run the first-time setup: bash scripts/ios/setup.sh"
have npx  || die "npm isn't installed properly. Run: bash scripts/ios/setup.sh"
validate_env .env || die "Your .env is missing or incomplete. Run: bash scripts/ios/setup.sh"
ok "Node $(node -v), .env looks good."

# ---------------------------------------------------------------------------
step "Getting the latest code"

if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  warn "You have local changes to files in this folder."
  git status --short
  say ""
  say "Pulling could conflict with them. If you didn't mean to change anything,"
  say "you can throw the changes away with:  git checkout ."
  confirm "Try to pull anyway?" n || die "Stopped. Nothing was changed."
fi

if git pull --ff-only; then
  ok "Up to date."
else
  say ""
  warn "Couldn't pull cleanly. Send Aidan the message above — don't try to fix it blind."
  confirm "Carry on with the code you already have?" y || exit 1
fi

# ---------------------------------------------------------------------------
step "Updating dependencies"

if ! npm ci; then
  warn "npm ci failed — falling back to npm install."
  npm install || die "Couldn't install dependencies."
fi
ok "Dependencies up to date."

# .env.example can gain new required keys when the app changes.
validate_env .env || die "Timber now needs extra settings. Ask Aidan for an updated block, then run: bash scripts/ios/setup.sh"

# ---------------------------------------------------------------------------
step "How do you want to run it?"

cat <<'MSG'

  1) Just start it  (fast, ~30 seconds)
     Use this normally. Your phone already has the app — this starts the
     server it talks to.

  2) Rebuild and reinstall  (slow, 5-20 minutes)
     Use this if:
       • the app says it can't be opened / has expired (happens every 7 days)
       • it crashes on launch right after an update
       • Aidan told you a new version needs a rebuild

MSG

printf '%s ' "${BOLD}Choose 1 or 2 [1]:${RESET}"
read -r choice < /dev/tty || choice=""
choice="${choice:-1}"
say ""

case "$choice" in
  2)
    cat <<'MSG'
Plug your iPhone in and unlock it.

When it asks for an Apple ID, use YOUR OWN — the same one as last time.

MSG
    pause "Press Enter to start the rebuild."
    say ""
    if ! npx expo run:ios --device; then
      say ""
      warn "Build failed. Check the phone is plugged in and unlocked, then try again."
      warn "If it keeps failing, send Aidan the last 20 lines above."
      exit 1
    fi
    say ""
    ok "Rebuilt and installed."
    info "If iOS blocks it: Settings → General → VPN & Device Management → trust your Apple ID."
    ;;
  1)
    cat <<'MSG'
Starting the dev server. Open Timber on your phone and it will connect.

  • Keep this terminal window open while you use the app.
  • Press Ctrl-C here when you're done.
  • If the app can't connect, make sure the phone and this Mac are on the
    same Wi-Fi network.

MSG
    npx expo start --dev-client
    ;;
  *)
    die "Didn't understand '$choice'. Run the script again and type 1 or 2."
    ;;
esac
