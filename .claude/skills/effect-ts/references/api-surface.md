## Effect-TS v3 API Surface Reference

Verified-correct signatures for core Effect modules. Consult this before generating code
to avoid hallucinating non-existent APIs.

---

### Effect Constructors

```ts
Effect.succeed<A>(value: A): Effect<A>
Effect.fail<E>(error: E): Effect<never, E>
Effect.sync<A>(thunk: () => A): Effect<A>                        // cannot throw
Effect.try<A>(thunk: () => A): Effect<A, UnknownException>       // might throw
Effect.try<A, E>({ try: () => A, catch: (u: unknown) => E }): Effect<A, E>
Effect.promise<A>(thunk: () => Promise<A>): Effect<A>            // should not reject
Effect.tryPromise<A>(thunk: () => Promise<A>): Effect<A, UnknownException>
Effect.tryPromise<A, E>({ try: () => Promise<A>, catch: (u: unknown) => E }): Effect<A, E>
Effect.void: Effect<void>
Effect.suspend<A, E, R>(thunk: () => Effect<A, E, R>): Effect<A, E, R>
```

### Effect.gen

```ts
Effect.gen<Eff extends YieldWrap<Effect<any, any, any>>, AEff>(
  f: () => Generator<Eff, AEff, never>
): Effect<AEff, Error, Context>
```

Usage: `Effect.gen(function* () { const x = yield* someEffect; return x })`

### Effect.fn (newer API — adds automatic tracing)

```ts
const myFn = Effect.fn("myFn")(function* (arg1: string, arg2: number) {
  const result = yield* someEffect
  return result
})
```

### Combinators

```ts
Effect.map<A, B>(self: Effect<A, E, R>, f: (a: A) => B): Effect<B, E, R>
Effect.flatMap<A, B, E2, R2>(self: Effect<A, E, R>, f: (a: A) => Effect<B, E2, R2>): Effect<B, E | E2, R | R2>
Effect.andThen<A, B>(self: Effect<A, E, R>, f: B | ((a: A) => B) | Effect<B, E2, R2>): Effect<B, ...>
Effect.tap<A>(self: Effect<A, E, R>, f: (a: A) => Effect<any, E2, R2>): Effect<A, E | E2, R | R2>
Effect.all<Effects>(effects: Effects, options?: { concurrency?: number }): Effect<Results, ...>
Effect.forEach<A, B, E, R>(items: Iterable<A>, f: (a: A) => Effect<B, E, R>, options?: { concurrency?: number }): Effect<B[], E, R>
```

### Error Handling

```ts
Effect.catchTag<E, K extends E["_tag"]>(tag: K, handler: (e: Extract<E, {_tag: K}>) => Effect<...>): ...
Effect.catchTags<E>(handlers: { [K in E["_tag"]]: (e: Extract<E, {_tag: K}>) => Effect<...> }): ...
Effect.catchAll<E>(handler: (e: E) => Effect<...>): ...
Effect.catchAllCause(handler: (cause: Cause<E>) => Effect<...>): ...  // catches defects too
Effect.either<A, E, R>(self: Effect<A, E, R>): Effect<Either<A, E>, never, R>
Effect.orDie<A, E, R>(self: Effect<A, E, R>): Effect<A, never, R>   // expected errors → defects
Effect.orElse<A, E, R, B, E2, R2>(self: Effect<A, E, R>, that: () => Effect<B, E2, R2>): Effect<A | B, E2, R | R2>
```

### Resource Management

```ts
Effect.acquireRelease<A, E, R>(
  acquire: Effect<A, E, R>,
  release: (a: A, exit: Exit<unknown, unknown>) => Effect<void, never, never>
): Effect<A, E, R | Scope>

Effect.acquireUseRelease<A, E, R, B, E2, R2>(
  acquire: Effect<A, E, R>,
  use: (a: A) => Effect<B, E2, R2>,
  release: (a: A, exit: Exit<unknown, unknown>) => Effect<void, never, never>
): Effect<B, E | E2, R | R2>

Effect.scoped<A, E, R>(self: Effect<A, E, R | Scope>): Effect<A, E, R>
Effect.addFinalizer(f: (exit: Exit<unknown, unknown>) => Effect<void, never, never>): Effect<void, never, Scope>
```

**Critical:** Release functions must be infallible — `Effect<void, never, never>`.

### Timeout

```ts
Effect.timeout(self: Effect<A, E, R>, duration: DurationInput): Effect<A, E, R>
// Returns Option<A> — None on timeout (NOTE: may vary by version)

Effect.timeoutFail<E2>(options: {
  duration: DurationInput,
  onTimeout: () => E2
}): <A, E, R>(self: Effect<A, E, R>) => Effect<A, E | E2, R>
// Returns typed error on timeout — preferred for typed error channels
```

### Retry

```ts
Effect.retry<A, E, R>(self: Effect<A, E, R>, options: {
  schedule?: Schedule<any, E, any>,
  times?: number,
  while?: (e: E) => boolean,
  until?: (e: E) => boolean,
}): Effect<A, E, R>
```

### Schedule

