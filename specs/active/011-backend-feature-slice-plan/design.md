# Design — Backend feature-slice refactor

## Approach

Rotate the backend layout from **horizontal** (`core/`, `infra/`, `shell/`) to **feature-sliced** (`features/<name>/`) while keeping the FCIS discipline as filename suffixes (`<name>.core.ts`, `<name>.repo.ts`, `<name>.routes.ts`). All non-feature code (Effect adapter, security middleware, shared bindings, route types) collects under `platform/`. The `shell/api.ts` registry moves up to `src/api.ts`.

Same approach as `template-BPE` but with **higher payoff** — pier has ~10 features and an active spec workflow, so the locality win is larger and the migration runs through pier's own spec/PR machinery.

This plan is the answer to: **yes, the same refactor applies — even more so than for template-BPE.**

---

## 1. Current state (audited 2026-04-30)

```
apps/backend/src/
├── core/                        (7 files)
├── infra/                       (12 files)
├── shell/
│   ├── routes/                  (16 route files)
│   └── …                        (effect-handler, api, security, bindings, etc.)
├── boundary-rules.ts
└── main.ts
```

### Feature inventory

Mapping every file to a feature or to platform:

| Feature | Files (current paths) |
|---|---|
| **artifacts** | `core/artifact-classify.ts`, `core/blob-classify.ts`, `infra/artifact-watcher.ts`, `infra/blob-server.ts`, `shell/routes/artifacts.ts`, `shell/routes/artifacts-blob.ts`, `shell/routes/stream-artifacts.ts` |
| **events** | `core/event-adapt.ts`, `infra/claude-events.ts`, `infra/sse-bus.ts`, `shell/routes/events-history.ts`, `shell/routes/stream-events.ts`, `shell/routes/stream-reload.ts` |
| **projects** | `infra/projects.ts`, `infra/repo.ts`, `shell/routes/projects.ts`, `shell/routes/projects-blob.ts`, `shell/routes/projects-drop.ts` |
| **sessions** | `infra/terminal-sessions.ts`, `shell/routes/sessions.ts` |
| **zellij** | `infra/zellij-auth.ts`, `infra/zellij-ws-proxy.ts`, `shell/routes/zellij-proxy.ts`, `shell/zellij-wrapper.ts` |
| **tunnel** | `infra/cloudflared.ts`, `shell/routes/tunnel.ts` |
| **settings** | `shell/routes/settings.ts` |
| **config** (HTTP face only) | `shell/routes/config.ts` |
| **version** | `core/version.ts`, `shell/routes/version.ts` |
| **health** | `shell/routes/health.ts` |
| **platform** | `infra/config.ts`, `shell/effect-handler.ts`, `shell/security.ts`, `shell/bindings.ts`, `shell/sandbox-app.ts`, `shell/agents-conventions.ts`, `shell/api.ts`, `shell/routes/_types.ts`, `boundary-rules.ts`, `main.ts` |

**Disambiguation notes (locked):**
- `infra/config.ts` (`ConfigService`) — imported by **13 files spanning every feature** (verified). Promoted to `platform/config.repo.ts`. The HTTP endpoint that exposes it stays as a thin feature: `features/config/config.routes.ts`. No depcruise exception needed.
- `infra/projects.ts` (`ProjectsService`) — project discovery/listing → `features/projects/projects.repo.ts`.
- `infra/repo.ts` (`RepoService`) — filesystem ops on a project's repo, depends on `ConfigService`, project-specific semantics. → `features/projects/projects.files.repo.ts`.
- `shell/zellij-wrapper.ts` — orchestration helper, belongs with the zellij slice (`features/zellij/zellij.wrapper.ts`).

---

## 2. Target layout

