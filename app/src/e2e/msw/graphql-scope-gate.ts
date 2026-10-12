import { type GrantedScopes, hasScope } from '@/lib/scope-claims';
import { GRAPHQL_DOCUMENT_SCOPES } from '../../../e2e/app/_support/contracts/graphql-scopes';

/**
 * The first scope of the document `operationName` that the caller lacks, or
 * nothing when it holds them all, when its token does not say which it carries (the
 * console gives such a token the benefit of the doubt, and so do the mocks), or
 * when the document is not gated.
 */
export function findMissingDocumentScope(
  operationName: string,
  granted: GrantedScopes,
): string | undefined {
  return GRAPHQL_DOCUMENT_SCOPES[operationName]?.find(
    (required) => !hasScope(granted, required),
  );
}
