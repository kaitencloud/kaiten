import type { CodegenConfig } from '@graphql-codegen/cli'

const config: CodegenConfig = {
	schema: [
		'../api/internal/infrastructure/http/graphql/schema.graphqls',
		'../api/internal/modules/**/schema/*.graphqls',
	  ],
  documents: ['src/**/*.{ts,tsx}'],
  ignoreNoDocuments: true,
  generates: {
    './src/api-client/graphql/': {
      preset: 'client',
      config: {
        documentMode: 'string',
        useTypeImports: true,
        scalars: {
          UUID: 'string',
          Time: 'string',
          Map: 'Record<string, unknown>',
        },
      },
    },
    './src/api-client/graphql/schema.graphql': {
      plugins: ['schema-ast'],
      config: {
        includeDirectives: true,
        scalars: {
          UUID: 'string',
        }
      }
    }
  }
}

export default config
