/**
 * The UUID a mock gives a record that its world names by slug or by a plain id. A usage report
 * names the instance, the entitlement and the license it was made for by UUID, which the
 * contract checks, while the mocked records carry no such id of their own: the id of a record in
 * a report is derived from what names it, the same each time and distinct for each.
 */
export function stableUuid(seed: string): string {
  const hex = (salt: number) => {
    let hash = 0x811c9dc5 ^ salt;
    for (const char of seed) {
      hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  };
  const digits = [hex(1), hex(2), hex(3), hex(4)].join('');

  return [
    digits.slice(0, 8),
    digits.slice(8, 12),
    `4${digits.slice(13, 16)}`,
    `8${digits.slice(17, 20)}`,
    digits.slice(20, 32),
  ].join('-');
}
