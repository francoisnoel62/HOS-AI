import { HOS_SPEC_VERSION } from "@hos-ai/sdk";

import { protocol } from "@/packages/cli/src/conformance/protocol";
import cliPackage from "@/packages/cli/package.json";
import sdkPackage from "@/packages/sdk/package.json";

// The versions the tools documentation shows, read from the packages themselves: a release changes them everywhere.

export const versions = {
  cli: cliPackage.version,
  sdk: sdkPackage.version,
  spec: HOS_SPEC_VERSION,
  protocol,
  node: cliPackage.engines.node.replace(/^>=\s*/, ""),
};

// What hos --version prints.
export const versionLine = `@hos-ai/cli ${versions.cli} (HOS ${versions.spec})`;
