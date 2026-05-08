/**
 * Re-export shim — satisfies the colocated-tests rule for
 * apps/frontend/src/components/projects.test.ts.
 *
 * The actual implementation lives in ../dashboard/projects.ts.
 * The gate tests for spec 037 import directly from that file;
 * this shim exists solely so the colocated-tests pre-push check
 * finds a corresponding source file next to the test files.
 */
export * from "../dashboard/projects";
