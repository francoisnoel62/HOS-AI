import { readFileSync } from "node:fs";
import path from "node:path";

import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";

// Validators for the published HOS 0.1 JSON Schemas, loaded together because they reference each other by $id.

export const readJson = (file: string) => JSON.parse(readFileSync(path.join(process.cwd(), "public", file), "utf8"));

const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true, strictTypes: false });
addFormats(ajv);
ajv.addVocabulary(["x-hos-authority", "x-hos-boundary", "x-hos-family"]);
for (const file of ["core", "event-envelope", "events", "producer-manifest", "reference/arrival-readiness"]) ajv.addSchema(readJson(`spec/0.1/schemas/${file}.schema.json`));

export const validateEvent = ajv.getSchema("urn:hos:schema:0.1:events")!;
export const validateManifest = ajv.getSchema("urn:hos:schema:0.1:producer-manifest")!;
export const validateSituation = ajv.getSchema("urn:hos:schema:0.1:reference:arrival-readiness")!;
export const validateUnit = ajv.getSchema("urn:hos:schema:0.1:core#/$defs/Unit")!;
export const validateProperty = ajv.getSchema("urn:hos:schema:0.1:core#/$defs/Property")!;
export const errors = (validate: ValidateFunction) => JSON.stringify(validate.errors);
