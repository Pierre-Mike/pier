---
id: 006-polish-readme
title: Polish README to flagship quality
status: archived
kind: writeup
gate: specs/active/006-polish-readme/readme-rubric.md
created: 2026-04-28T00:00:00.000Z
owner: main
depends_on: []
supersedes: null
archived: '2026-04-28'
---

## Intent

Transform `README.md` from its current minimal 46-line internal-note style into a polished, flagship-quality open-source README that conveys product clarity, technical credibility, and developer ergonomics at first glance. The result must be structurally comparable to top-tier tools (Astro, Bun, Effect, Hono, Turborepo): centered hero with text logo + tagline + badge row, a "Why pier?" pitch, feature highlights, quickstart, prerequisites and installation, usage/common-workflows with code blocks, a Mermaid architecture diagram (GitHub renders Mermaid natively), project structure tree, configuration, development-scripts table, contributing pointer (AGENTS.md), license, and acknowledgements.

## Constraints

- All content must be factually accurate to the current codebase — no aspirational features, no marketing fluff. Every claim must be verifiable in `apps/`, `packages/`, `scripts/`, `package.json`, `AGENTS.md`, `PRD.md`, or `pier-architecture.canvas`.
- Markup: CommonMark only. The sole HTML tag permitted is `<p align="center">` for hero centering.
- Architecture diagram: Mermaid fenced block (`\`\`\`mermaid`). No external image hosting, no ASCII art fallback.
- Badges: shields.io, `flat` style, URL-encoded params. Minimum set: License, TypeScript, Bun, Effect-TS, Cloudflare Workers, Biome, Turborepo.
- Every fenced code block must declare its language (`sh`, `ts`, `mermaid`, `yaml`, `json`).
- No duplication of content from `AGENTS.md`, `PRD.md`, `specs/constitution.md`, or `pier-architecture.canvas` — reference them as authoritative pointers only.
- No Roadmap or FAQ sections — those belong in PRD.md and don't exist organically yet.
- Quickstart shows the three commands that work today: `bun install`, `bun --filter @pier/backend dev`, `bun --filter @pier/frontend dev`.
- License badge and section: verify via `package.json`. If absent, note "License: TBD" — do not fabricate.
- No image assets — hero uses text/emoji only.

## Acceptance criteria

- [ ] Hero section present: centered, text/emoji logo + tagline + badge row (≥6 shields.io badges, `flat` style)
- [ ] "Why pier?" section present with one-paragraph value proposition
- [ ] Features section present with 4–6 bullet items, each factually grounded in the codebase
- [ ] Quickstart section shows exactly the three working commands in a `sh` fenced block
- [ ] Install section lists prerequisites and steps
- [ ] Usage section contains at least two common-workflow code blocks with declared languages
- [ ] Architecture section contains a valid `mermaid` fenced block (parseable, not empty)
- [ ] Project structure section contains a repo tree
- [ ] Config section documents env vars or settings
- [ ] Dev scripts section contains a table of `bun run` commands
- [ ] Contributing section links to `AGENTS.md` and `specs/constitution.md`
- [ ] License section reflects actual license from `package.json` (or notes "TBD")
- [ ] Acknowledgements section references zellij, Claude Code, Effect-TS, and other key dependencies
- [ ] No `<img>` or external image URLs in the document
- [ ] All fenced code blocks declare a language
- [ ] No fabricated features absent from the codebase

## Context

- `AGENTS.md` — authoritative agent-role documentation
- `PRD.md` — product requirements and roadmap
- `specs/constitution.md` — repo invariants
- `pier-architecture.canvas` — Obsidian canvas of the system architecture
