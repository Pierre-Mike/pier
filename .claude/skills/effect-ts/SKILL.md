---
name: effect-ts
description: >
  Grounding reference for writing correct, idiomatic Effect-TS code. Provides the verified-correct
  API surface, project-specific patterns (Functional Core / Imperative Shell with Effect Layers),
  and documented AI failure modes to prevent hallucination. Use when writing, reviewing, or
  debugging any Effect-TS code — services, layers, errors, schemas, concurrency, retries, resource
  management, or testing. Activates on any task involving Effect, Layer, Context.Tag, Schema,
  Data.TaggedError, Effect.gen, or pipe-based Effect pipelines. Also activates when the user
  mentions error channels, service dependencies, or typed errors in an Effect context.
---

# Effect-TS Grounding Reference

This skill is a source of truth for Effect-TS. Consult it before generating Effect code to avoid
hallucinating APIs that don't exist or producing patterns that look correct but behave wrong.

## How to use this skill

1. **Before writing Effect code** — scan the relevant section below for the correct API
2. **Before reviewing Effect code** — check the anti-patterns section for known traps
3. **When unsure about an API** — check `references/api-surface.md` for the actual signatures
4. **For project conventions** — check `references/project-patterns.md` for this repo's patterns

## Core Mental Model

```
Effect<Success, Error = never, Requirements = never>
```

Three typed channels. `Success` is what you get, `Error` is what can fail (tracked at compile time),
`Requirements` is what services are needed (also compile time). When `Error` is `never`, the effect
cannot fail with expected errors. When `Requirements` is `never`, no services are needed.

## Effect.gen — The Primary Pattern

```ts
const program = Effect.gen(function* () {
  const service = yield* MyService          // access a service
  const value = yield* someEffect           // unwrap an effect
  return computeResult(value)               // pure computation
})
```

Rules:
- Use `yield*` (not `yield`) to unwrap effects
- Standard control flow works inside generators (`if/else`, `for`, `while`)
- Each `yield*` independently contributes its error type to the generator's error union
- `catchTag` applied via `.pipe()` before `yield*` DOES narrow the error type for that expression

## Creating Effects

| Constructor | Use when |
|---|---|
| `Effect.succeed(value)` | Known success value |
| `Effect.fail(error)` | Known failure |
| `Effect.sync(() => ...)` | Synchronous, **cannot** throw |
| `Effect.try(() => ...)` | Synchronous, **might** throw |
| `Effect.promise(() => ...)` | Async, **should not** reject |
| `Effect.tryPromise(() => ...)` | Async, **might** reject |

**Critical:** `Effect.sync` is for operations that CANNOT throw. If it might throw, use `Effect.try`.
If it's async and might reject, use `Effect.tryPromise`.

## Services: Context.Tag + Layer

### Define a service interface

```ts
// This project uses Context.GenericTag (not class-based Context.Tag)
export interface MyService {
  readonly doThing: (input: string) => Effect.Effect<Result, MyError>
  //                                                              ^ R is never
}
export const MyService = Context.GenericTag<MyService>("MyService")
```

**Service method return types must have R = never.** Dependencies are resolved during Layer
construction, not leaked into service interfaces.

### Build a Layer

| Constructor | Use when |
|---|---|
| `Layer.succeed(Tag, impl)` | Static value, no setup needed |
| `Layer.sync(Tag, () => impl)` | Lazy init, synchronous, no cleanup |
| `Layer.effect(Tag, effect)` | Effectful init, no cleanup needed |
| `Layer.scoped(Tag, effect)` | Effectful init WITH cleanup (acquireRelease) |

**Critical:** If your service acquires resources that need cleanup (connections, pools, file handles),
you MUST use `Layer.scoped` + `Effect.acquireRelease`. `Layer.effect` does NOT run finalizers.

### Provide layers

```ts
const runnable = myEffect.pipe(Effect.provide(myLayer))
await Effect.runPromise(runnable)
```

## Errors: Data.TaggedError

```ts
export class MyError extends Data.TaggedError("MyError")<{
  readonly field: string
}> {}
```

