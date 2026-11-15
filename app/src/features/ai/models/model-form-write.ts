import { getModel, type Model, type ModelWritable } from '@/api-client';
import {
  FRESH_READ_OPTIONS,
  isSameField,
  mergeChangedFields,
} from '@/lib/api/fresh-write';
import { modelToOpenRouterWritable } from './openrouter-sync';
import { OpenRouterError } from './openrouter-catalogue';

export async function freshModelFormBody(
  openedModel: Model,
  edited: ModelWritable,
  opened: ModelWritable,
): Promise<ModelWritable> {
  const { data: freshModel } = await getModel({
    ...FRESH_READ_OPTIONS,
    path: { modelSlug: openedModel.slug },
    throwOnError: true,
  });
  if (freshModel.id !== openedModel.id || freshModel.slug !== openedModel.slug)
    throw new OpenRouterError('modelRecreated');
  const fresh = modelToOpenRouterWritable(freshModel);
  for (const key of new Set([...Object.keys(opened), ...Object.keys(edited)])) {
    if (key === 'vendorCosts') continue;
    const field = key as keyof ModelWritable;
    if (
      !isSameField(edited[field], opened[field]) &&
      !isSameField(fresh[field], opened[field])
    )
      throw new OpenRouterError('localChanged');
  }
  const openedCosts = opened.vendorCosts ?? { currency: 'USD' as const };
  const editedCosts = edited.vendorCosts ?? { currency: 'USD' as const };
  const freshCosts = fresh.vendorCosts ?? { currency: 'USD' as const };
  for (const key of new Set([
    ...Object.keys(openedCosts),
    ...Object.keys(editedCosts),
  ])) {
    const field = key as keyof typeof openedCosts;
    if (
      !isSameField(editedCosts[field], openedCosts[field]) &&
      !isSameField(freshCosts[field], openedCosts[field])
    )
      throw new OpenRouterError('localChanged');
  }
  return {
    ...mergeChangedFields({ edited, opened, fresh }),
    // A cost editor changes dimensions, not the entire concurrently updated vector.
    vendorCosts: mergeChangedFields({
      edited: edited.vendorCosts ?? { currency: 'USD' as const },
      opened: opened.vendorCosts ?? { currency: 'USD' as const },
      fresh: fresh.vendorCosts ?? { currency: 'USD' as const },
    }),
  };
}
