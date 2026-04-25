# template-BPE — An Autonomous Delivery Pipeline for Solo Developers

## What is this?

A TypeScript monorepo template that turns GitHub issues into deployed features — with AI doing the implementation, review, and merge. You define the product. AI builds it.

The template enforces strict engineering practices through tooling, not prompts. Every rule has a corresponding CI gate, linter rule, or architectural constraint. If a rule can't be enforced by a tool, it doesn't exist.

## Who is it for?

Solo developers who want a production-ready starting point they can use as-is. Clone it, define your domain, and let AI ship features to Cloudflare while you focus on what the product should do — not how to build it.

## Core Principles

### 1. One Way to Do Everything

Every architectural decision has exactly one enforced path. If there are two valid ways to do something, that's a bug in the template.

**Why:** AI agents make better decisions when there are no decisions to make. Ambiguity leads to drift. One canonical approach — even if it's harder to learn — is repeatable, testable, and safe at scale.

### 2. Enforce, Don't Prompt

Every rule is backed by a tool: Biome for style, dependency-cruiser for layer boundaries, Effect's type system for error handling, CI gates for test coverage, CODEOWNERS for protected files. Prompting AI to "please follow the rules" doesn't count. The template makes bad code fail to compile or fail CI.

**Why:** Prompts are suggestions. Tooling is law. AI agents will find every gap you leave open. If a constraint only lives in a prompt, it will eventually be violated.

### 3. TDD as the First Rule

Tests come before implementation. Every source file has a co-located test (`foo.ts` + `foo.test.ts`). CI fails if a test file exists without a matching source file — and vice versa. Coverage gates block merges.

**Why:** TDD is the only reliable way to verify that AI-generated code does what the issue asked for. Tests are the specification. If the tests pass, the feature works. If they don't exist, the feature is unverified.

### 4. No Mock Frameworks

No Sinon, no Jest mocks, no `jest.fn()`. Pure business logic in `core/` needs zero test doubles — just data in, data out. For services with I/O dependencies, Effect `Layer.succeed(Tag, testImpl)` provides real implementations scoped to the test.

**Why:** Mocks test that your code calls functions in the right order. Real implementations test that your code actually works. Effect Layers give you the isolation of mocks with the confidence of integration tests.

### 5. Functional Core / Imperative Shell

All business logic lives in pure functions (`core/`). All I/O lives in Effect services (`infra/`). Hono routes and Effect.gen coordinators (`shell/`) wire them together using the impure-pure-impure sandwich pattern. Dependency-cruiser enforces these boundaries in CI.

**Why:** FCIS is mechanically enforceable — does this function do I/O? Yes, it goes in shell/infra. No, it goes in core. There's no room for interpretation. Hexagonal architecture is too abstract for AI agents; FCIS is binary.

### 6. Cloudflare as First Citizen

Cloudflare Workers for the backend. Cloudflare Pages for the frontend. When you need a database, use D1. Key-value store: KV. Object storage: R2. Queues, Durable Objects — reach for Cloudflare primitives first, always.

**Why:** One platform, one billing model, edge-first performance. No "bring your own Postgres" decisions. The template eliminates infrastructure choice paralysis by prescribing Cloudflare for everything.

## The Autonomous Pipeline

The end goal is full autonomy for feature delivery. Humans are product owners, not developers.

### The Flow

1. **Human writes a GitHub issue** describing what they want
2. **AI asks clarifying questions** until the requirement is unambiguous
3. **AI breaks the issue into vertical slices** (tracer-bullet sub-issues)
4. **AI implements each slice** following TDD (red-green-refactor)
5. **AI reviews and merges each PR** automatically
6. **Changes auto-deploy** to Cloudflare on merge to main

Human intervention happens only when something goes wrong. The review gate exists for safety, but the goal is that AI handles it. Every step that requires a human to unblock is a template bug to be fixed.

### Guardrails for Autonomy

AI agents cannot modify the template's own infrastructure:
- CI/CD workflows, branch protection, CODEOWNERS
- Biome, Lefthook, Turborepo configuration
- TypeScript compiler settings, wrangler deployment configs
- Agent definitions and skill prompts

These files are CODEOWNERS-protected and require human approval. AI ships features, not framework changes.

## Domain-First Development

The template is domain-agnostic. It works for any product — you just need to define the domain.

### How It Works

1. **Run the domain definition skill** — AI interviews you about your business domain: entities, taxonomy, naming conventions, business rules, relationships
2. **AI generates `DOMAIN.md`** at the project root — a structured document that serves as the ubiquitous language for both humans and AI agents
3. **All agents reference `DOMAIN.md`** when implementing features — ensuring code uses the same names, relationships, and rules that the business uses

The domain definition is the contract between you and AI. If something isn't in `DOMAIN.md`, AI will ask before assuming. If it is in `DOMAIN.md`, AI will follow it without asking.

**Vision:** Today, `DOMAIN.md` is a markdown file that AI reads. Over time, the template will evolve toward machine-enforceable domain constraints — where CI can verify that types in `core/` match the names and rules defined in the domain file.

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Language | TypeScript (strict mode) | Type safety across the entire stack. Types are the first line of defense |
| Monorepo | Turborepo + Bun workspaces | Fast, cached task orchestration with zero config |
| Backend | Hono + Effect-TS | Type-safe routes with functional error handling and compile-time dependency checking |
| Frontend | Astro (no JS framework) | Server-rendered pages, minimal client JS. Most apps don't need React |
| Deployment | Cloudflare Workers + Pages | Edge-first, cheap, fast. One platform for everything |
| Linting | Biome | Replaces ESLint + Prettier. One tool, zero plugins |
| Git hooks | Lefthook | Replaces husky + lint-staged. Parallel hook execution |
| Testing | Bun test runner | Co-located tests, built-in coverage, fast |
| Error handling | Effect-TS | Typed errors, typed dependencies, no try/catch |
| Secret scanning | Gitleaks | Prevents credential commits in pre-commit and CI |

### Why These Choices Are Final

Each tool was chosen because it's the best option for AI-driven autonomous development — not because it's the most popular. The template does not support alternatives. There is no ESLint config. There is no Jest setup. There is no Vercel deployment option. One way, enforced.

## End-to-End Type Safety

Types flow from backend to frontend with zero code generation:

```
backend/shell/api.ts  -->  exports AppType  -->  api-contract/  -->  frontend/src/api.ts
```

Change a route in the backend, and the frontend client breaks at compile time. No manual sync. No OpenAPI generation step. The types are the contract.

## What Success Looks Like

- A solo developer can go from idea to deployed product by writing GitHub issues
- AI implements, tests, reviews, and ships every feature autonomously
- The CI pipeline catches every class of bug before merge — type errors, style violations, missing tests, secret leaks, architectural boundary violations
- The codebase stays clean over months of AI-driven development because every rule is enforced by tooling, not discipline
- A new AI agent (or human) can join the project and understand the domain, architecture, and conventions by reading `DOMAIN.md` and the template's constraints
