// Derives the service-account scope vocabulary from the Core API's OpenAPI
// document and writes it as a TypeScript module.
//
// WHERE THE LIST COMES FROM
//
// The Core document's security scheme publishes it: `bearerAuth` carries an
// `x-kaiten-scopes` extension listing every scope an organization credential can
// hold. The API builds that list from pkg/scope (scope.OrganizationScopes) -- the
// one place a scope can come from, since a token is minted only with scopes
// pkg/scope accepts -- minus the modules only the Platform API enforces (`users`,
// `memberships`), which a service account's ksh_ token can never reach.
//
// It used to be read off the operations' `security:` blocks instead. Those name
// only what the Core API itself enforces, and the outbound webhooks service
// enforces read:/write:webhooks on the same tokens, so the picker could not
// grant a webhooks scope at all. The operations are still read, as a
// cross-check: one requiring a scope the list leaves out fails the generation,
// since the picker could never grant it.
//
// A SECOND OUTPUT: WHICH SCOPE EACH OPERATION NEEDS
//
// The operations' `security:` blocks are also what a screen needs to decide
// whether to offer an action: an action calls an operation, the operation names
// the scope it requires. They are written as a second module, keyed by the
// operation's SDK name, so that no screen repeats a scope string the contract
// already holds and a scope renamed on the server fails the type check where an
// action still names the old one.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const INPUT = process.argv[2] ? resolve(process.argv[2]) : resolve(repoRoot, "app/openapi.yaml");
const OUTPUT = process.argv[3] ? resolve(process.argv[3]) : resolve(repoRoot, "app/src/lib/api/scopes.gen.ts");
// Next to the scope vocabulary it is typed by.
const OPERATIONS_OUTPUT = process.argv[4] ? resolve(process.argv[4]) : resolve(dirname(OUTPUT), "operation-scopes.gen.ts");

const SCHEME = "bearerAuth";
const EXTENSION = "x-kaiten-scopes";
const SCOPE_PATTERN = /^([a-z]+):([a-z][a-z0-9_]*)$/;
const HTTP_METHODS = ["get", "put", "post", "delete", "patch", "options", "head", "trace"];

const document = parse(readFileSync(INPUT, "utf8"));
const source = relative(repoRoot, INPUT);

const published = document.components?.securitySchemes?.[SCHEME]?.[EXTENSION];

// A missing or empty list means the document changed shape (a renamed scheme or
// extension), not that tokens stopped carrying scopes. Fail rather than emit an
// empty picker that silently offers nothing.
if (!Array.isArray(published) || published.length === 0) {
	throw new Error(
		`No ${EXTENSION} list on the ${SCHEME} security scheme of ${source}. ` +
			"The scheme or the extension may have been renamed — this generator needs updating.",
	);
}

const scopes = new Set(published);

// The SDK names an operation after its operationId in camelCase
// (`get-licenses` -> `getLicenses`); the table uses the same name.
const sdkName = (operationId) => operationId.replace(/[^A-Za-z0-9]+(.)/g, (_, character) => character.toUpperCase());

const operationScopes = new Map();

for (const [path, operations] of Object.entries(document.paths ?? {})) {
	if (!operations || typeof operations !== "object") continue;

	for (const [method, operation] of Object.entries(operations)) {
		if (!operation || typeof operation !== "object") continue;

		for (const requirement of operation.security ?? []) {
			for (const scope of requirement?.[SCHEME] ?? []) {
				if (!scopes.has(scope)) {
					throw new Error(
						`${method.toUpperCase()} ${path} requires ${scope}, which ${EXTENSION} in ${source} does not list: ` +
							"no token picker could grant it. The list comes from scope.OrganizationScopes in the API.",
					);
				}
			}
		}

		if (!HTTP_METHODS.includes(method) || !operation.operationId) continue;

		// Several requirements are alternatives: one operation, two ways in. The
		// table holds a single answer to "which scope does this need?", so it
		// refuses to guess which of them to name.
		const requirements = (operation.security ?? []).filter((requirement) => requirement?.[SCHEME]);
		if (requirements.length > 1) {
			throw new Error(
				`${method.toUpperCase()} ${path} lists ${requirements.length} alternative ${SCHEME} requirements in ${source}: ` +
					"the operation table has one answer per operation and this generator needs updating.",
			);
		}
		// An operation with no requirement is public: it has no scope to name.
		if (requirements.length === 0) continue;

		const name = sdkName(operation.operationId);
		if (operationScopes.has(name)) {
			throw new Error(`Two operations of ${source} are named ${name} once camel-cased: ${operation.operationId}.`);
		}
		operationScopes.set(name, requirements[0][SCHEME]);
	}
}

