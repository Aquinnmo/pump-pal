#!/usr/bin/env bash
# Shared helpers for scripts/ios/setup.sh and scripts/ios/update.sh.
# Source this, don't run it (except with --self-test).

# --- output ------------------------------------------------------------------

if [ -t 1 ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'
  YELLOW=$'\033[33m'; BLUE=$'\033[34m'; RESET=$'\033[0m'
else
  BOLD=''; DIM=''; RED=''; GREEN=''; YELLOW=''; BLUE=''; RESET=''
fi

STEP_NUM=0

say()  { printf '%s\n' "$*"; }
info() { printf '%s\n' "${DIM}$*${RESET}"; }
ok()   { printf '%s\n' "${GREEN}✓${RESET} $*"; }
warn() { printf '%s\n' "${YELLOW}!${RESET} $*"; }
die()  { printf '\n%s %s\n' "${RED}✗${RESET}" "$*" >&2; exit 1; }

step() {
  STEP_NUM=$((STEP_NUM + 1))
  printf '\n%s\n' "${BLUE}${BOLD}[${STEP_NUM}] $*${RESET}"
}

banner() {
  printf '\n%s\n%s\n%s\n' \
    "${BOLD}────────────────────────────────────────────────${RESET}" \
    "${BOLD} $*${RESET}" \
    "${BOLD}────────────────────────────────────────────────${RESET}"
}

# Wait for the user to press Enter. Message is the prompt.
pause() {
  printf '\n%s' "${BOLD}$1${RESET} "
  read -r _ < /dev/tty || true
}

# confirm "question" [default]  -> default is "y" unless given as "n"
confirm() {
  local prompt="$1" default="${2:-y}" hint reply
  if [ "$default" = "y" ]; then hint="[Y/n]"; else hint="[y/N]"; fi
  while true; do
    printf '%s %s ' "$prompt" "$hint"
    read -r reply < /dev/tty || reply=""
    reply="${reply:-$default}"
    case "$reply" in
      [Yy]|[Yy][Ee][Ss]) return 0 ;;
      [Nn]|[Nn][Oo])     return 1 ;;
      *) say "Please answer y or n." ;;
    esac
  done
}

have() { command -v "$1" >/dev/null 2>&1; }

# --- environment file --------------------------------------------------------

# Firebase keys have no fallback in config/firebase.ts — the app cannot boot
# without them. The AI keys default to '' in constants/ai-config.ts, so they are
# optional here on purpose.
REQUIRED_ENV_KEYS=(
  EXPO_PUBLIC_FIREBASE_API_KEY
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN
  EXPO_PUBLIC_FIREBASE_PROJECT_ID
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  EXPO_PUBLIC_FIREBASE_APP_ID
)