```
apps/backend/src/
├── features/
│   ├── artifacts/
│   │   ├── artifacts.classify.core.ts        ← core/artifact-classify.ts
│   │   ├── artifacts.classify.core.test.ts
│   │   ├── artifacts.blob-classify.core.ts   ← core/blob-classify.ts
│   │   ├── artifacts.blob-classify.core.test.ts
│   │   ├── artifacts.watcher.repo.ts         ← infra/artifact-watcher.ts
│   │   ├── artifacts.watcher.repo.test.ts
│   │   ├── artifacts.blob-server.repo.ts     ← infra/blob-server.ts
│   │   ├── artifacts.blob-server.repo.test.ts
│   │   ├── artifacts.routes.ts               ← shell/routes/artifacts.ts
│   │   ├── artifacts.routes.test.ts
│   │   ├── artifacts.blob.routes.ts          ← shell/routes/artifacts-blob.ts
│   │   ├── artifacts.blob.routes.test.ts
│   │   ├── artifacts.stream.routes.ts        ← shell/routes/stream-artifacts.ts
│   │   └── artifacts.stream.routes.test.ts
│   ├── events/
│   │   ├── events.adapt.core.ts              ← core/event-adapt.ts
│   │   ├── events.claude.repo.ts             ← infra/claude-events.ts
│   │   ├── events.sse-bus.repo.ts            ← infra/sse-bus.ts
│   │   ├── events.history.routes.ts          ← shell/routes/events-history.ts
│   │   ├── events.stream.routes.ts           ← shell/routes/stream-events.ts
│   │   └── events.reload.routes.ts           ← shell/routes/stream-reload.ts
│   ├── projects/
│   │   ├── projects.repo.ts                  ← infra/projects.ts (ProjectsService)
│   │   ├── projects.files.repo.ts            ← infra/repo.ts (RepoService)
│   │   ├── projects.routes.ts                ← shell/routes/projects.ts
│   │   ├── projects.blob.routes.ts           ← shell/routes/projects-blob.ts
│   │   └── projects.drop.routes.ts           ← shell/routes/projects-drop.ts
│   ├── sessions/
│   │   ├── sessions.repo.ts                  ← infra/terminal-sessions.ts
│   │   └── sessions.routes.ts                ← shell/routes/sessions.ts
│   ├── zellij/
│   │   ├── zellij.auth.repo.ts               ← infra/zellij-auth.ts
│   │   ├── zellij.ws-proxy.repo.ts           ← infra/zellij-ws-proxy.ts
│   │   ├── zellij.wrapper.ts                 ← shell/zellij-wrapper.ts
│   │   └── zellij.routes.ts                  ← shell/routes/zellij-proxy.ts
│   ├── tunnel/
│   │   ├── tunnel.repo.ts                    ← infra/cloudflared.ts
│   │   └── tunnel.routes.ts                  ← shell/routes/tunnel.ts
│   ├── config/
│   │   └── config.routes.ts                  ← shell/routes/config.ts (HTTP face of platform/config.repo.ts)
│   ├── settings/
│   │   └── settings.routes.ts                ← shell/routes/settings.ts
│   ├── version/
│   │   ├── version.core.ts                   ← core/version.ts
│   │   └── version.routes.ts                 ← shell/routes/version.ts
│   └── health/
│       └── health.routes.ts                  ← shell/routes/health.ts
├── platform/
│   ├── config.repo.ts                        ← infra/config.ts (ConfigService — cross-cutting, 13 importers)
│   ├── effect-handler.ts                     ← shell/effect-handler.ts
│   ├── security.ts                           ← shell/security.ts
│   ├── bindings.ts                           ← shell/bindings.ts
│   ├── sandbox-app.ts                        ← shell/sandbox-app.ts
│   ├── agents-conventions.ts                 ← shell/agents-conventions.ts
│   └── route-types.ts                        ← shell/routes/_types.ts
├── api.ts                                    ← shell/api.ts (moved up)
├── boundary-rules.ts                         ← stays at src/, content updated
└── main.ts                                   ← unchanged content; import updated
```

Co-located `*.test.ts` files move alongside their subjects (already pier convention).

### Naming convention

`<feature>.<concern>?.<tier>.ts` where tier ∈ `{core, repo, routes, fixture, migration}`. The optional `<concern>` segment exists only when one feature has multiple files of the same tier (e.g. artifacts has 3 routes files). Single-tier files drop the concern: `version.core.ts`, not `version.semver.core.ts`.

---

## 3. Decisions

- **Composition root location** — `api.ts` moves from `src/shell/api.ts` to `src/api.ts`. Reason: it's no longer "shell" of any feature; it's the registry. Keep `main.ts` as the entrypoint, import path becomes `./api.ts`.
- **`platform/` is feature-agnostic** — anything in platform must work for any feature. No business logic. No feature imports either direction (platform → feature is forbidden; feature → platform is allowed).
- **Cross-feature imports forbidden, no exceptions** — `features/artifacts/*` cannot import `features/projects/*`. If two features need to collaborate, either:
  1. Promote shared logic to `platform/<thing>.ts`, OR
  2. Compose them in `api.ts` (route mounting) with explicit dependency wiring.
