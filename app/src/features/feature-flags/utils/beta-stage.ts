/**
 * A beta is a convention over a flag's metadata: `stage` names where the flag
 * is in its release, and `title` and `description` are the copy a product shows
 * its customers in a list of betas. Kaiten returns the metadata with every
 * evaluation and reads none of it: the targeting rules decide who gets the
 * feature. The console's own Beta features page lists the flags of its platform
 * source at `public_beta` and `open_beta` (`features/settings/beta-features`).
 */
export const BETA_STAGES = [
  'private_beta',
  'public_beta',
  'open_beta',
] as const;

export type BetaStage = (typeof BETA_STAGES)[number];

/** The metadata keys of the copy shown to customers. */
export type BetaCopyKey = 'title' | 'description';

type Metadata = Record<string, unknown>;

/** The stage a flag's metadata names, or null: a value outside the list is not a stage. */
export function betaStageOf(
  metadata: Metadata | null | undefined,
): BetaStage | null {
  return BETA_STAGES.find((stage) => stage === metadata?.stage) ?? null;
}

/** A customer may see the beta in a list at these stages, so its copy matters. */
export function isListedBetaStage(stage: BetaStage | null): boolean {
  return stage === 'public_beta' || stage === 'open_beta';
}

/**
 * The metadata with its stage set, or with the key removed for a flag that is
 * not a beta. Every other key is kept, the customer copy included: a flag that
 * goes back to a beta finds it again.
 */
export function withBetaStage(
  metadata: Metadata,
  stage: BetaStage | null,
): Metadata {
  const { stage: _stage, ...rest } = metadata;
  return stage ? { ...rest, stage } : rest;
}

/** The copy shown as typed; a key that is not a string reads as empty. */
export function betaCopyOf(metadata: Metadata, key: BetaCopyKey): string {
  const value = metadata[key];
  return typeof value === 'string' ? value : '';
}

/** The metadata with one piece of copy set, or with its key removed when emptied. */
export function withBetaCopy(
  metadata: Metadata,
  key: BetaCopyKey,
  value: string,
): Metadata {
  const { [key]: _previous, ...rest } = metadata;
  return value.trim() === '' ? rest : { ...rest, [key]: value };
}
