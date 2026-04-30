/**
 * Canonical names for the dependency-cruiser boundary enforcement rules.
 * These must match the `name` fields in apps/backend/.dependency-cruiser.cjs.
 */
export const BOUNDARY_RULES = {
	/** *.core.ts within a feature must not import sibling tiers or platform adapters */
	CORE_TIER_IS_PURE: "core-tier-is-pure",
	/** Features must not import each other directly (with two narrow allow-listed exceptions) */
	NO_CROSS_FEATURE_IMPORTS: "no-cross-feature-imports",
	/** platform/ must not import from features/ */
	PLATFORM_HAS_NO_FEATURE_DEPS: "platform-has-no-feature-deps",
	/** *.fixture.ts is for tests only */
	FIXTURES_ONLY_FROM_TESTS: "fixtures-only-from-tests",
	/** platform/effect-handler.ts is pure runtime glue */
	EFFECT_HANDLER_STAYS_PURE_GLUE: "effect-handler-stays-pure-glue",
} as const;

export type BoundaryRuleName = (typeof BOUNDARY_RULES)[keyof typeof BOUNDARY_RULES];