- **Config is platform, not a feature** — `ConfigService` is imported by 13 files across every feature; it's a cross-cutting service. Lives at `platform/config.repo.ts`. The HTTP endpoint that exposes config (`/config` route) is a thin one-file feature: `features/config/config.routes.ts` calls `platform/config.repo.ts` like any other feature. Clean — no depcruise exception needed.
- **No `use-case.ts` tier** for now. Doc names a 3rd tier between core and shell; pier's routes are short enough that the route file *is* the orchestrator. Add `<feature>.use-case.ts` only when a routes file exceeds ~80 lines or gets a 2nd handler that shares orchestration.
- **Plural folder names** — `features/artifacts/`, `features/projects/`. Reasons: (a) route paths already plural, (b) features here are collection-shaped (artifacts, events, sessions), (c) DDD's singular-aggregate convention doesn't fit pier — `health` and `version` aren't aggregates at all.
- **`projects` keeps both repos** — `projects.repo.ts` (ProjectsService) + `projects.files.repo.ts` (RepoService). Both are project-specific (`projectId` everywhere, RepoService depends on ConfigService). Promotion to `platform/` would be premature.
- **Frontend mirror is a separate spec** — `apps/frontend/src/{components,dashboard,…}` has its own god-folder problem. Backend lands first so depcruise surfaces hidden coupling before frontend churn. Spec 018-frontend-feature-slice tracks it.
- **`boundary-rules.ts` upgrade** — replaces the old 2 rule names with the new 5 (no rename — old names referenced removed paths).

---

## 4. New depcruise config

```js
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "core-tier-is-pure",
      comment:
        "*.core.ts within a feature must not import siblings' repo/routes/migration tiers, " +
        "and must not import platform infra adapters. Pure functions only.",
      severity: "error",
      from: { path: "src/features/[^/]+/[^/]+\\.core\\.ts$" },
      to:   { path: "src/(features/[^/]+/[^/]+\\.(repo|routes|migration|fixture)\\.ts$|platform/(effect-handler|bindings|sandbox-app|security))" },
    },
    {
      name: "no-cross-feature-imports",
      comment:
        "Features must not import each other directly. Compose at api.ts or share via platform/. " +
        "Cross-cutting services (e.g. ConfigService) live in platform/, not in a feature.",
      severity: "error",
      from: { path: "src/features/([^/]+)/" },
      to:   { path: "src/features/(?!\\1/)[^/]+/" },
    },
    {
      name: "platform-has-no-feature-deps",
      comment: "platform/ is feature-agnostic infrastructure — never imports features/.",
      severity: "error",
      from: { path: "src/platform/" },
      to:   { path: "src/features/" },
    },
    {
      name: "fixtures-only-from-tests",
      comment: "*.fixture.ts is for tests only; production code must not import it.",
      severity: "error",
      from: { path: "src/.+\\.fixture\\.ts$", pathNot: "\\.test\\.ts$" },
      to:   { path: "src/" },
    },
    {
      name: "effect-handler-stays-pure-glue",
      comment:
        "platform/effect-handler.ts is the Effect runtime adapter. " +
        "It must not import features or feature-specific repos.",
      severity: "error",
      from: { path: "src/platform/effect-handler\\.ts$" },
      to:   { path: "src/features/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { extensions: [".ts", ".tsx", ".js", ".jsx"] },
  },
};
```

`boundary-rules.ts` updated to:

```ts
export const BOUNDARY_RULES = {
  CORE_TIER_IS_PURE: "core-tier-is-pure",
  NO_CROSS_FEATURE_IMPORTS: "no-cross-feature-imports",
  PLATFORM_HAS_NO_FEATURE_DEPS: "platform-has-no-feature-deps",
  FIXTURES_ONLY_FROM_TESTS: "fixtures-only-from-tests",
  EFFECT_HANDLER_STAYS_PURE_GLUE: "effect-handler-stays-pure-glue",
} as const;
export type BoundaryRuleName = (typeof BOUNDARY_RULES)[keyof typeof BOUNDARY_RULES];
```

---

## 5. Migration plan — staged specs (one per PR)

Each PR ships as its own `kind: code` spec under `specs/active/01N-…/` with a gate. This writeup is the umbrella plan; the work is sequenced as 6 child specs:

