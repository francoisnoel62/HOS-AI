import { compiled, type ErrorObject } from "./ajv.ts";

// Validators for the published HOS 0.1 JSON Schemas. They say whether a document is valid and keep Ajv's errors;
// validate and validateStream turn those into readable messages.

// A validator says whether a document is valid, and keeps the errors of its last call.
export type Validator = { (document: unknown): boolean; errors?: ErrorObject[] | null };

export const validateEvent: Validator = compiled("urn:hos:schema:0.1:events");
export const validateManifest: Validator = compiled("urn:hos:schema:0.1:producer-manifest");
export const validateSituation: Validator = compiled("urn:hos:schema:0.1:reference:arrival-readiness");
export const validateUnit: Validator = compiled("urn:hos:schema:0.1:core#/$defs/Unit");
export const validateProperty: Validator = compiled("urn:hos:schema:0.1:core#/$defs/Property");
export const validateMaintenanceWindow: Validator = compiled("urn:hos:schema:0.1:core#/$defs/MaintenanceWindow");
