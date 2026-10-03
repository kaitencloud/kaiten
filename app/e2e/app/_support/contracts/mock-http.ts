/** Error mapping and GraphQL descriptions used by MSW handlers. */
export type GraphQLVariables = Record<string, unknown> | undefined;
export type GraphQLRequestBody = {
  operationName?: string;
  query?: string;
  variables?: GraphQLVariables;
};
export const extractOperationName = (query: string): string | null =>
  query.match(/\b(query|mutation)\s+([a-zA-Z0-9_]+)/)?.[2] ?? null;

export const statusForError = (error: unknown, fallback = 400): number => {
  const explicitStatus = (error as { httpStatus?: number } | undefined)
    ?.httpStatus;
  if (typeof explicitStatus === 'number') return explicitStatus;
  if (error instanceof Error && error.message.includes('not found')) return 404;
  return fallback;
};

export const messageForError = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;
