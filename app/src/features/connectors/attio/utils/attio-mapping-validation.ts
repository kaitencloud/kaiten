import { ATTIO_DEFAULT_MAPPINGS, ATTIO_SOURCE_FIELDS } from '../constants';
import type { EditableMappingRow } from '../types';
import { isValidAttioSlug } from './attio-slug';

export type AttioMappingIssue =
  | 'duplicate-source'
  | 'duplicate-target'
  | 'incomplete'
  | 'invalid-slug';

export type AttioMappingValidation = {
  issuesByRowId: Map<string, AttioMappingIssue[]>;
  isValid: boolean;
};

const targetKey = (object: string, slug: string) =>
  `${object}:${slug.trim().toLowerCase()}`;

function addIssue(
  issuesByRowId: Map<string, AttioMappingIssue[]>,
  rowId: string,
  issue: AttioMappingIssue,
) {
  const issues = issuesByRowId.get(rowId) ?? [];
  if (!issues.includes(issue)) {
    issues.push(issue);
    issuesByRowId.set(rowId, issues);
  }
}

export function validateAttioMappings(
  rows: EditableMappingRow[],
): AttioMappingValidation {
  const issuesByRowId = new Map<string, AttioMappingIssue[]>();
  const sourceOwner = new Map<string, string>();
  const targetOwner = new Map<string, string>();
  const sourceFieldsByKey = new Map(
    ATTIO_SOURCE_FIELDS.map((field) => [field.key, field]),
  );

  for (const mapping of ATTIO_DEFAULT_MAPPINGS) {
    targetOwner.set(targetKey(mapping.object, mapping.defaultSlug), 'default');
  }

  for (const row of rows) {
    const sourceField = row.sourceField?.trim() ?? '';
    const attioSlug = row.attioSlug?.trim() ?? '';

    if (!sourceField && !attioSlug) {
      continue;
    }
    if (!sourceField || !attioSlug) {
      addIssue(issuesByRowId, row.id, 'incomplete');
      continue;
    }
    if (!isValidAttioSlug(attioSlug)) {
      addIssue(issuesByRowId, row.id, 'invalid-slug');
    }

    const previousSourceOwner = sourceOwner.get(sourceField);
    if (previousSourceOwner) {
      addIssue(issuesByRowId, row.id, 'duplicate-source');
      addIssue(issuesByRowId, previousSourceOwner, 'duplicate-source');
    } else {
      sourceOwner.set(sourceField, row.id);
    }

    const source = sourceFieldsByKey.get(sourceField);
    if (!source || !isValidAttioSlug(attioSlug)) {
      continue;
    }

    const key = targetKey(source.object, attioSlug);
    const previousTargetOwner = targetOwner.get(key);
    if (previousTargetOwner) {
      addIssue(issuesByRowId, row.id, 'duplicate-target');
      if (previousTargetOwner !== 'default') {
        addIssue(issuesByRowId, previousTargetOwner, 'duplicate-target');
      }
    } else {
      targetOwner.set(key, row.id);
    }
  }

  return {
    issuesByRowId,
    isValid: issuesByRowId.size === 0,
  };
}
