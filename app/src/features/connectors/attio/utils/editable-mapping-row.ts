import type { EditableMappingRow } from '../types';

let rowCounter = 0;

function createRowId() {
  rowCounter += 1;
  return `row_${rowCounter}`;
}

export function createEditableRow(
  sourceField: string | null = null,
  attioSlug: string | null = null,
): EditableMappingRow {
  return { id: createRowId(), sourceField, attioSlug };
}
