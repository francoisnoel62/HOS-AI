// @hos-ai/sdk: types, validation and processing rules for HOS Core 0.1 and HOS Events 0.1, and the helpers to create
// facts. It runs in a browser as well as in Node. File loaders are under @hos-ai/sdk/node, and the non-normative
// arrival-readiness projection under @hos-ai/sdk/reference.

// The draft of the specification this SDK implements.
export const HOS_SPEC_VERSION = "0.1.0-draft.2";

export type * from "./types.generated.ts";
export * from "./validation.ts";
export * from "./validate.ts";
export * from "./processing.ts";
export * from "./facts.ts";
export * from "./time.ts";
export * from "./conformance.ts";
