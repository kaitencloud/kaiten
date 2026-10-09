/**
 * The scopes of the GraphQL documents of billing, as the API's gate pins them
 * (`TestClientDocumentsRequireTheseScopes`,
 * `api/internal/infrastructure/http/graphql/scope_test.go`). The gate reads the scopes
 * of the whole document once and refuses all of it, with a 403 `Auth.MissingScope` that
 * names the first one missing, before any field is resolved: a document that selected
 * `Instance.billing` would be refused whole to a caller without `read:billing`, which is
 * why the console asks for it in a document of its own, and only of a session that holds
 * the scope. The mocks refuse the same way, for the caller whose token says which scopes
 * it carries; a token that says nothing is let through, since the console then gives it
 * the benefit of the doubt too.
 *
 * Only these two documents are here. The others of the console are served to every
 * session: the sessions the specs sign in as hold the scopes of what they test, which is
 * not always every scope of a page's documents (the layout of an instance loads the
 * customers, whatever the tab), and refusing them would test the persona and not the
 * screen. `graphqlOperationHandler` (`src/e2e/msw/handler-factory.ts`) applies the table.
 */
export const GRAPHQL_DOCUMENT_SCOPES: Readonly<
  Record<string, readonly string[]>
> = {
  GetInstancesBilling: ['read:instances', 'read:billing'],
  GetLicensesWithPrices: ['read:licenses'],
};
