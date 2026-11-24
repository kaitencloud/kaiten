/**
 * Which columns a person hid on a table, kept in this browser's local storage,
 * as the console keeps its other display choices (the side navigation, the
 * theme, the language). One entry per organization and table:
 * `kaiten:table-columns:<organization>:<table>`, holding `{ "hidden": [ids] }`.
 *
 * The hidden columns are stored, not the shown ones: a column the table gains
 * later was never hidden, so it shows. An id the table no longer has is kept
 * but matches nothing. Storage is a convenience: a browser that refuses it
 * (blocked, full, private mode) or holds something unreadable gives the
 * default, every column shown, and never breaks the table.
 */

export const TABLE_COLUMNS_STORAGE_PREFIX = 'kaiten:table-columns';

export function tableColumnsStorageKey(
  organizationId: string,
  tableId: string,
): string {
  return [
    TABLE_COLUMNS_STORAGE_PREFIX,
    encodeURIComponent(organizationId),
    encodeURIComponent(tableId),
  ].join(':');
}

const NOTHING_HIDDEN: readonly string[] = [];

function parseHiddenColumns(raw: string | null): readonly string[] {
  if (!raw) {
    return NOTHING_HIDDEN;
  }
  const parsed: unknown = JSON.parse(raw);
  const hidden = (parsed as { hidden?: unknown } | null)?.hidden;

  if (!Array.isArray(hidden)) {
    return NOTHING_HIDDEN;
  }

  return [
    ...new Set(hidden.filter((id): id is string => typeof id === 'string')),
  ];
}

/** The column ids hidden under `key`, or none when nothing usable is stored. */
export function readHiddenColumns(key: string): readonly string[] {
  try {
    return parseHiddenColumns(window.localStorage.getItem(key));
  } catch {
    return NOTHING_HIDDEN;
  }
}

/** Keeps the hidden column ids under `key`; none removes the entry. */
export function writeHiddenColumns(key: string, hidden: readonly string[]) {
  try {
    if (hidden.length === 0) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify({ hidden }));
  } catch {
    // A storage that refuses the write keeps the choice for this page only.
  }
}
