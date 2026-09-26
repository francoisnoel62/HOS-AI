import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { schemas } from "./schemas.generated.ts";

// The validator behind the SDK, internal to it. The published HOS 0.1 JSON Schemas are loaded together because they
// reference each other by $id. They are embedded in the SDK, so validation reads no file and runs in a browser as well
// as in Node. verbose keeps each error's schema and value, which readable messages draw on.

const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true, strictTypes: false, verbose: true });
addFormats(ajv);
ajv.addVocabulary(["x-hos-authority", "x-hos-boundary", "x-hos-family"]);
ajv.addSchema(Object.values(schemas));

// None of the HOS schemas is asynchronous.
export function compiled(id: string) {
  const validate = ajv.getSchema(id);
  if (!validate) throw new Error(`Unknown schema ${id}`);
  return validate as ValidateFunction;
}

export const matches = (schema: object, value: unknown) => ajv.validate(schema, value) as boolean;

export type { ErrorObject };
