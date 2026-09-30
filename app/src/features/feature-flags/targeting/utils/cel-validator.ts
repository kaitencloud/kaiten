/*
 * There is deliberately no client-side CEL validation here any more.
 *
 * There used to be: a cel-js parse whose raw token-sequence errors
 * ("Expecting: one of these possible Token sequences…") were shown verbatim
 * under the form field, on top of the editor's own markers — a third CEL
 * implementation free to disagree with the server about what a rule is.
 * The verdict now comes from the server lint, wired as an async field
 * validator where the rule field is declared, with the same words the save
 * refuses with. cel-js remains in the app only as the formatter's parser.
 */

/**
 * Validate that distribution percentages sum to 100
 * @param distribution - Record of variant names to percentages
 * @returns true if sum is approximately 100, false otherwise
 */
export function validateDistribution(
  distribution: Record<string, number>,
): boolean {
  const sum = Object.values(distribution).reduce((acc, val) => acc + val, 0);
  return Math.abs(sum - 100) < 0.01; // Allow for floating point errors
}
