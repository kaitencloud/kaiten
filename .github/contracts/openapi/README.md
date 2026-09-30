# @kaitencloud/openapi

The OpenAPI 3.1 contract of the [Kaiten](https://kaiten.sh) API, in one `openapi.yaml`:
its REST operations, with their parameters, request bodies, responses and errors. The
contract is generated from the API's Go handlers, in the
[kaiten repository](https://github.com/kaitencloud/kaiten), and published each time it
changes.

## Get the file

```sh
npm install @kaitencloud/openapi
```

The contract is then `node_modules/@kaitencloud/openapi/openapi.yaml`. Without a
project, extract it from the package:

```sh
npm pack @kaitencloud/openapi@latest
tar -xzOf kaitencloud-openapi-*.tgz package/openapi.yaml > openapi.yaml
```

## Versions

Each version is decided by comparing the contract with the one published before it,
with [oasdiff](https://github.com/oasdiff/oasdiff):

- **major**: a change that can reject a client that worked before, such as a removed
  operation, field or parameter, a new required property or a new constraint;
- **minor**: any other change to the API, such as a new operation or an optional field;
- **patch**: the same API in a different file, such as a description, an example or this
  README.

To hear about a breaking change before it reaches you, pin a major:
`"@kaitencloud/openapi": "^1"`.

## License

Apache-2.0. See `LICENSE` and `NOTICE`. The license does not grant permission to use
the Kaiten name or logos: see the
[trademark policy](https://github.com/kaitencloud/kaiten/blob/main/TRADEMARKS.md).
