# Architecture

How the console is built. The rules themselves are in [AI_CONTEXT.md](../AI_CONTEXT.md); these pages explain the shape of the code and where things go.

- [overview.md](./overview.md): the stack, how the code is organised, and how routing, data, state, forms and tests fit together.
- [folder-structure.md](./folder-structure.md): each folder of `app/` and `app/src`, what belongs in it, and the dependency matrix between layers.
- [functionals.md](./functionals.md): the `src/functionals/` layer, its conventions and its components.
- [data-flow.md](./data-flow.md): how data is read and written end to end.
- [api-generation.md](./api-generation.md): how the REST and GraphQL clients are generated, and how to use them.
- [api-contract.md](./api-contract.md): where the API contract that the app consumes lives.
