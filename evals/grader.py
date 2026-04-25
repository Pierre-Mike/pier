"""Programmatic graders for template-BPE harness-autoagent evals.

Each function grade_<task_id_with_underscores>(task, trial, target_path) -> bool
returns True if the task passed. The arbiter's run_benchmark.py calls these.

Keep graders deterministic. LLM-based grading is handled via grader="judge"
in tasks.jsonl, not here.
"""
from __future__ import annotations

import subprocess
from pathlib import Path


def grade_core_pure_fn(task, trial, target) -> bool:
    target = Path(target)
    src = target / "apps/backend/src/backend/core/math.ts"
    tst = target / "apps/backend/src/backend/core/math.test.ts"
    if not src.is_file() or not tst.is_file():
        return False
    content = src.read_text()
    if "clampPositive" not in content:
        return False
    # Run the specific test file; success = exit 0
    res = subprocess.run(
        ["bun", "test", str(tst)],
        cwd=str(target),
        capture_output=True,
        text=True,
        timeout=120,
    )
    return res.returncode == 0


def grade_biome_clean(task, trial, target) -> bool:
    target = Path(target)
    res = subprocess.run(
        ["bun", "biome", "check", "apps/backend/src"],
        cwd=str(target),
        capture_output=True,
        text=True,
        timeout=120,
    )
    return res.returncode == 0
