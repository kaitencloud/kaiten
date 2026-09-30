# @kaitencloud/graphql-schema

The GraphQL schema of the [Kaiten](https://kaiten.sh) API, in one `schema.graphqls`. The
GraphQL endpoint is read-only: it serves queries over the same model as the REST API,
whose contract is [`@kaitencloud/openapi`](https://www.npmjs.com/package/@kaitencloud/openapi).
The schema lives in the [kaiten repository](https://github.com/kaitencloud/kaiten) and is
published each time it changes.

## Get the file

```sh
npm install @kaitencloud/graphql-schema
```

The schema is then `node_modules/@kaitencloud/graphql-schema/schema.graphqls`. Without a
project, extract it from the package:

```sh
npm pack @kaitencloud/graphql-schema@latest
tar -xzOf kaitencloud-graphql-schema-*.tgz package/schema.graphqls > schema.graphqls
```

## Reading it

The file holds the schema as the server loads it: a base schema, then one
`extend type Query` block per module. Tools that read SDL take it as it is, such as
graphql-js's `buildSchema` or GraphQL Code Generator. To print it as one sorted SDL:

```js
import { readFileSync } from "node:fs";
import { buildSchema, lexicographicSortSchema, printSchema } from "graphql";

const sdl = readFileSync("node_modules/@kaitencloud/graphql-schema/schema.graphqls", "utf8");
console.log(printSchema(lexicographicSortSchema(buildSchema(sdl))));
```

## Versions

Each version is decided by comparing the schema with the one published before it, with
graphql-js's `findSchemaChanges`:

- **major**: a breaking or dangerous change, such as a removed type, field or argument, a
  new required argument, a value added to an enum, a type added to a union or a changed
  default value;
- **minor**: any other change to the schema, such as a new type or field, or a new
  optional argument or input field;
- **patch**: the same schema in a different file, such as a description, a comment, the
  order of the fragments or this README.

To hear about a breaking change before it reaches you, pin a major:
`"@kaitencloud/graphql-schema": "^1"`.

## License

Apache-2.0. See `LICENSE` and `NOTICE`. The license does not grant permission to use
the Kaiten name or logos: see the
[trademark policy](https://github.com/kaitencloud/kaiten/blob/main/TRADEMARKS.md).