```ts
Schedule.exponential(base: DurationInput): Schedule<number>
Schedule.recurs(n: number): Schedule<number>         // repeat n times
Schedule.spaced(duration: DurationInput): Schedule<number>
Schedule.fixed(duration: DurationInput): Schedule<number>

// Composition
Schedule.intersect(s1, s2): Schedule    // both must allow (AND) — used for limiting
Schedule.union(s1, s2): Schedule        // either allows (OR)
Schedule.compose(s1, s2): Schedule      // sequential — s1 then s2

// Modification
schedule.pipe(Schedule.modifyDelay((_, delay) => clampedDelay))
schedule.pipe(Schedule.whileOutput(pred))
schedule.pipe(Schedule.whileInput(pred))
```

**DurationInput:** `"200 millis"`, `"5 seconds"`, `"1 minute"`, `Duration.millis(200)`, etc.

### Context.Tag (Service Definition)

```ts
// This project uses GenericTag:
Context.GenericTag<Service>("ServiceIdentifier")

// Class-based alternative (also valid, not used in this project):
class MyService extends Context.Tag("MyService")<MyService, ServiceShape>() {}
```

### Layer

```ts
Layer.succeed<S>(tag: Context.Tag<S>, service: S): Layer<S>
Layer.sync<S>(tag: Context.Tag<S>, thunk: () => S): Layer<S>
Layer.effect<S>(tag: Context.Tag<S>, effect: Effect<S, E, R>): Layer<S, E, R>
Layer.scoped<S>(tag: Context.Tag<S>, effect: Effect<S, E, R | Scope>): Layer<S, E, Exclude<R, Scope>>

Layer.merge(l1: Layer<A>, l2: Layer<B>): Layer<A | B>
Layer.provide(using: Layer<Dep>): <Out, E>(self: Layer<Out, E, Dep>) => Layer<Out, E>
Layer.provideMerge(using: Layer<Dep>): <Out, E>(self: Layer<Out, E, Dep>) => Layer<Out | Dep, E>
```

### Schema (@effect/schema)

```ts
Schema.String: Schema<string>
Schema.Number: Schema<number>
Schema.Boolean: Schema<boolean>
Schema.NonEmptyString: Schema<string>
Schema.Literal<L>(...values: L[]): Schema<L>

Schema.Struct({ key: Schema<A>, ... }): Schema<{ key: A, ... }>
Schema.optional(schema: Schema<A>): PropertySignature   // for Struct fields

Schema.decodeUnknown<A>(schema: Schema<A>): (input: unknown) => Effect<A, ParseError>
Schema.decodeUnknownSync<A>(schema: Schema<A>): (input: unknown) => A   // throws on error
Schema.encodeUnknown<A>(schema: Schema<A>): (input: A) => Effect<unknown, ParseError>
Schema.encodeSync<A>(schema: Schema<A>): (input: A) => unknown

Schema.Union(...schemas: Schema[]): Schema
Schema.TaggedStruct(tag: string, fields: {}): Schema    // struct with literal _tag

// Filters
schema.pipe(Schema.minLength(n))
schema.pipe(Schema.maxLength(n))
schema.pipe(Schema.greaterThanOrEqualTo(n))
schema.pipe(Schema.pattern(regex))
schema.pipe(Schema.brand("BrandName"))

// Class-based schemas
class MyClass extends Schema.Class<MyClass>("MyClass")({ fields }) {}
class MyTagged extends Schema.TaggedClass<MyTagged>()("Tag", { fields }) {}
class MyError extends Schema.TaggedError<MyError>()("Tag", { fields }) {}
```

### Data.TaggedError

```ts
class MyError extends Data.TaggedError("MyError")<{
  readonly field1: Type1
  readonly field2: Type2
}> {}

// Yieldable — no Effect.fail needed in Effect.gen:
yield* new MyError({ field1: "value", field2: 42 })
```

### Exit and Cause

```ts
Exit.isSuccess(exit: Exit<A, E>): exit is Exit.Success<A, E>
Exit.isFailure(exit: Exit<A, E>): exit is Exit.Failure<A, E>
Cause.failureOption(cause: Cause<E>): Option<E>
```

### Running Effects

```ts
Effect.runPromise<A>(effect: Effect<A, never, never>): Promise<A>
Effect.runPromiseExit<A, E>(effect: Effect<A, E, never>): Promise<Exit<A, E>>
Effect.runSync<A>(effect: Effect<A, never, never>): A
Effect.provide<R>(layer: Layer<R>): <A, E>(self: Effect<A, E, R>) => Effect<A, E, never>
```

### APIs That DO NOT Exist (Common Hallucinations)

These are frequently generated by AI but do not exist in Effect v3:

- `Effect.mapPar` / `Effect.forEachPar` / `Effect.collectAllPar` — use `Effect.forEach` with `{ concurrency: N }`
- `Effect.retryN` — use `Effect.retry` with `{ times: N }` or a Schedule
- `Schedule.filter` — use `while` option on `Effect.retry`
- `Effect.encodeError` / `Schema.fromTaggedError` — not real APIs
- `Effect.gen(function* (_) { yield* _(...) })` — deprecated adapter pattern from v2
- `Effect.Do` / `Effect.bind` / `Effect.let` — deprecated Do notation
- `{ parallel: N }` option — use `{ concurrency: N }`
- `Layer.fromEffect` — use `Layer.effect`
- `Layer.fromScoped` — use `Layer.scoped`
