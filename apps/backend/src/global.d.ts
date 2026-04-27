/**
 * Ambient type declarations for globals not present in the ESNext lib
 * but referenced by test files that must remain untouched.
 */

/** WebSocket binary data type — part of the DOM spec, absent from ESNext-only lib. */
type BinaryType = "arraybuffer" | "blob";
