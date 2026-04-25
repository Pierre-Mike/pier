## Anti-Patterns: Documented AI Failure Modes

These are patterns that AI models commonly generate when writing Effect-TS code. Each is wrong.
Consult this before generating or reviewing Effect code.

---

### 1. Deprecated Effect.gen adapter

```ts
// WRONG — deprecated in v3, removed in v4
Effect.gen(function* (_) {
  const value = yield* _(someEffect)
})

// CORRECT
Effect.gen(function* () {
  const value = yield* someEffect
})
```

The `_` adapter does not exist in Effect v3. If you see it in a blog post or Stack Overflow answer,
it is from Effect v2. Replace `yield* _(x)` with `yield* x`.

### 2. try/catch inside Effect.gen

```ts
// WRONG — try/catch NEVER catches Effect failures inside generators
Effect.gen(function* () {
  try {
    const x = yield* riskyEffect
  } catch (e) {
    // This NEVER executes for Effect failures
  }
})

// CORRECT
Effect.gen(function* () {
  const result = yield* Effect.either(riskyEffect)
  if (Either.isLeft(result)) {
    // handle error
  }
})
```

Effect failures propagate through the generator mechanism, not JavaScript exceptions.
Use `Effect.catchTag`, `Effect.catchAll`, or `Effect.either` instead.

### 3. await inside Effect.gen

```ts
// WRONG — cannot await in generator functions
Effect.gen(function* () {
  const data = await fetch("/api")  // SyntaxError or wrong behavior
})

// CORRECT
Effect.gen(function* () {
  const response = yield* Effect.tryPromise(() => fetch("/api"))
})
```

Wrap async operations with `Effect.promise` (won't reject) or `Effect.tryPromise` (might reject).

### 4. Missing yield* (effect created but never executed)

```ts
// WRONG — effect is created but never runs
Effect.gen(function* () {
  Effect.log("hello")     // does nothing
  return 42
})

// CORRECT
Effect.gen(function* () {
  yield* Effect.log("hello")
  return 42
})
```

Every effect must be `yield*`ed to execute.

### 5. Effect.sync for throwable operations

```ts
// WRONG — if JSON.parse throws, it becomes a defect (untyped)
const parse = (s: string) => Effect.sync(() => JSON.parse(s))

// CORRECT — catches throws and types the error
const parse = (s: string) => Effect.try(() => JSON.parse(s))
```

`Effect.sync` is for operations that CANNOT throw. Use `Effect.try` for operations that might.

### 6. Leaking R in service method return types

```ts
// WRONG — forces consumers to provide UserService even though Layer resolved it
readonly notify: (msg: string) => Effect.Effect<void, Error, UserService>

// CORRECT — dependencies resolved at Layer build time, not leaked to callers
readonly notify: (msg: string) => Effect.Effect<void, Error>
```

Service methods return `Effect<A, E, never>`. The `R` channel is `never`. Dependencies are
captured in closures during Layer construction.

### 7. Effect.runSync/runPromise inside services

```ts
// WRONG — breaks the Effect abstraction
const myService = {
  getData: () => {
    const result = Effect.runSync(someEffect)  // NEVER do this
    return result
  }
}

// CORRECT — return Effects from services
const myService = {
  getData: () => someEffect
}
```

Only run effects at the edge: route handlers, main.ts, tests.

### 8. Inventing false explanations for correct code

When Effect.gen code appears to have a type issue, check these before claiming the code is wrong:

- `catchTag` applied via `.pipe()` before `yield*` DOES narrow the error type
- Effect.gen correctly tracks error types per `yield*` expression
- TypeScript's generator inference works correctly with Effect v3

Common false claims:
- "Effect.gen collects all possible errors from all yield* statements" — partially true but
  each expression is independently typed, and `.pipe(Effect.catchTag(...))` narrows BEFORE yield*
- "TypeScript cannot track error types through generator yield points" — false for Effect v3
- "You need to move catchTag outside the gen block" — unnecessary if applied before yield*

If the user reports a type issue with correct-looking code, suggest: restart tsserver, verify
actual code matches what's shown, check for duplicate calls without catchTag.

### 9. Using Zod instead of @effect/schema

```ts
// WRONG
import { z } from "zod"
const schema = z.object({ name: z.string() })

// CORRECT
import { Schema } from "@effect/schema"
const schema = Schema.Struct({ name: Schema.String })
```

@effect/schema provides bidirectional encode/decode, branded types, and returns Effects.

### 10. Using JSON.parse instead of Schema.decodeUnknown

```ts
// WRONG — no validation, no type safety
const data = JSON.parse(raw) as MyType

// CORRECT — validated, typed, returns Effect
const data = yield* Schema.decodeUnknown(MySchema)(raw)
```

### 11. Deprecated Do notation

```ts
// WRONG — removed in v4, discouraged in v3
Effect.Do.pipe(
  Effect.bind("x", () => Effect.succeed(1)),
  Effect.let("sum", ({ x }) => x + 1)
)

// CORRECT
Effect.gen(function* () {
  const x = yield* Effect.succeed(1)
  return x + 1
})
```

### 12. Layer.effect for resources that need cleanup

```ts
// WRONG — pool.close() is never called on shutdown
const PoolLive = Layer.effect(Pool, Effect.gen(function* () {
  const pool = yield* Effect.promise(() => createPool())
  return { query: (sql) => Effect.promise(() => pool.query(sql)) }
}))

// CORRECT — pool.close() runs when scope finalizes
const PoolLive = Layer.scoped(Pool, Effect.gen(function* () {
  const pool = yield* Effect.acquireRelease(
    Effect.promise(() => createPool()),
    (pool) => Effect.promise(() => pool.close())
  )
  return { query: (sql) => Effect.promise(() => pool.query(sql)) }
}))
```

`Layer.effect` has no lifecycle management. `Layer.scoped` + `Effect.acquireRelease` ensures
cleanup runs on shutdown, test teardown, or failure. The code compiles and passes tests either
way — the leak only manifests in long-running production servers.
