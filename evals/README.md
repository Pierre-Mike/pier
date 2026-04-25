# evals/

Immutable task set for the harness-autoagent loop. The meta-agent must NOT
edit anything in this directory — it is the ground truth the whole loop
hill-climbs against.

## What belongs here

- `tasks.jsonl` — one task per line:
    {
      "id": "task-01",
      "prompt": "...",                 # what Claude is told to do
      "success_criteria": "...",       # how to check pass/fail
      "grader": "programmatic|judge",  # which grader to use
      "weight": 1.0,                   # relative weight in composite score
      "fixtures": ["path/..."]         # files the task operates on (read-only)
    }
- `grader.py` — callable that takes task + transcript + artifacts, returns
  {"pass": bool, "cost_tokens": int, "latency_ms": int}.
- `fixtures/` — read-only inputs each task runs against.

## Seeding

Use the `tdd-skill-creation` skill once to interview yourself about success
criteria and draft 10-20 tasks pulled from the last 4-8 weeks of real work.
Rotate quarterly. When you rotate, re-baseline.
