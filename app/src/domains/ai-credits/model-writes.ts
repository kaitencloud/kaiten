import {
  getModel,
  type Model,
  type ModelWritable,
  updateModel,
} from '@/api-client';
import { FRESH_READ_OPTIONS } from '@/lib/api/fresh-write';

/**
 * The writes of a model made outside its form, each on a fresh read: teaching
 * the catalogue a name an integration sends (the name becomes an external id
 * of a model, so that calls sent under it resolve to that model and are priced
 * by its rules), and archiving a model.
 */

const normalise = (name: string) =>
  (name.toLowerCase().split('/').pop() ?? '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * The catalogue model a name most likely means, or null when none is obvious.
 * Deliberately small: the vendor prefix (`openai/…`) is dropped, punctuation
 * is read as a dash, and a model is a candidate when the name is its slug or
 * one of its external ids followed by a suffix (`gpt-5-mini-2025-08-07` for
 * `gpt-5-mini`). The longest such name wins; two models tied on it give no
 * suggestion, and an archived model is never suggested since it is not priced.
 */
export function suggestModelFor(
  sent: string,
  models: readonly Model[],
): Model | null {
  const name = normalise(sent);
  if (!name) {
    return null;
  }
  let best: { length: number; models: Set<Model> } = {
    length: 0,
    models: new Set(),
  };
  for (const model of models) {
    if (model.status === 'ARCHIVED') {
      continue;
    }
    for (const known of [model.slug, ...(model.externalIds ?? [])]) {
      const candidate = normalise(known);
      if (
        !candidate ||
        (name !== candidate && !name.startsWith(`${candidate}-`))
      ) {
        continue;
      }
      if (candidate.length > best.length) {
        best = { length: candidate.length, models: new Set([model]) };
      } else if (candidate.length === best.length) {
        best.models.add(model);
      }
    }
  }

  return best.models.size === 1 ? ([...best.models][0] ?? null) : null;
}

/** The model as the API takes it back: what a PUT replaces it with. */
function writableOf(model: Model): ModelWritable {
  return {
    description: model.description,
    externalIds: [...(model.externalIds ?? [])],
    metadata: model.metadata,
    modality: model.modality,
    name: model.name,
    slug: model.slug,
    status: model.status,
    vendor: model.vendor,
    vendorCosts: model.vendorCosts,
  };
}

/**
 * Writes a model from what it holds now. The API replaces a model as a whole,
 * so it is read again from the API (not from a cache) and `change` is applied
 * to that: an edit made meanwhile elsewhere is not sent back undone. `change`
 * returning null writes nothing.
 */
async function writeOnFreshModel(
  modelSlug: string,
  change: (fresh: ModelWritable) => ModelWritable | null,
): Promise<Model> {
  const path = { modelSlug };
  const { data: fresh } = await getModel({
    ...FRESH_READ_OPTIONS,
    path,
    throwOnError: true,
  });
  const body = change(writableOf(fresh));
  if (body === null) {
    return fresh;
  }
  const { data } = await updateModel({ body, path, throwOnError: true });

  return data;
}

/** Appends an external id to a model. An id the model already has writes nothing. */
export function addModelExternalId(
  modelSlug: string,
  externalId: string,
): Promise<Model> {
  return writeOnFreshModel(modelSlug, (fresh) =>
    fresh.externalIds?.includes(externalId)
      ? null
      : { ...fresh, externalIds: [...(fresh.externalIds ?? []), externalId] },
  );
}

/**
 * Archives a model: it authorizes no usage from then on, wildcards included,
 * and its rules stay where they are. Reversible, by setting its status again.
 */
export function archiveModel(modelSlug: string): Promise<Model> {
  return writeOnFreshModel(modelSlug, (fresh) =>
    fresh.status === 'ARCHIVED' ? null : { ...fresh, status: 'ARCHIVED' },
  );
}