| # | Spec slug | Scope | Gate |
|---|---|---|---|
| 1 | `012-platform-extract` | Create `platform/`, move 6 platform files, update imports, move `shell/api.ts` → `src/api.ts` | `bun run check` green; `git log --follow` preserved |
| 2 | `013-slice-version-health-config` | Smallest 3 features (1-2 files each) — prove the pattern | `bun run check` + new depcruise rules don't trip |
| 3 | `014-slice-projects-sessions-tunnel-zellij` | Mid-size features | green check |
| 4 | `015-slice-events-artifacts` | Largest two features (6-7 files each) | green check |
| 5 | `016-update-depcruise-rules` | Replace `.dependency-cruiser.cjs` with §4 config; update `boundary-rules.ts` + tests | `bunx depcruise src` zero violations |
| 6 | `017-update-agents-md-and-cleanup` | Update AGENTS.md, delete empty `core/ infra/ shell/` dirs | manual review of AGENTS.md |
| 7 | `018-frontend-feature-slice` | Mirror layout in `apps/frontend/src/` (separate writeup + child specs) | drafted after 012–017 land |

Order rationale: platform first so feature slices have a stable target for their imports. Smallest features first to validate the pattern before doing artifacts/events. Depcruise update last so the rules don't fire on intermediate states.

---

## 6. Files touched (this writeup spec)

- `specs/active/011-backend-feature-slice-plan/proposal.md` — created.
- `specs/active/011-backend-feature-slice-plan/design.md` — this file.

No production code changes in this spec. Code changes happen in 012-017.

---

## 7. Risks

- **Import-path churn in PR-1** — `platform/` move touches every file that imports `effect-handler`, `bindings`, `security`. Mitigated: codemod via Biome/regex on import lines; verify with `bun run typecheck` before commit.
- **Hidden cross-feature imports** — once `no-cross-feature-imports` lands, hidden coupling surfaces as CI errors. Mitigated: dry-run depcruise on a worktree branch *before* PR-5; promote shared bits to `platform/` proactively.
- **`features/config` exception is a smell** — granting one feature cross-import privilege weakens the rule. Mitigated: keep the exception narrow (only `config.repo.ts`, only the `Context.Tag` export); revisit by extracting to `platform/config.ts` once stable.
- **`git log --follow` breaks if mv + edit done in one commit** — Mitigated: each PR does pure `git mv` then a separate import-fix commit, OR uses `--follow`-friendly single rename.
- **Spec workflow side-effects** — `tasks-verify.ts` runs every active spec's gate. This writeup's gate is `design.md` (a doc); should pass trivially. Still: verify locally before push.
- **Frontend not addressed** — `apps/frontend/src/dashboard/` has 20+ files mixing features (palette, viewer, projects, settings, drop) with platform (store, state, sse). Spec 012-frontend-feature-slice is the follow-up; backend can ship independently.

---

## 8. Out of scope

- Frontend layout (separate spec).
- `packages/api-contract/` — already feature-agnostic.
- Spec workflow / hooks / CI changes.
- D1 migrations (`apps/backend/migrations/`) — leave in place; `<feature>.migration.ts` is for *application-level* migration code only.
- Renaming features (e.g. `events` vs `claude-events`).
- Performance, behavior, observability changes.

---

## 9. Decisions resolved (was: open questions)

All §9 questions answered. Each decision is now reflected in §2/§3/§4 above. Captured here for reviewability and future audit:

1. **Plural folder names** — `features/artifacts/`, `features/projects/`. Route paths are plural; collection-shaped features dominate; singular doesn't fit `health`/`version`. → §3 decisions.
2. **`config` → platform, not a feature** — verified 13 importers across every feature. `ConfigService` lives at `platform/config.repo.ts`; the HTTP endpoint stays as a thin `features/config/config.routes.ts`. No depcruise exception. → §2/§3/§4.
3. **No `use-case.ts` tier yet** — pier routes are short. Add only when a routes file exceeds ~80 lines or a 2nd handler shares orchestration. → §3.
4. **6 small specs (not 1 big)** — pier's `tasks-verify` runs gates per active spec; smaller blast radius, easier review. → §5.
5. **`projects` keeps both repos** — `projects.repo.ts` (ProjectsService) + `projects.files.repo.ts` (RepoService, was `infra/repo.ts`). Both project-specific (`projectId` everywhere, depend on ConfigService). Renamed `projects.repo-fs.ts` → `projects.files.repo.ts` for clarity. → §2.
6. **Backend lands before frontend** — backend depcruise surfaces hidden coupling first; frontend god-folder split tracked separately as spec `018-frontend-feature-slice`. → §3.

If any of these need to flip after review, update this section + the affected sections in §2/§3/§4 in the same commit. No silent drift between the decisions list and the layout.
