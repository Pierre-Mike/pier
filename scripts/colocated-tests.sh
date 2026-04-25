#!/usr/bin/env bash
set -euo pipefail

# Ban *.spec.ts and *.test.ts in apps/e2e — Cucumber steps only
if find apps/e2e -name "*.spec.ts" -o -name "*.test.ts" 2>/dev/null | grep -q .; then
  echo "ERROR: apps/e2e must not contain *.spec.ts or *.test.ts files — use Cucumber steps only"
  exit 1
fi

found=0
while IFS= read -r f; do
  src="${f%.test.ts}.ts"
  if [ ! -f "$src" ]; then
    echo "Orphaned test: $f"
    found=1
  fi
done < <(find apps packages -name "*.test.ts" -not -path "apps/e2e/*")
exit $found
