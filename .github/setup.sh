#!/usr/bin/env bash
set -euo pipefail

# Applies branch protection rules from branch-rules.json using gh CLI.
# Run once after creating a repo from this template.
#
# Requirements:
#   - gh CLI authenticated (gh auth login)
#   - GitHub Pro (private repos) or public repo
#
# Usage:
#   .github/setup.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RULES_FILE="$SCRIPT_DIR/branch-rules.json"

if ! command -v gh &>/dev/null; then
	echo "Error: gh CLI not found. Install from https://cli.github.com"
	exit 1
fi

if ! command -v jq &>/dev/null; then
	echo "Error: jq not found. Install with: brew install jq"
	exit 1
fi

if [ ! -f "$RULES_FILE" ]; then
	echo "Error: $RULES_FILE not found"
	exit 1
fi

REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner')
BRANCH=$(jq -r '.branch' "$RULES_FILE")

echo "Applying branch protection to $REPO ($BRANCH)..."

# Extract settings from JSON
REQUIRED_REVIEWS=$(jq -c '.protection.required_pull_request_reviews' "$RULES_FILE")
STATUS_CHECKS=$(jq -c '.protection.required_status_checks' "$RULES_FILE")
ENFORCE_ADMINS=$(jq -r '.protection.enforce_admins' "$RULES_FILE")
ALLOW_FORCE=$(jq -r '.protection.allow_force_pushes' "$RULES_FILE")
ALLOW_DELETE=$(jq -r '.protection.allow_deletions' "$RULES_FILE")

# Build the API payload
PAYLOAD=$(jq -n \
	--argjson reviews "$REQUIRED_REVIEWS" \
	--argjson checks "$STATUS_CHECKS" \
	--argjson enforce "$ENFORCE_ADMINS" \
	--argjson force "$ALLOW_FORCE" \
	--argjson delete "$ALLOW_DELETE" \
	'{
		required_pull_request_reviews: $reviews,
		required_status_checks: $checks,
		enforce_admins: $enforce,
		restrictions: null,
		allow_force_pushes: $force,
		allow_deletions: $delete
	}')

gh api "repos/$REPO/branches/$BRANCH/protection" \
	--method PUT \
	--input - <<< "$PAYLOAD"

echo ""
echo "Branch protection applied successfully:"
echo "  - PRs required (no direct push to $BRANCH)"
echo "  - 1 approving review required"
echo "  - CODEOWNERS review required"
echo "  - All CI status checks must pass"
echo "  - Force pushes disabled"
echo "  - Branch deletion disabled"
echo "  - Rules enforced for admins too"
