const TRAILING_NUMBER = /^(.*?)(\d+)$/;

/**
 * The name to offer for the next version of a family: the highest trailing
 * number among the existing names, plus one ("v1" → "v2", "2024.3" →
 * "2024.4"), keeping its zero padding. Names without a trailing number ("GA",
 * "Legacy") suggest nothing, and the field stays empty for the user to fill.
 * The base version's own name is never proposed: submitting it as-is would
 * create a second version under the same name.
 */
export function suggestNextVersionName(
  existingNames: Array<string | null | undefined>,
): string {
  const taken = new Set(existingNames.map((name) => name?.trim() ?? ''));
  let best: { number: number; prefix: string; width: number } | undefined;

  for (const name of taken) {
    const match = TRAILING_NUMBER.exec(name);

    if (!match) {
      continue;
    }

    const number = Number(match[2]);

    if (!best || number > best.number) {
      best = { number, prefix: match[1], width: match[2].length };
    }
  }

  if (!best) {
    return '';
  }

  let next = best.number + 1;
  let candidate = `${best.prefix}${String(next).padStart(best.width, '0')}`;

  while (taken.has(candidate)) {
    next += 1;
    candidate = `${best.prefix}${String(next).padStart(best.width, '0')}`;
  }

  return candidate;
}
