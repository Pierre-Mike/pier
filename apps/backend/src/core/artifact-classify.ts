import { type ArtifactKind, classify as classifyBlob } from "./blob-classify.ts";

export { classify } from "./blob-classify.ts";
export type { ArtifactKind };

export const kindOf = (path: string): ArtifactKind => classifyBlob(path).kind;
