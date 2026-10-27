import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const generator = fileURLToPath(new URL("./generate-scopes.js", import.meta.url));
const document = (scopes) => ({
  components: { securitySchemes: { bearerAuth: { "x-kaiten-scopes": scopes } } },
  paths: { "/customers": { get: { security: [{ bearerAuth: ["read:customers"] }] } } },
});

for (const [name, spec, error] of [
  ["missing extension", document(undefined), /No x-kaiten-scopes list/],
  ["empty extension", document([]), /No x-kaiten-scopes list/],
  ["malformed published scope", document(["read:customers", "not a scope"]), /Malformed scope/],
  ["operation requires unpublished scope", document(["write:customers"]), /GET \/customers requires read:customers/],
  ["valid output includes scopes enforced outside Core", document(["write:webhooks", "read:customers", "read:customers"]), null],
]) {
  test(name, () => {
    const dir = mkdtempSync(join(tmpdir(), "kaiten-scopes-"));
    try {
      const input = join(dir, "openapi.yaml"), output = join(dir, "scopes.ts");
      writeFileSync(input, JSON.stringify(spec)); // JSON is valid YAML.
      const result = spawnSync(process.execPath, [generator, input, output], { encoding: "utf8" });
      if (error) {
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, error);
        assert.equal(existsSync(output), false);
      } else {
        assert.equal(result.status, 0, result.stderr);
        const code = readFileSync(output, "utf8");
        assert.match(code, /API_SCOPE_RESOURCES = \[\n  'customers',\n  'webhooks',/);
        assert.match(code, /API_SCOPE_PERMISSIONS = \[\n  'read',\n  'write',/);
        assert.match(code, /API_SCOPES = \[\n  'read:customers',\n  'write:webhooks',/);
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

// The second output: which scope each operation needs.
const operationsDocument = (paths) => ({
  components: { securitySchemes: { bearerAuth: { "x-kaiten-scopes": ["read:customers", "write:customers", "read:licenses"] } } },
  paths,
});

const generate = (spec) => {
  const dir = mkdtempSync(join(tmpdir(), "kaiten-operation-scopes-"));
  const input = join(dir, "openapi.yaml"), output = join(dir, "scopes.ts"), operations = join(dir, "operation-scopes.gen.ts");
  writeFileSync(input, JSON.stringify(spec));
  const result = spawnSync(process.execPath, [generator, input, output], { encoding: "utf8" });
  return { dir, output, operations, result };
};

test("writes the scope of each operation, keyed by its SDK name", () => {
  const { dir, operations, result } = generate(
    operationsDocument({
      "/customers": {
        get: { operationId: "list-customers", security: [{ bearerAuth: ["read:customers"] }] },
        post: { operationId: "createCustomer", security: [{ bearerAuth: ["write:customers"] }] },
      },
      "/licenses/{slug}": {
        parameters: [{ name: "slug", in: "path" }],
        get: { operationId: "get-license", security: [{ bearerAuth: ["read:licenses", "read:customers"] }] },
      },
      "/healthz": { get: { operationId: "get-health" } },
    }),
  );
  try {
    assert.equal(result.status, 0, result.stderr);
    const code = readFileSync(operations, "utf8");
    assert.match(code, /import type \{ ApiScope \} from '\.\/scopes\.gen';/);
    // Sorted by SDK name, one entry per line; a public operation has no entry.
    assert.match(
      code,
      /OPERATION_SCOPES = \{\n  createCustomer: \['write:customers'\],\n  getLicense: \['read:licenses', 'read:customers'\],\n  listCustomers: \['read:customers'\],\n\} as const satisfies/,
    );
    assert.doesNotMatch(code, /getHealth/);
    assert.match(code, /export type ApiOperationId = keyof typeof OPERATION_SCOPES;/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

for (const [name, paths, error] of [
  [
    "an operation with alternative requirements",
    { "/customers": { get: { operationId: "listCustomers", security: [{ bearerAuth: ["read:customers"] }, { bearerAuth: ["write:customers"] }] } } },
    /GET \/customers lists 2 alternative bearerAuth requirements/,
  ],
  [
    "two operations that share an SDK name",
    {
      "/a": { get: { operationId: "list-customers", security: [{ bearerAuth: ["read:customers"] }] } },
      "/b": { get: { operationId: "listCustomers", security: [{ bearerAuth: ["read:customers"] }] } },
    },
    /are named listCustomers once camel-cased/,
  ],
]) {
  test(`refuses ${name} and writes nothing`, () => {
    const { dir, output, operations, result } = generate(operationsDocument(paths));
    try {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, error);
      assert.equal(existsSync(output), false);
      assert.equal(existsSync(operations), false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}
