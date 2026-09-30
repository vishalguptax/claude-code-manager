#!/usr/bin/env bash
# Publish one built .vsix to one marketplace, retrying transient failures.
#
#   scripts/publish-vsix.sh <vscode|openvsx> <path/to/extension.vsix>
#
# Reads VSCE_PAT (vscode) or OVSX_TOKEN (openvsx) from the environment.
#
# Why this exists: v2.16.0 missed the VS Code Marketplace on a single HTTP 503
# from Microsoft while Open VSX published five seconds later. One attempt with
# no retry turned a blip into a missed release. So:
#   - up to 3 attempts, 30s then 90s apart, which rides out short outages;
#   - auth failures stop at once, since retrying a bad token only burns time;
#   - "version already exists" counts as success, because a 503 can arrive
#     after the upload was accepted, and a re-run must not fail on it.
set -uo pipefail

target=${1:?target: vscode or openvsx}
vsix=${2:?path to the .vsix}
[ -f "$vsix" ] || { echo "::error::No such file: $vsix"; exit 2; }

case "$target" in
  vscode) cmd=(npx --yes @vscode/vsce publish --no-dependencies --packagePath "$vsix") ;;
  openvsx) cmd=(npx --yes ovsx publish "$vsix" -p "${OVSX_TOKEN:?OVSX_TOKEN is not set}") ;;
  *) echo "::error::Unknown target '$target' (expected vscode or openvsx)"; exit 2 ;;
esac

delays=(0 30 90)
for attempt in 1 2 3; do
  sleep "${delays[$((attempt - 1))]}"
  out=$("${cmd[@]}" 2>&1)
  code=$?
  echo "$out"
  [ "$code" -eq 0 ] && exit 0

  if echo "$out" | grep -qiE "already exists|already published"; then
    echo "::notice::$target already has $(basename "$vsix"); nothing to do."
    exit 0
  fi
  if echo "$out" | grep -qiE "\b40[13]\b|unauthorized|forbidden|personal access token"; then
    echo "::error::$target rejected the credentials; not retrying."
    exit 1
  fi
  echo "::warning::$target publish attempt $attempt of 3 failed (exit $code)."
done

echo "::error::$target publish failed after 3 attempts."
exit 1
