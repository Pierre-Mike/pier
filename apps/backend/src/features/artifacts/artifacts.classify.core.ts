import { type ArtifactKind, classify as classifyBlob } from "./artifacts.blob-classify.core.ts";

export { classify } from "./artifacts.blob-classify.core.ts";
export type { ArtifactKind };

export const kindOf = (path: string): ArtifactKind => classifyBlob(path).kind;
