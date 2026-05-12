// Re-export of the dashboard theme module so the colocated-tests pairing
// rule (foo.test.ts ↔ foo.ts in the same directory) holds for theme.test.ts
// — that test inspects theme.css contents rather than importing this module.
export { getTheme, initTheme } from "../dashboard/theme";