- Automatically gets `_tag: "MyError"` — do not set manually
- Yieldable: `yield* new MyError({ field: "value" })` works in Effect.gen (no Effect.fail needed)
- Use `Effect.catchTag("MyError", handler)` for selective error handling
- Define errors in `core/` — they are domain concepts, not I/O concerns
- HTTP status mapping belongs in `shell/` via `onError` handlers

### Defects vs Expected Errors

- **Expected errors** are in the `E` channel — created with `Effect.fail()` or yieldable errors
- **Defects** are unexpected (thrown exceptions, `Effect.die()`) — NOT tracked in types
- `Effect.catchAll` catches expected errors only, NOT defects
- `Effect.catchAllCause` catches everything including defects
- Almost never catch defects except at system boundaries for logging

## Schema: @effect/schema

```ts
import { Schema } from "@effect/schema"

const MyInput = Schema.Struct({
  name: Schema.NonEmptyString,
  age: Schema.Number.pipe(Schema.greaterThanOrEqualTo(0)),
})

// Decode unknown data (returns Effect)
const decoded = yield* Schema.decodeUnknown(MyInput)(rawData)
```

- Use `Schema.decodeUnknown` for parsing — it returns an Effect
- Branded types: `Schema.String.pipe(Schema.brand("MyId"))`
- **Never use Zod** — always `@effect/schema`
- **Never use JSON.parse** — use `Schema.decodeUnknown` for type-safe parsing

## Resource Management

```ts
const managed = Effect.acquireRelease(
  Effect.promise(() => openPool()),           // acquire
  (pool) => Effect.promise(() => pool.close()) // release — MUST be infallible
)

const layer = Layer.scoped(MyService, Effect.gen(function* () {
  const pool = yield* managed
  return { query: (sql) => Effect.promise(() => pool.query(sql)) }
}))
```

- Release function receives the acquired resource as its parameter
- Release MUST return `Effect<void, never, never>` — it cannot fail
- Use `Layer.scoped` (not `Layer.effect`) for resources with cleanup

## Concurrency

```ts
// Fail-fast with concurrency limit
const results = yield* Effect.forEach(items, fn, { concurrency: 3 })

// Collect all results (successes + failures)
const eithers = yield* Effect.forEach(items, (item) =>
  Effect.either(fn(item)),
  { concurrency: 3 }
)
```

- Use `{ concurrency: N }` — NOT `{ parallel: N }` (that's Effect v2)
- Structured concurrency: fail-fast automatically interrupts in-flight fibers
- For collect-all: wrap EACH item in `Effect.either` BEFORE forEach, not the whole batch
- Do NOT use `Promise.allSettled` — stay in the Effect world

## Retry + Schedule

```ts
const schedule = Schedule.exponential("200 millis").pipe(
  Schedule.intersect(Schedule.recurs(4))  // max 4 retries
)

const result = yield* myEffect.pipe(
  Effect.retry({ schedule, while: (e) => e._tag === "Retryable" }),
  Effect.timeoutFail({
    duration: "30 seconds",
    onTimeout: () => new MyTimeout()
  })
)
```

- `Schedule.exponential` takes a DurationInput (string like `"200 millis"` or `Duration.millis(200)`)
- Limit retries via schedule composition (`Schedule.intersect(Schedule.recurs(N))`)
- Selective retry: use the `while` option on `Effect.retry`
- `Effect.timeoutFail` wraps the ENTIRE retry sequence (outer), not each attempt (inner)
- `Effect.timeoutFail` produces a typed error; `Effect.timeout` produces `Option`

## Rules and References

For detailed information, consult:
- `rules/anti-patterns.md` — 12 documented AI failure modes with correct alternatives
- `rules/error-channel-algebra.md` — how error types compose through Effect.gen, catchTag, and pipe
- `references/api-surface.md` — verified-correct API signatures for core Effect modules
- `references/project-patterns.md` — this project's FC/IS architecture and conventions

## External Reference

The official Effect-TS LLM reference is available at https://effect.website/llms-full.txt (1.6MB).
When you encounter an API you're unsure about that isn't covered in `references/api-surface.md`,
fetch and search that document using WebFetch rather than guessing.
