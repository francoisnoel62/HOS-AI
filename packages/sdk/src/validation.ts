import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { schemas } from "./schemas.generated.ts";

// Validators for the published HOS 0.1 JSON Schemas, loaded together because they reference each other by $id. The
// schemas are embedded in the SDK, so validation reads no file and runs in a browser as well as in Node.

const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true, strictTypes: false });
addFormats(ajv);
ajv.addVocabulary(["x-hos-authority", "x-hos-boundary", "x-hos-family"]);
ajv.addSchema(Object.values(schemas));

// A validator says whether a document is valid, and keeps the errors of its last call.
export type Validator = { (document: unknown): boolean; errors?: ErrorObject[] | null };

// None of the HOS schemas is asynchronous.
const validator = (id: string): Validator => ajv.getSchema(id) as ValidateFunction;

export const validateEvent = validator("urn:hos:schema:0.1:events");
export const validateManifest = validator("urn:hos:schema:0.1:producer-manifest");
export const validateSituation = validator("urn:hos:schema:0.1:reference:arrival-readiness");
export const validateUnit = validator("urn:hos:schema:0.1:core#/$defs/Unit");
export const validateProperty = validator("urn:hos:schema:0.1:core#/$defs/Property");
export const validateMaintenanceWindow = validator("urn:hos:schema:0.1:core#/$defs/MaintenanceWindow");
