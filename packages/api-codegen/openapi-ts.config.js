// Lives in its own workspace package so @hey-api/openapi-ts resolves its
// typescript peer against this package's TS6, not the app's TS7 -- the
// Go-based typescript@7 has no compiler JS API (ts.SyntaxKind is undefined)
// and openapi-ts crashes at import time. Input/output stay in app/.
import { defaultPlugins, defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
	input: "../../app/openapi.yaml",
	output: "../../app/src/api-client",

	plugins: [
		...defaultPlugins.filter((plugin) => plugin !== "@hey-api/typescript"),
		{
			name: "@hey-api/typescript",
			readableNameBuilder: "{{name}}",
		},
		"zod",
    "@tanstack/react-query"
	],
});
