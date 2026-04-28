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
| Hero | section-present | - [ ] | H2 `## Hero` or centered logo block with tagline not found in README.md | Add centered hero with text/emoji logo, tagline, and badge row |
| Hero | badges-valid | - [ ] | No shields.io badges present | Add ≥6 `flat`-style shields.io badges (License, TypeScript, Bun, Effect-TS, Cloudflare Workers, Biome) |
| Why pier? | section-present | - [ ] | No "Why pier?" section in README.md | Add one-paragraph value-proposition section |
| Why pier? | content-accurate | - [ ] | Cannot verify accuracy until section exists | Verify every claim against apps/, packages/, AGENTS.md |
| Features | section-present | - [ ] | No Features section in README.md | Add 4–6 factually grounded bullet items |
| Features | content-accurate | - [ ] | Cannot verify accuracy until section exists | Cross-check each feature bullet against codebase |
| Quickstart | section-present | - [ ] | No Quickstart section in README.md | Add section with three-command sh block |
| Quickstart | quickstart-accurate | - [ ] | Current README has no structured quickstart block | Show exactly: `bun install`, `bun --filter @pier/backend dev`, `bun --filter @pier/frontend dev` |
| Install | section-present | - [ ] | No Installation section in README.md | Add prerequisites list and installation steps |
| Install | content-accurate | - [ ] | Cannot verify accuracy until section exists | Verify prereqs (Bun, Node version, etc.) against package.json and scripts |
| Usage | section-present | - [ ] | No Usage section in README.md | Add section with ≥2 workflow code blocks |
| Usage | code-blocks-tagged | - [ ] | Cannot verify until section exists | Ensure every fenced block has a language identifier |
| Architecture | section-present | - [ ] | No Architecture section in README.md | Add Mermaid diagram derived from pier-architecture.canvas |
| Architecture | mermaid-valid | - [ ] | No mermaid block in README.md | Add `\`\`\`mermaid` block with graph or flowchart directive |
| Structure | section-present | - [ ] | No project structure tree in README.md | Add repo tree showing top-level directories |
| Structure | content-accurate | - [ ] | Cannot verify accuracy until section exists | Match actual filesystem layout |
| Config | section-present | - [ ] | No Config section in README.md | Document env vars and/or settings |
| Config | content-accurate | - [ ] | Cannot verify accuracy until section exists | Verify vars against apps/backend and apps/frontend source |
| Dev | section-present | - [ ] | No Dev scripts section in README.md | Add table of bun run commands from package.json |
| Dev | content-accurate | - [ ] | Cannot verify accuracy until section exists | Cross-check commands against root and workspace package.json scripts |
| Contributing | section-present | - [ ] | No Contributing section in README.md | Add section linking AGENTS.md and specs/constitution.md |
| Contributing | content-accurate | - [ ] | Cannot verify accuracy until section exists | Ensure links resolve to correct paths in repo |
| License | section-present | - [ ] | No License section in README.md | Add section reflecting package.json license or noting TBD |
| License | license-accurate | - [ ] | Cannot verify accuracy until section exists | Read package.json `license` field; never fabricate |
| Acknowledgements | section-present | - [ ] | No Acknowledgements section in README.md | Add section referencing zellij, Claude Code, Effect-TS, Hono, Cloudflare Workers |
| Acknowledgements | content-accurate | - [ ] | Cannot verify accuracy until section exists | Only acknowledge dependencies that appear in package.json or bun.lock |
| Global | no-images | - [ ] | Cannot verify until rewrite | Confirm no `<img>` tags or external image URLs in final README.md |
| Global | code-blocks-tagged | - [ ] | Cannot verify until rewrite | Confirm all fenced blocks across document have language identifiers |
