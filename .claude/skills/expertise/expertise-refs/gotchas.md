---
domain: skills
type: gotchas
updated: "2026-04-08"
updated_by: "expertise-migration"
---

# Skills Gotchas

- **SK-G001: samples/ directory does not exist**  
  confidence: 0.7 | added: 2026-04-03  
  skill-generator references a samples/ directory at the repo root that does not exist. References were made conditional ('if available' / 'if the directory exists') in SKILL.md and rules/research-gathering.md. Any future skill that tries to use samples/ as a research corpus will find nothing — skip that step or create the directory first.
