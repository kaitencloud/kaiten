import { HttpResponse, http } from 'msw/http';

const row = (
  id: string,
  name: string,
  output: string,
  pricing: Record<string, unknown>,
  architecture: Record<string, unknown> = {},
) => ({
  architecture: {
    input_modalities: ['text'],
    output_modalities: [output],
    tokenizer: 'Other',
    ...architecture,
  },
  canonical_slug: id,
  description: `Synthetic ${name} of the mock catalogue.`,
  id,
  name,
  pricing,
});

/**
 * A made-up public catalogue in the shape OpenRouter answers: no real model, no
 * real price. It covers what the import screens tell apart: text models with
 * fixed prices, with and without cache rates; an image model priced per request;
 * an embedding model; a model whose price is decided per call, which the import
 * holds for review; and the source of a model the mock world already has.
 */
export const SYNTHETIC_OPENROUTER_CATALOGUE = [
  row('synthetic/atlas-large', 'Synthetic: Atlas Large', 'text', {
    completion: '0.000012',
    input_cache_read: '0.0000004',
    input_cache_write: '0.000005',
    prompt: '0.000004',
  }),
  row('synthetic/atlas-mini', 'Synthetic: Atlas Mini', 'text', {
    completion: '0.0000008',
    prompt: '0.0000002',
  }),
  row('synthetic/lumen-image', 'Synthetic: Lumen Image', 'image', {
    completion: '0',
    prompt: '0',
    request: '0.04',
  }),
  row('synthetic/echo-embed', 'Synthetic: Echo Embed', 'embeddings', {
    completion: '0',
    prompt: '0.00000002',
  }),
  row(
    'synthetic/router-auto',
    'Synthetic: Auto Router',
    'text',
    { completion: '-1', prompt: '-1' },
    { tokenizer: 'Router' },
  ),
  row('claude-sonnet-4-5-20250929', 'Synthetic: Claude Sonnet 4.5', 'text', {
    completion: '0.000015',
    input_cache_read: '0.0000003',
    input_cache_write: '0.00000375',
    prompt: '0.000003',
  }),
];

/**
 * The model import reads OpenRouter's public catalogue from the browser. In the
 * mock API it is answered here, so that neither `dev:mock` nor a test reaches
 * the real openrouter.ai.
 */
export const openRouterHandlers = () => [
  http.get('https://openrouter.ai/api/v1/models', () =>
    HttpResponse.json(
      {
        data: SYNTHETIC_OPENROUTER_CATALOGUE,
        links: { next: null },
        total_count: SYNTHETIC_OPENROUTER_CATALOGUE.length,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    ),
  ),
];
