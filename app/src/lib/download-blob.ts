/**
 * Saving a file the page holds, or fetches behind a bearer token. An export the
 * API streams has no schema and needs the credential of the session, so a plain
 * `<a href>` cannot fetch it: the request goes through the generated client,
 * which authenticates it and wraps a failure in an `ApiError`, and the browser
 * is handed the blob.
 */

// The SDK types the body of an export by what the contract declares for it (a
// string, for a CSV), whatever `parseAs` says it is read as. Read as a blob it is
// one at run time; the string is accepted as well, so that the call types as it
// is generated.
type BlobResult = { data: Blob | string; response?: Response };

/** Hands `blob` to the browser to save as `filename`. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.append(link);

  try {
    link.click();
  } finally {
    link.remove();
    // After the click has been handled: some browsers read the URL late.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** The file name a `Content-Disposition` header proposes, when it does. */
export function filenameFromResponse(
  response: Response | undefined,
): string | undefined {
  const header = response?.headers.get('Content-Disposition');
  if (!header) {
    return undefined;
  }
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      // Fall through to the plain form.
    }
  }

  return /filename="?([^";]+)"?/i.exec(header)?.[1]?.trim();
}

/**
 * Runs `request`, a call of the generated SDK made with `parseAs: 'blob'` and
 * `throwOnError: true`, and saves its body as `fallbackFilename`, or under the
 * name the response proposes. A failure is thrown as the SDK throws it.
 *
 * ```ts
 * await downloadBlob(
 *   () => exportInvoices({ parseAs: 'blob', query, throwOnError: true }),
 *   'invoices.csv',
 * );
 * ```
 *
 * The browser reads `Content-Disposition` only when the API is on the origin of
 * the console, or its CORS policy exposes the header: otherwise the fallback
 * name stands.
 */
export async function downloadBlob(
  request: () => Promise<BlobResult>,
  fallbackFilename: string,
): Promise<void> {
  const { data, response } = await request();

  saveBlob(
    typeof data === 'string' ? new Blob([data]) : data,
    filenameFromResponse(response) ?? fallbackFilename,
  );
}
