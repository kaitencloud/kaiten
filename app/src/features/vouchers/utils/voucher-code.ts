/** A code with everything but letters and digits dropped, in upper case: how the API matches one. */
export const normalizeCode = (code: string): string =>
  code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

/** A code of fewer normalized characters than this can be guessed, and needs a bound. */
export const WEAK_CODE_LENGTH = 12;

/**
 * Whether a code chosen by hand is short enough to be guessed and has neither a
 * maximum of redemptions nor an end date: the API refuses it (422
 * `CreateVoucher.WeakCodeUnbounded`). The wizard warns before it does. A code left
 * empty is generated, with eighty random bits, and needs no bound. Both the API and the
 * warning count the normalized characters, hyphens and other separators left out.
 */
export function isWeakUnboundedCode({
  code,
  expiresAt,
  maxRedemptions,
}: {
  code: string;
  expiresAt: string;
  maxRedemptions: number;
}): boolean {
  const typed = code.trim();

  return (
    typed !== '' &&
    normalizeCode(typed).length < WEAK_CODE_LENGTH &&
    Number.isNaN(maxRedemptions) &&
    expiresAt === ''
  );
}
