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
