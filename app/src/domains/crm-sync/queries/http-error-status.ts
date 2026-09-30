export function getHttpErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const { status, response } = error as {
    status?: unknown;
    response?: { status?: unknown };
  };

  if (typeof status === 'number') {
    return status;
  }

  return typeof response?.status === 'number' ? response.status : undefined;
}
