import type { ReactNode } from 'react';
import { formatDate, formatNumber } from '@/lib/format-date';
import { extractEnumOptions, inferUiType } from './json-schema';
import type { MetadataFieldDescriptor } from './types';

export const METADATA_EMPTY_VALUE = '—';

/**
 * Render one metadata value the way its JSON Schema says it should read:
 * a boolean as a check, a number through the locale formatter, a date parsed,
 * an enum through its declared label rather than its stored value.
 *
 * Shared by every surface that shows metadata — table cells, detail rows —
 * so a field renders identically wherever the reader meets it. The UI type is
 * inferred from the schema (`inferUiType`), never passed in by the caller.
 */
export function renderMetadataValue(
  field: MetadataFieldDescriptor,
  value: unknown,
): ReactNode {
  if (value === null || value === undefined || value === '') {
    return METADATA_EMPTY_VALUE;
  }

  switch (inferUiType(field.jsonSchema)) {
    case 'boolean':
      return value ? '✓' : METADATA_EMPTY_VALUE;

    case 'number':
      return typeof value === 'number' ? formatNumber(value) : String(value);

    case 'date':
      // Keep the formatting trivial — pages/locales decide later. We only
      // guarantee a parseable round-trip.
      try {
        return formatDate(String(value));
      } catch {
        return String(value);
      }

    case 'enum': {
      const option = extractEnumOptions(field.jsonSchema).find(
        (opt) => opt.value === value,
      );
      return option?.label ?? String(value);
    }

    case 'enum_list': {
      if (!Array.isArray(value)) return String(value);
      const options = extractEnumOptions(field.jsonSchema);
      return value
        .map((entry) => {
          const option = options.find((opt) => opt.value === entry);
          return option?.label ?? String(entry);
        })
        .join(', ');
    }

    // 'unsupported' — an object or array-of-object the form models as raw
    // JSON. Stringify rather than render "[object Object]".
    default:
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
}
