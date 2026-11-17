#!/usr/bin/env bash
# Clone all BNPIMS backend repositories.
# Usage: ./clone-repos.sh [target_dir]   (default: ./bnpims-backend)
#        PULL=1 ./clone-repos.sh          (also pull latest for repos already cloned)

set -u

BASE_URL="git@192.168.30.51:bnpims/backend"
TARGET_DIR="${1:-bnpims-backend}"

REPOS=(
  api-module
  auth-service
  common-module
  config-server
  database-module
  demand-service
  gateway-server
  group-service
  indent-service
  organization-service
  procurement-service
  registry-server
  report-service
  shipping-service
  storage-service
  supplier-service
  user-service
  utility-service
  workflow-service
)

mkdir -p "$TARGET_DIR"
cd "$TARGET_DIR" || exit 1

ok=(); skipped=(); failed=()

for repo in "${REPOS[@]}"; do
  if [ -d "$repo/.git" ]; then
    if [ "${PULL:-0}" = "1" ]; then
      echo "↻ Pulling $repo"
      if git -C "$repo" pull --ff-only; then ok+=("$repo (pulled)"); else failed+=("$repo (pull)"); fi
    else
      echo "• Skipping $repo (already exists)"
      skipped+=("$repo")
    fi
    continue
  fi

  echo "↓ Cloning $repo"
  if git clone "$BASE_URL/$repo.git" "$repo"; then
    ok+=("$repo")
  else
    failed+=("$repo")
  fi
done

echo
echo "========== Summary =========="
echo "Done:    ${#ok[@]}"
echo "Skipped: ${#skipped[@]}"
echo "Failed:  ${#failed[@]}"
for f in "${failed[@]}"; do echo "  ✗ $f"; done

[ ${#failed[@]} -eq 0 ]