const resources = new Set();
const permissions = new Set();
for (const scope of scopes) {
	const match = SCOPE_PATTERN.exec(scope);
	if (!match) throw new Error(`Malformed scope in ${EXTENSION}: ${scope}`);

	permissions.add(match[1]);
	resources.add(match[2]);
}

const sorted = (set) => [...set].sort();
// One entry per line. The app's `generate-api-sdk` runs `vp fmt` over the result,
// which is what settles the final shape -- the formatter collapses short arrays
// onto one line, and guessing where it will do that is how a generated file ends
// up failing the repo's own fmt:check.
const literals = (values) => values.map((v) => `  '${v}',`).join("\n");

const banner = `// AUTO-GENERATED by packages/api-codegen/generate-scopes.js — DO NOT EDIT.
// Regenerate with \`pnpm generate\` after changing which scopes a token can carry.
//
// Source: app/openapi.yaml, the ${EXTENSION} list of its ${SCHEME} scheme.
// The API derives that list from pkg/scope (scope.OrganizationScopes): every
// scope an organization credential can carry is here, including those a service
// in front of the Core API enforces (webhooks, by the webhooks service), so a
// scope added to the backend reaches the token picker with no change on this
// side.`;

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(
	OUTPUT,
	`${banner}

export const API_SCOPE_RESOURCES = [
${literals(sorted(resources))}
] as const;

export type ApiScopeResource = (typeof API_SCOPE_RESOURCES)[number];

export const API_SCOPE_PERMISSIONS = [
${literals(sorted(permissions))}
] as const;

export type ApiScopePermission = (typeof API_SCOPE_PERMISSIONS)[number];

export const API_SCOPES = [
${literals(sorted(scopes))}
] as const;

export type ApiScope = (typeof API_SCOPES)[number];
`,
);

console.log(
	`Wrote ${relative(repoRoot, OUTPUT)}: ${resources.size} resources, ${scopes.size} scopes`,
);

const operationEntries = [...operationScopes.entries()]
	.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
	.map(([name, required]) => `  ${name}: [${required.map((scope) => `'${scope}'`).join(", ")}],`)
	.join("\n");

const operationsBanner = `// AUTO-GENERATED by packages/api-codegen/generate-scopes.js — DO NOT EDIT.
// Regenerate with \`pnpm generate\` after changing the scope an operation requires.
//
// Source: app/openapi.yaml, the \`security\` requirement of each operation.
// The key is the operation's SDK name (\`getBillingCapabilities\`), the value the
// scopes a token must carry to call it. An operation with no requirement is
// public and absent.`;

mkdirSync(dirname(OPERATIONS_OUTPUT), { recursive: true });
writeFileSync(
	OPERATIONS_OUTPUT,
	`${operationsBanner}

import type { ApiScope } from './scopes.gen';

export const OPERATION_SCOPES = {
${operationEntries}
} as const satisfies Record<string, readonly ApiScope[]>;

export type ApiOperationId = keyof typeof OPERATION_SCOPES;
`,
);

console.log(`Wrote ${relative(repoRoot, OPERATIONS_OUTPUT)}: ${operationScopes.size} operations`);