# validate_env <file> [--quiet]
# Exit 0 if every required key is present with a non-empty value.
# Set ENV_LABEL to show something friendlier than the path in messages.
validate_env() {
  local file="$1" quiet="${2:-}" label key line value missing=()
  label="${ENV_LABEL:-$file}"

  if [ ! -f "$file" ]; then
    [ "$quiet" = "--quiet" ] || warn "No $label found."
    return 1
  fi

  for key in "${REQUIRED_ENV_KEYS[@]}"; do
    # Last assignment wins, matching dotenv. Ignore commented-out lines.
    line=$(grep -E "^[[:space:]]*${key}=" "$file" | tail -n 1 || true)
    value="${line#*=}"
    # Strip surrounding quotes and whitespace before deciding it's empty.
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    value="${value%\"}"; value="${value#\"}"
    value="${value%\'}"; value="${value#\'}"
    if [ -z "$line" ] || [ -z "$value" ]; then
      missing+=("$key")
    fi
  done

  if [ ${#missing[@]} -gt 0 ]; then
    if [ "$quiet" != "--quiet" ]; then
      warn "$label is missing values for:"
      printf '    %s\n' "${missing[@]}"
    fi
    return 1
  fi
  return 0
}

# --- preflight ---------------------------------------------------------------

REPO_ROOT=""

# Assert macOS, non-root, and cd to the repo root.
preflight() {
  [ "$(uname -s)" = "Darwin" ] || die "This script only works on a Mac (building for iPhone requires Xcode)."
  [ "$(id -u)" != "0" ] || die "Don't run this with sudo. Run it as yourself; it will ask for a password only when it needs one."

  REPO_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
  cd "$REPO_ROOT" || die "Could not enter the repo directory."
  [ -f package.json ] && [ -f app.json ] || die "This doesn't look like the pump-pal repo (no package.json/app.json at $REPO_ROOT)."
}

# --- self-test ---------------------------------------------------------------

_self_test() {
  local dir status failures=0
  dir=$(mktemp -d)
  trap 'rm -rf "$dir"' EXIT

  _assert() { # _assert <description> <expected-status> <actual-status>
    if [ "$2" = "$3" ]; then
      ok "$1"
    else
      printf '%s %s (expected exit %s, got %s)\n' "${RED}✗${RESET}" "$1" "$2" "$3"
      failures=$((failures + 1))
    fi
  }

  # A complete file passes.
  { for k in "${REQUIRED_ENV_KEYS[@]}"; do echo "$k=value"; done
    echo "EXPO_PUBLIC_GEMINI_API_KEY="; } > "$dir/complete"
  validate_env "$dir/complete" --quiet; status=$?
  _assert "accepts a complete .env (optional AI key may be empty)" 0 $status

  # A missing key fails.
  grep -v EXPO_PUBLIC_FIREBASE_APP_ID "$dir/complete" > "$dir/missing"
  validate_env "$dir/missing" --quiet; status=$?
  _assert "rejects a .env with a missing key" 1 $status

  # A present-but-empty key fails.
  sed 's/^EXPO_PUBLIC_FIREBASE_PROJECT_ID=.*/EXPO_PUBLIC_FIREBASE_PROJECT_ID=/' "$dir/complete" > "$dir/empty"
  validate_env "$dir/empty" --quiet; status=$?
  _assert "rejects a .env with an empty value" 1 $status

  # A quoted value counts as present.
  sed 's/^EXPO_PUBLIC_FIREBASE_API_KEY=.*/EXPO_PUBLIC_FIREBASE_API_KEY="abc123"/' "$dir/complete" > "$dir/quoted"
  validate_env "$dir/quoted" --quiet; status=$?
  _assert "accepts quoted values" 0 $status

  # A commented-out key does not count as present.
  sed 's/^EXPO_PUBLIC_FIREBASE_APP_ID=.*/#EXPO_PUBLIC_FIREBASE_APP_ID=abc/' "$dir/complete" > "$dir/commented"
  validate_env "$dir/commented" --quiet; status=$?
  _assert "rejects a commented-out key" 1 $status

  # A nonexistent file fails rather than erroring.
  validate_env "$dir/nope" --quiet; status=$?
  _assert "rejects a missing file" 1 $status

  # Every key in .env.example that we require is spelled correctly.
  if [ -f "$(dirname -- "${BASH_SOURCE[0]}")/../../.env.example" ]; then
    local example k
    example="$(dirname -- "${BASH_SOURCE[0]}")/../../.env.example"
    for k in "${REQUIRED_ENV_KEYS[@]}"; do
      grep -qE "^${k}=" "$example"; status=$?
      _assert "$k exists in .env.example" 0 $status
    done
  fi

  echo
  if [ $failures -eq 0 ]; then
    ok "self-test passed"
    return 0
  fi
  die "$failures self-test failure(s)"
}

# Only runs when this file is executed directly, not when sourced.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  case "${1:-}" in
    --self-test) _self_test ;;
    *) die "This file is a library. Run: bash ${BASH_SOURCE[0]} --self-test" ;;
  esac
fi
