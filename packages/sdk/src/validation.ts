import { compiled, type ErrorObject } from "./ajv.ts";

// Validators for the published HOS 0.1 and HOS 0.2 JSON Schemas. They say whether a document is valid and keep Ajv's errors;
// validate and validateStream turn those into readable messages.

// A validator says whether a document is valid, and keeps the errors of its last call.
export type Validator = { (document: unknown): boolean; errors?: ErrorObject[] | null };

export const validateEvent: Validator = compiled("urn:hos:schema:0.1:events");
export const validateManifest: Validator = compiled("urn:hos:schema:0.1:producer-manifest");
export const validateSituation: Validator = compiled("urn:hos:schema:0.1:reference:arrival-readiness");
export const validateUnit: Validator = compiled("urn:hos:schema:0.1:core#/$defs/Unit");
export const validateProperty: Validator = compiled("urn:hos:schema:0.1:core#/$defs/Property");
export const validateMaintenanceWindow: Validator = compiled("urn:hos:schema:0.1:core#/$defs/MaintenanceWindow");

// HOS 0.2: the event types it adds, the commands, approvals and policies of HOS Commands 0.2, and its manifest, which may declare commands.
export const validateEventV02: Validator = compiled("urn:hos:schema:0.2:events");
export const validateCommand: Validator = compiled("urn:hos:schema:0.2:command");
export const validateApproval: Validator = compiled("urn:hos:schema:0.2:approval");
export const validatePolicy: Validator = compiled("urn:hos:schema:0.2:policy");
export const validateManifestV02: Validator = compiled("urn:hos:schema:0.2:producer-manifest");
