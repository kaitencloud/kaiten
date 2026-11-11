import type { Model } from '@/api-client';
import type { CellRef, RateCardVersion } from '../rate-card-model';

type TargetInput = {
  cell: CellRef | null;
  models: readonly Model[];
  versions: readonly RateCardVersion[];
};

export type CellPanelTarget =
  | { isOpen: false; shouldLeave: boolean }
  | {
      isOpen: true;
      shouldLeave: false;
      cell: CellRef;
      /** The model of the cell; null for the wildcard row. */
      model: Model | null;
      version: RateCardVersion;
    };

/**
 * What the panel is to show, from the cell the URL names. A cell whose version
 * is a column of the view and whose model is in the catalogue opens it; any
 * other leads back to the rate card, not to a panel left blank.
 */
export function useCellPanelTarget({
  cell,
  models,
  versions,
}: TargetInput): CellPanelTarget {
  if (cell === null) {
    return { isOpen: false, shouldLeave: false };
  }
  const version = versions.find((item) => item.slug === cell.licenseSlug);
  const model =
    cell.modelSlug === null
      ? null
      : models.find((item) => item.slug === cell.modelSlug);
  if (!version || model === undefined) {
    return { isOpen: false, shouldLeave: true };
  }

  return { isOpen: true, shouldLeave: false, cell, model, version };
}
