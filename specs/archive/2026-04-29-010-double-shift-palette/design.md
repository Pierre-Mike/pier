# Design

## Approach

A new `palette.ts` module holds the entire state machine, fuzzy filter, entry builder, and dispatch logic as pure functions (no DOM refs, importable in tests without JSDOM). A `PaletteModal.astro` component renders the overlay, mirroring the shape of `LogsModal.astro`. The bootstrap in `index.astro` attaches a single `document` capture-phase `keydown` listener plus a `window.addEventListener("message", ...)` handler; both feed into `createPaletteStateMachine`. The Zellij iframe wrapper route in `apps/backend/` injects a 15-line relay script that forwards Shift keydowns to `window.parent` as `{type:"palette-shift-tap", t: Date.now()}`.

## Public behavioral interface (gate contract)

The gate tests drive the palette entirely through `installPalette(deps)`:

```ts
installPalette(deps: {
  selectProject: (id: string) => Promise<void>;
  openViewer: (projectId: string, path: string) => void;
  getStore?: () => { projects: Project[]; files: FileEntry[]; activeProject: string | null };
  relayTarget?: EventTarget;  // defaults to globalThis; palette attaches "message" listener here
}) → PaletteHandle;

PaletteHandle: {
  isOpen(): boolean;
  tap(t: number, mods?: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): void;
  nonShiftKey(): void;
  esc(): void;
  getEntries(query: string): ReadonlyArray<{ kind: "project" | "file"; label: string }>;
  selectRowAt(index: number): void;
  dispose(): void;
}
```

The implementer is free to choose internal factoring (state machine, helper functions, etc.).
The `relayTarget` dependency enables the test to inject a custom `EventTarget` and dispatch
real `MessageEvent`s, ensuring the implementer registers `relayTarget.addEventListener("message", ...)`.

## Files touched

- `apps/frontend/src/dashboard/palette.ts` — NEW. Exports `installPalette`. Internal factoring at implementer's discretion.
- `apps/frontend/src/dashboard/palette.test.ts` — NEW (gate). Unit tests driven through `installPalette`; authored in RED state.
- `apps/frontend/src/components/PaletteModal.astro` — NEW. Overlay markup + styles (input, scrollable list, row tags). Mirrors `SettingsModal.astro` / `LogsModal.astro` structure.
- `apps/frontend/src/pages/index.astro` — MODIFIED. Import and register palette listener in the page bootstrap block.
- `apps/backend/` (Zellij wrapper route) — MODIFIED. Inject the postMessage relay snippet into the HTML page that wraps the Zellij iframe.
- `scripts/smoke-010-palette-dispatch.ts` — NEW (gate). E2e smoke; authored in RED state.

## Decisions

- **Decision 1 — Terminal iframe postMessage relay**: The Zellij iframe is cross-origin; the parent window never sees its keystrokes. Rather than requiring users to click outside the terminal before invoking the palette, a tiny relay script is injected into the backend-controlled Zellij wrapper page. It listens for Shift `keydown` events and posts `{type:"palette-shift-tap", t: Date.now()}` to `window.parent`. The palette state machine treats relayed messages identically to native Shift taps. This avoids any iframe `allow` attribute changes, no new backend routes, and keeps the relay code to ~15 lines.

- **Decision 2 — Pure-function palette core**: All state machine logic is extracted into functions that accept timestamps as parameters (no `Date.now()` inside the machine), making them deterministic and testable without fake timers or DOM. The Astro component and `index.astro` wire deal with actual DOM events and call into the pure core.

## Risks

- **Relay injection timing**: The relay snippet must be injected before the iframe document's `keydown` handlers fire. Placement at end-of-`<body>` in the wrapper page is sufficient; the script is synchronous.
- **z-index conflicts**: The palette modal must have a higher `z-index` than the terminal iframe and any other overlay. Use a dedicated CSS custom property at the `:root` level.

## Out of scope

- Cross-project file scan — only active project's `store.files` appear.
- Persistence of recent picks or "frequent" ordering.
- Customizable gesture (e.g., Cmd+P alternative).
- Keyboard shortcut rebinding UI.
