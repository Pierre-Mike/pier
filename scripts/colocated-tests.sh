#!/usr/bin/env bash
set -euo pipefail

# apps/e2e is the Playwright e2e workspace.
#   - tests/*.spec.ts are the test files (allowed).
#   - *.test.ts anywhere under apps/e2e is banned: e2e is not the place for
#     colocated unit tests (those belong next to the source they test).
if find apps/e2e -name "*.test.ts" 2>/dev/null | grep -q .; then
  echo "ERROR: apps/e2e must not contain *.test.ts files — those belong colocated with their source. Use *.spec.ts under apps/e2e/tests/ for Playwright e2e."
  exit 1
fi
if find apps/e2e -name "*.spec.ts" -not -path "apps/e2e/tests/*" 2>/dev/null | grep -q .; then
  echo "ERROR: Playwright *.spec.ts files in apps/e2e must live under apps/e2e/tests/."
  exit 1
fi

found=0
while IFS= read -r f; do
  # Integration tests pair with the base module: foo.integration.test.ts → foo.ts
  if [[ "$f" == *.integration.test.ts ]]; then
    src="${f%.integration.test.ts}.ts"
  else
    src="${f%.test.ts}.ts"
  fi
  if [ ! -f "$src" ]; then
    echo "Orphaned test: $f"
    found=1
  fi
done < <(find apps packages -name "*.test.ts" -not -path "apps/e2e/*")
exit $found
