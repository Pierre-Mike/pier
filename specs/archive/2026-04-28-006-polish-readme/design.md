# Design

## Approach

Rewrite `README.md` in place. Read `apps/`, `packages/`, `package.json`, `AGENTS.md`, `PRD.md`, and `pier-architecture.canvas` to extract factually accurate content, then structure it into the 13-section layout defined in `proposal.md`. The architecture diagram is derived from `pier-architecture.canvas` (Obsidian JSON canvas) translated into a Mermaid `flowchart` block. All badges are shields.io with `flat` style. After the README is complete, tick every rubric cell in `readme-rubric.md` and add the `## All Checks Complete` section.

## Files touched

- `README.md` — full rewrite from 46-line stub to multi-section flagship document
- `specs/active/006-polish-readme/readme-rubric.md` — tick all cells, add `## All Checks Complete`

## Decisions

- **Text-only hero** — `🛳 pier` text/emoji, no image asset. Avoids a designer-asset dependency; can swap to `<img>` later without breaking layout.
- **Mermaid for architecture** — `pier-architecture.canvas` already encodes the system topology; translating to Mermaid gives GitHub-native rendering without external hosting. ASCII would be a regression from the existing canvas.
- **No Roadmap / FAQ** — Roadmap lives in `PRD.md`; FAQ has no organic questions yet. Stub sections would signal an artificially inflated project.
- **Quickstart shows today's commands** — `bun install` + two `bun --filter` dev commands. Aspirational `pier dev` shortcut does not exist; including it would be inaccurate.
- **Badges decorative, not gating** — shields.io static badges for License, TypeScript, Bun, Effect-TS, Cloudflare Workers, Biome, Turborepo. Build-status badge omitted unless a GitHub Actions workflow URL is unambiguous.

## Risks

- `pier-architecture.canvas` is Obsidian JSON format — the Mermaid translation must be done by inspection, not mechanical conversion. Risk: diagram may miss edges. Mitigation: keep diagram to high-level components only (frontend, backend, tunnel, zellij) to reduce translation error surface.
- `package.json` may not have a `license` field. Mitigation: if absent, License section notes "TBD" rather than fabricating.

## Out of scope

- Image assets (logo PNG, social card) — requires designer input.
- GitHub Actions build-status badge — workflow file naming is ambiguous; omit rather than link to a broken URL.
- `CONTRIBUTING.md` creation — `AGENTS.md` and `specs/constitution.md` already serve this purpose; a separate file would duplicate content.
- `LICENSE` file creation — out of scope for a README polish spec.
