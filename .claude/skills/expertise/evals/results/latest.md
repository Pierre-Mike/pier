## expertise eval — 2026-04-10T20-38-39

**Overall: 96% pass rate** ✓

| Sample | Passed | Total | Rate |
|--------|--------|-------|------|
| write-filter | 6 | 7 | 86% ✓ |
| write-reject | 3 | 3 | 100% ✓ |
| update-supersede | 5 | 5 | 100% ✓ |
| append-existing | 5 | 5 | 100% ✓ |
| migrate-yaml | 7 | 7 | 100% ✓ |
| confidence-bump | 5 | 5 | 100% ✓ |
| confidence-no-bump | 4 | 4 | 100% ✓ |
| consolidate | 4 | 5 | 80% ✓ |
| index-new-domain | 5 | 5 | 100% ✓ |
| cross-tool-read | 4 | 4 | 100% ✓ |

### Failed expectations

**write-filter**: Entries have confidence: 0.6 (new entries) and an added date
> Both entries show 'Confidence: 0.6 (new seedling)' but no added date is displayed in the output. The summary format doesn't include the inline metadata with added: YYYY-MM-DD field.

**consolidate**: The agent flags BE-G042 or BE-G043 as prunable (low confidence + old + unreinforced)
> While the agent acknowledges 'the original entries were <0.6 and >90 days old', Action 3 explicitly states 'Do NOT prune the merged BE-G042' and argues independent discovery provides validation. The agent argues against pruning rather than flagging them as prunable.
