/**
 * Canonical names for the dependency-cruiser boundary enforcement rules.
 * These must match the `name` fields in apps/backend/.dependency-cruiser.cjs.
 */
export const BOUNDARY_RULES = {
	/** shell/effect-handler.ts must not import from core/ or infra/ */
	NO_EFFECT_HANDLER_TO_CORE_OR_INFRA: "no-effect-handler-to-core-or-infra",
	/** core/ must not import from shell/ or infra/ */
	NO_CORE_TO_SHELL_OR_INFRA: "no-core-to-shell-or-infra",
} as const;

export type BoundaryRuleName = (typeof BOUNDARY_RULES)[keyof typeof BOUNDARY_RULES];
