## Project-Specific Effect Patterns

Patterns and conventions specific to this repository (template-BPE).

---

### Architecture: Functional Core / Imperative Shell

```
src/backend/
├── core/     # PURE — Effect<A, E, never>, no I/O, no side effects
├── infra/    # I/O — Context.GenericTag + Layer, one file per external system
├── shell/    # Orchestration — Effect.gen coordinators + Hono routes
└── main.ts   # Composition root — provides live Layers
```

### Core Layer Rules

- No side effects: no `new Date()`, no `crypto.randomUUID()`, no `Math.random()`
- Pass non-deterministic values as parameters
- No imports from `infra/` or `shell/`
- Validation logic lives here — called from infra/shell, never duplicated
- Errors defined here with `Data.TaggedError`
- Return type: `Effect<A, E, never>` — no `R` requirement

```ts
// core/note.ts
export class NoteNotFound extends Data.TaggedError("NoteNotFound")<{
  readonly id: NoteId;
}> {}

export const validateNote = (input: {
  readonly title: string;
  readonly body?: string;
}): Effect.Effect<void, NoteError> =>
  Effect.gen(function* () {
    yield* validateTitle(input.title);
    if (input.body !== undefined) {
      yield* validateBody(input.body);
    }
  });
```

### Infra Layer Rules

- One file per external system (DB, KV, API, etc.)
- Service interface + same-name const pattern:

```ts
export interface NoteRepository {
  readonly create: (input: CreateInput) => Effect.Effect<Note, NoteError>
  readonly findById: (id: NoteId) => Effect.Effect<Note, NoteNotFound>
}
export const NoteRepository = Context.GenericTag<NoteRepository>("NoteRepository")
```

- Method return types: `Effect<A, E>` — R is always never
- Always provide both Live and Test layers
- `Layer.succeed` for static implementations, `Layer.sync` for stateful init
- No business logic — only I/O adapters

### Shell Layer Rules

- `Effect.gen` coordinators following impure(read) → pure(compute) → impure(write)
- Hono routes use `defineRoute` factory:

```ts
defineRoute({
  deps: (c) => makeNoteRepositoryLive(c.env.DB),
  onError: onNoteError,
  handler: postNoteHandler,
})
```

- `Effect.runPromise` / `Effect.runPromiseExit` only in shell/ and main.ts
- No business logic — delegates to core/

### Route Module Convention

Every route file exports both `app` and `testApp`:

```ts
export const notesRoute = { app, testApp } satisfies RouteModule<typeof app>;
```

- `app` uses live layers (factory from env bindings)
- `testApp` uses test layers (static, in-memory)

### defineRoute Factory

Located at `shell/effect-handler.ts`. Bridges Hono and Effect:

```ts
defineRoute({
  deps: (c) => Layer,           // factory: per-request layer from env
  deps: staticLayer,            // static: reused across requests
  // deps omitted when R = never
  onError: (error, c) => Response,  // optional: typed error → HTTP response
  handler: (c) => Effect<Response, E, R>,
})
```

- Returns async Hono handler
- Internally: `Effect.runPromiseExit` → Exit pattern matching → onError mapping
- `effect-handler.ts` must NOT import from `core/` or `infra/`

### Testing Patterns

```ts
// Mock service via Layer.succeed
const MockRepo = Layer.succeed(NoteRepository, {
  create: (input) => Effect.succeed(mockNote),
  findById: (id) => Effect.fail(new NoteNotFound({ id })),
})

// Run effect with mock layer
const result = await Effect.runPromise(
  Effect.provide(myEffect, MockRepo)
)

// Error assertions with Effect.either
const result = await Effect.runPromise(Effect.either(myEffect))
expect(Either.isLeft(result)).toBe(true)
if (Either.isLeft(result)) {
  expect(result.left).toBeInstanceOf(NoteNotFound)
}
```

- No jest.mock, no class-based mocking — Layer.succeed is the mock
- `Effect.either` converts errors to values for assertions
- `Effect.provide` before `runPromise` — never pass layer to runPromise
- Co-located tests: `foo.ts` → `foo.test.ts` in same directory

### Schema Patterns

```ts
// Branded types for type-safe IDs
export const NoteId = Schema.String.pipe(Schema.brand("NoteId"))
export type NoteId = Schema.Schema.Type<typeof NoteId>

// Struct schemas for validation
export const VersionResponse = Schema.Struct({
  version: Schema.String,
  env: Schema.String,
})

// Decode in handlers
const parsed = yield* Schema.decodeUnknown(MySchema)(rawData)
```

### Shared Test Layer Pattern

When `Layer.sync` creates new state per `Effect.provide`, and you need shared state across
a test suite:

```ts
const TestLayer: Layer.Layer<MyService> = makeTestService()

// Build once, wrap in Layer.succeed for sharing
const sharedService: MyService = Effect.runSync(
  Layer.build(TestLayer).pipe(
    Effect.map((ctx) => Context.get(ctx, MyService)),
    Effect.scoped,
  ),
)
const sharedTestLayer: Layer.Layer<MyService> = Layer.succeed(MyService, sharedService)
```
