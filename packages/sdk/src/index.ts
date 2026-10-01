// @hos-ai/sdk: types, validation and processing rules for HOS Core 0.1 and HOS Events 0.1, the types and schemas of HOS
// Commands 0.2 (a draft), the helpers to create facts, and signed producer manifests. It runs in a browser as well as in Node. File loaders are under @hos-ai/sdk/node, and
// the non-normative arrival-readiness projection under @hos-ai/sdk/reference.

// The draft of each version of the specification this SDK embeds. HOS 0.2 is Core 0.1 and Events 0.1 unchanged, plus HOS
// Commands 0.2 and three event types.
export const HOS_SPEC_VERSIONS = { "0.1": "0.1.0-draft.2", "0.2": "0.2.0-draft.1" } as const;

// The draft of HOS 0.1, which the tools show until HOS 0.2 is published with them.
export const HOS_SPEC_VERSION = HOS_SPEC_VERSIONS["0.1"];

export type * from "./types.generated.ts";
export type * from "./v02/types.generated.ts";
export * from "./validation.ts";
export * from "./validate.ts";
export * from "./producer.ts";
export * from "./signing.ts";
export * from "./canonical.ts";
export * from "./processing.ts";
export * from "./facts.ts";
export * from "./time.ts";
export * from "./conformance.ts";
