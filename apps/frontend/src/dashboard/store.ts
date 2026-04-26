/**
 * Auto-tracking reactive store using Proxy
 * Ported from pier v1 (legacy pier) store.js
 */

type Observer = () => void;
// biome-ignore lint/complexity/useMaxParams: Validator signature needs all params
type Validator<T> = (value: T, prev: T, state: Record<string, unknown>) => void;

interface StoreOptions {
	validators?: Record<string, Validator<unknown>>;
	onError?: (err: Error) => void;
}

interface ReactiveStore {
	observe: (fn: Observer) => () => void;
	untrack: <R>(fn: () => R) => R;
	batch: (fn: () => void) => void;
}

export function createStore<T extends Record<string, unknown>>(
	initial: T,
	opts: StoreOptions = {},
): T & ReactiveStore {
	// biome-ignore lint/suspicious/noConsole: Default error handler
	const { validators = {}, onError = console.error } = opts;

	const target = initial;
	const observers = new Set<Observer>();
	const deps = new WeakMap<Observer, Set<string>>();
	const dirty = new Set<string>();
	let activeObserver: Observer | null = null;
	let batchPending = false;
	let validating = false;

	function wrapCollection<C extends Map<unknown, unknown> | Set<unknown>>(coll: C, key: string): C {
		const mutators = coll instanceof Map ? ["set", "delete", "clear"] : ["add", "delete", "clear"];
		for (const m of mutators) {
			const orig = Reflect.get(coll, m) as (...args: unknown[]) => unknown;
			const bound = orig.bind(coll);
			Reflect.set(coll, m, (...args: unknown[]) => {
				const result = bound(...args);
				dirty.add(key);
				scheduleBatch();
				return result;
			});
		}
		return coll;
	}

	for (const key of Object.keys(target)) {
		const val = target[key];
		if (val instanceof Map || val instanceof Set) {
			(target as Record<string, unknown>)[key] = wrapCollection(val, key);
		}
	}

	const handler: ProxyHandler<T> = {
		get(obj, key) {
			if (activeObserver && typeof key === "string") {
				let set = deps.get(activeObserver);
				if (!set) {
					set = new Set();
					deps.set(activeObserver, set);
				}
				set.add(key);
			}
			return Reflect.get(obj, key);
		},

		// biome-ignore lint/complexity/useMaxParams: Proxy handler signature
		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Store core logic
		set(obj, key, value) {
			if (validating) {
				throw new Error(`Store mutation inside validator forbidden: ${String(key)}`);
			}

			const prev = obj[key as keyof T];
			if (prev === value) return true;

			if (typeof key === "string" && validators[key]) {
				validating = true;
				try {
					validators[key](value, prev, obj);
				} catch (err) {
					validating = false;
					if (onError) onError(err as Error);
					return true;
				} finally {
					validating = false;
				}
			}

			if (value instanceof Map || value instanceof Set) {
				Reflect.set(obj, key, wrapCollection(value, String(key)));
			} else {
				Reflect.set(obj, key, value);
			}

			if (typeof key === "string") {
				dirty.add(key);
				scheduleBatch();
			}
			return true;
		},
	};

	const store = new Proxy(target, handler) as T & ReactiveStore;

	function scheduleBatch() {
		if (batchPending) return;
		batchPending = true;
		queueMicrotask(() => {
			batchPending = false;
			notifyObservers();
			dirty.clear();
		});
	}

	function notifyObservers() {
		for (const obs of observers) {
			const depKeys = deps.get(obs);
			if (!depKeys) continue;
			const shouldRun = [...depKeys].some((k) => dirty.has(k));
			if (shouldRun) {
				deps.delete(obs);
				runObserver(obs);
			}
		}
	}

	function runObserver(fn: Observer) {
		const prev = activeObserver;
		activeObserver = fn;
		try {
			fn();
		} catch (err) {
			// biome-ignore lint/suspicious/noConsole: Error logging
			console.error("Observer error:", err);
		} finally {
			activeObserver = prev;
		}
	}

	store.observe = function observe(fn: Observer) {
		observers.add(fn);
		runObserver(fn);
		return () => {
			observers.delete(fn);
			deps.delete(fn);
		};
	};

	store.untrack = function untrack<R>(fn: () => R): R {
		const prev = activeObserver;
		activeObserver = null;
		try {
			return fn();
		} finally {
			activeObserver = prev;
		}
	};

	store.batch = function batch(fn: () => void) {
		fn();
		if (batchPending) {
			batchPending = false;
			notifyObservers();
			dirty.clear();
		}
	};

	return store;
}
