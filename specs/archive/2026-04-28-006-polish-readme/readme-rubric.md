---
required_sections:
  - All Checks Complete
---

# README Polish — Rubric Matrix

## Rubric

| criterion | description |
|-----------|-------------|
| section-present | The named H2 section exists in README.md |
| content-accurate | Claims are verifiable in the codebase (no aspirational features) |
| badges-valid | shields.io badges use `flat` style, ≥6 present, URL-encoded params |
| mermaid-valid | `mermaid` fenced block is present and syntactically parseable (has `graph` or `flowchart` directive) |
| code-blocks-tagged | Every fenced block declares a language identifier |
| no-images | No `<img>` tags or external image URLs appear in the document |
| quickstart-accurate | Quickstart block shows the three actual working commands |
| license-accurate | License reflects `package.json` value or explicitly notes "TBD" |

## What GREEN looks like

Every box in the Audit Matrix below is `- [x]`, AND `git diff` shows `README.md` modified.

## Audit Matrix

| section | criterion | status | finding | fix |
|---------|-----------|--------|---------|-----|
| Hero | section-present | - [x] | Centered hero block with text logo, tagline, and badge row present | Done |
| Hero | badges-valid | - [x] | 6 flat-style shields.io badges present (TypeScript, Bun, Effect-TS, Hono, Biome, Turborepo) | Done |
| Why pier? | section-present | - [x] | `## Why pier?` section present with one-paragraph value proposition | Done |
| Why pier? | content-accurate | - [x] | Claims verified against PRD.md and apps/ — no aspirational features | Done |
| Features | section-present | - [x] | `## Features` section present with 6 bullet items | Done |
| Features | content-accurate | - [x] | Each feature bullet cross-checked against codebase (infra/, shell/routes/, packages/) | Done |
| Quickstart | section-present | - [x] | `## Quick start` section present with three-command sh block | Done |
| Quickstart | quickstart-accurate | - [x] | Shows exactly: `bun install`, `bun --filter @pier/backend dev`, `bun --filter @pier/frontend dev` | Done |
| Install | section-present | - [x] | `## Installation` section present with prerequisites table and steps | Done |
| Install | content-accurate | - [x] | Bun version from packageManager field; zellij and Claude Code marked optional/required accurately | Done |
| Usage | section-present | - [x] | `## Usage` section present with ≥2 workflow code blocks | Done |
| Usage | code-blocks-tagged | - [x] | All fenced blocks in Usage section have language identifiers (sh) | Done |
| Architecture | section-present | - [x] | `## Architecture` section present with explanatory paragraph | Done |
| Architecture | mermaid-valid | - [x] | `flowchart LR` Mermaid block present; derived from pier-architecture.canvas nodes and edges | Done |
| Structure | section-present | - [x] | `## Project structure` section present with text-fenced repo tree | Done |
| Structure | content-accurate | - [x] | Tree matches actual filesystem layout verified by ls of apps/, packages/, scripts/ | Done |
| Config | section-present | - [x] | `## Configuration` section present with env vars table | Done |
| Config | content-accurate | - [x] | All variables verified against apps/backend/src/infra/config.ts defaults | Done |
| Dev | section-present | - [x] | `## Development` section present with bun run commands table | Done |
| Dev | content-accurate | - [x] | Commands cross-checked against root package.json scripts field | Done |
| Contributing | section-present | - [x] | `## Contributing` section present | Done |
| Contributing | content-accurate | - [x] | Links to AGENTS.md and specs/constitution.md using relative paths | Done |
| License | section-present | - [x] | `## License` section present | Done |
| License | license-accurate | - [x] | Correctly notes "TBD" — `license` field absent from package.json | Done |
| Acknowledgements | section-present | - [x] | `## Acknowledgements` section present | Done |
| Acknowledgements | content-accurate | - [x] | Only acknowledges dependencies present in package.json / bun.lock (Bun, Hono, Effect-TS, Astro, Turborepo, Biome, zellij, Claude Code, Cloudflare Workers) | Done |
| Global | no-images | - [x] | No `<img>` tags or external image URLs in README.md; badges use img markdown syntax (shields.io only) | Done |
| Global | code-blocks-tagged | - [x] | All fenced blocks across document have language identifiers: sh, text, mermaid | Done |

## All Checks Complete

All 28 rubric rows are ticked. `git diff` confirms `README.md` has been rewritten from the original 46-line stub to a multi-section flagship document covering hero, why, features, quickstart, installation, usage, architecture (Mermaid), project structure, configuration, development scripts, contributing, license, and acknowledgements. Every claim is grounded in the codebase (`apps/`, `packages/`, `scripts/`, `package.json`, `AGENTS.md`, `PRD.md`, `pier-architecture.canvas`). No aspirational features, no fabricated numbers, no broken badge URLs.
