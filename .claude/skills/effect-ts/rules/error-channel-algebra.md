## Error Channel Algebra

How error types compose through Effect.gen, catchTag, pipe, and Layer.

---

### Effect.gen error union

Each `yield*` expression in an Effect.gen block contributes its error type to the overall
generator's error union. The final error type is the union of all individual errors.

```ts
const program = Effect.gen(function* () {
  yield* effectA  // Error: ErrorA
  yield* effectB  // Error: ErrorB
  yield* effectC  // Error: ErrorC
})
// program: Effect<Result, ErrorA | ErrorB | ErrorC>
```

### catchTag narrows BEFORE yield*

When you pipe an effect through `catchTag` before yielding it, the error type is narrowed
for that expression:

```ts
const program = Effect.gen(function* () {
  // fetchUser: Effect<User, UserNotFound>
  // After catchTag: Effect<User, never>
  const user = yield* fetchUser(id).pipe(
    Effect.catchTag("UserNotFound", () => Effect.succeed(defaultUser))
  )
  // fetchPrefs: Effect<Prefs, PreferencesNotFound>
  const prefs = yield* fetchPreferences(user.id)
  return { user, prefs }
})
// program: Effect<Result, PreferencesNotFound>  (NOT UserNotFound | PreferencesNotFound)
```

This is correct Effect v3 behavior. If TypeScript shows both errors, the issue is environmental
(stale tsserver, code mismatch), not a limitation of Effect.gen.

### catchTags on the whole pipeline

```ts
const program = someEffect.pipe(
  Effect.catchTags({
    ErrorA: (e) => Effect.succeed(fallbackA),
    ErrorB: (e) => Effect.succeed(fallbackB),
  })
)
// Removes ErrorA and ErrorB from the error channel
```

### Error composition through Layer.provide

When you provide a layer, you satisfy the `R` requirement. The layer's own error type
(from `Layer<Out, Error, In>`) becomes part of the effect's error channel:

```ts
const layer: Layer.Layer<MyService, LayerError, Config>
const program: Effect.Effect<Result, AppError, MyService>

const provided = program.pipe(Effect.provide(layer))
// provided: Effect<Result, AppError | LayerError, Config>
```

### Effect.all / Effect.forEach error handling

```ts
// Fail-fast: first error short-circuits, error channel is the individual error type
Effect.forEach(items, fn, { concurrency: 3 })
// Type: Effect<Results[], IndividualError, R>

// Collect all: wrap each item in Effect.either
Effect.forEach(items, (item) => Effect.either(fn(item)), { concurrency: 3 })
// Type: Effect<Either<Result, IndividualError>[], never, R>
// Error channel is never because Either captures failures as values
```

### Error type narrowing through catchTag chains

```ts
type AllErrors = ErrorA | ErrorB | ErrorC

const program: Effect<Result, AllErrors> = ...

const narrowed = program.pipe(
  Effect.catchTag("ErrorA", handleA),  // removes ErrorA
  Effect.catchTag("ErrorB", handleB),  // removes ErrorB
)
// narrowed: Effect<Result, ErrorC>
```

Each `catchTag` removes exactly one error variant from the union.

### Defects do not appear in the error channel

Defects (thrown exceptions, Effect.die) are NOT tracked in the `E` type parameter.
They bypass catchAll and catchTag. Only `Effect.catchAllCause` catches defects.

```ts
// This does NOT catch defects:
program.pipe(Effect.catchAll(handler))

// This catches everything:
program.pipe(Effect.catchAllCause(handler))
```
