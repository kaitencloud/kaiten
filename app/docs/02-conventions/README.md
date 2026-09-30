# Conventions

The conventions of the console (`app/`). The architecture rules that a command checks
are in [AI_CONTEXT.md](../AI_CONTEXT.md); these pages cover how to write the code
inside that structure.

| Page | Read it when |
| --- | --- |
| [Code style](./code-style.md) | You write any code: tooling, names, rendering, file size, imports and exports, spacing. |
| [Error handling](./error-handling.md) | A request can fail: how an error becomes a message, where it is shown, optimistic deletes. |
| [Query key invalidation](./query-key-invalidation.md) | A mutation changes data that a screen shows: query keys, invalidation helpers, deletes. |
| [Internationalization](./i18n.md) | You add or change text that the user sees: translation files, keys, parity. |
| [Git workflow](./git-workflow.md) | You start a branch, write a commit or open a pull request. |
