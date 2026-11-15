import { HttpResponse } from 'msw/http';
import { describe, expect, it } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Model, ModelWritable } from '@/api-client';
import { handleGetModel, handleUpdateModel } from '@/api-client/msw.gen';
import { addModelExternalId, archiveModel, suggestModelFor } from '../model-writes';

const model = (slug: string, overrides: Partial<Model> = {}): Model => ({
  createdAt: '2026-09-02T10:00:00.000Z',
  externalIds: [],
  id: `model-${slug}`,
  modality: 'TEXT',
  name: slug,
  slug,
  status: 'ACTIVE',
  updatedAt: '2026-09-02T10:00:00.000Z',
  vendor: 'Vendor',
  ...overrides,
});

const CATALOGUE = [
  model('gpt-5'),
  model('gpt-5-mini'),
  model('claude-sonnet-4-5', { externalIds: ['claude-sonnet-4-5-20250929'] }),
  model('gemini-2-5-flash', { externalIds: ['gemini-2.5-flash'] }),
  model('whisper-large-v3', { status: 'ARCHIVED' }),
];

describe('suggestModelFor', () => {
  it('suggests the model whose slug the name starts with, the longest one', () => {
    expect(suggestModelFor('gpt-5-mini-2025-08-07', CATALOGUE)?.slug).toBe('gpt-5-mini');
    expect(suggestModelFor('gpt-5-2025-08-07', CATALOGUE)?.slug).toBe('gpt-5');
  });

  it('drops a vendor prefix and reads punctuation as a dash', () => {
    expect(suggestModelFor('openai/gpt-5-mini', CATALOGUE)?.slug).toBe('gpt-5-mini');
    expect(suggestModelFor('google/gemini-2.5-flash-002', CATALOGUE)?.slug).toBe('gemini-2-5-flash');
    expect(suggestModelFor('Claude_Sonnet_4_5@20251101', CATALOGUE)?.slug).toBe('claude-sonnet-4-5');
  });

  it('suggests nothing when no model is an obvious match', () => {
    expect(suggestModelFor('mistral-large-2411', CATALOGUE)).toBeNull();
    // A name that only shares a beginning with a slug is not that model.
    expect(suggestModelFor('gpt-50', CATALOGUE)).toBeNull();
    expect(suggestModelFor('', CATALOGUE)).toBeNull();
  });

  it('never suggests an archived model, nor one of two tied models', () => {
    expect(suggestModelFor('whisper-large-v3-turbo', CATALOGUE)).toBeNull();
    const tied = [model('a', { externalIds: ['llama-4'] }), model('b', { externalIds: ['llama.4'] })];
    expect(suggestModelFor('llama-4-scout', tied)).toBeNull();
  });
});

describe('addModelExternalId', () => {
  it('reads the model again and appends the id to what it holds now', async () => {
    const stored = model('gpt-5-mini', { description: 'edited meanwhile', externalIds: ['added-elsewhere'] });
    const sent: ModelWritable[] = [];
    server.use(
      handleGetModel(() => HttpResponse.json(stored)),
      handleUpdateModel(async ({ request }) => {
        const body = (await request.json()) as ModelWritable;
        sent.push(body);
        return HttpResponse.json({ ...stored, ...body });
      }),
    );

    const updated = await addModelExternalId('gpt-5-mini', 'gpt-5-mini-2025-08-07');

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      description: 'edited meanwhile',
      externalIds: ['added-elsewhere', 'gpt-5-mini-2025-08-07'],
      modality: 'TEXT',
      slug: 'gpt-5-mini',
    });
    expect(updated.externalIds).toContain('gpt-5-mini-2025-08-07');
  });

  it('writes nothing when the model already has the id', async () => {
    let writes = 0;
    server.use(
      handleGetModel(() => HttpResponse.json(model('gpt-5', { externalIds: ['known'] }))),
      handleUpdateModel(() => {
        writes += 1;
        return HttpResponse.json(model('gpt-5'));
      }),
    );

    await addModelExternalId('gpt-5', 'known');

    expect(writes).toBe(0);
  });

  it('lets the refusal of the API through: the id belongs to another model', async () => {
    server.use(
      handleGetModel(() => HttpResponse.json(model('gpt-5'))),
      handleUpdateModel(() =>
        HttpResponse.json(
          { code: 'UpdateModel.ExternalIdConflict', detail: 'conflict', status: 409, title: 'Conflict', type: 'about:blank' },
          { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    );

    await expect(addModelExternalId('gpt-5', 'taken')).rejects.toMatchObject({ status: 409 });
  });
});

describe('archiveModel', () => {
  it('sets the status on what the model holds now, and keeps the rest', async () => {
    const stored = model('gpt-5', { description: 'kept', externalIds: ['gpt-5-2025-08-07'] });
    const sent: ModelWritable[] = [];
    server.use(
      handleGetModel(() => HttpResponse.json(stored)),
      handleUpdateModel(async ({ request }) => {
        const body = (await request.json()) as ModelWritable;
        sent.push(body);
        return HttpResponse.json({ ...stored, ...body });
      }),
    );

    const archived = await archiveModel('gpt-5');

    expect(sent).toEqual([expect.objectContaining({ description: 'kept', externalIds: ['gpt-5-2025-08-07'], status: 'ARCHIVED' })]);
    expect(archived.status).toBe('ARCHIVED');
  });

  it('writes nothing for a model that is archived already', async () => {
    let writes = 0;
    server.use(
      handleGetModel(() => HttpResponse.json(model('gpt-5', { status: 'ARCHIVED' }))),
      handleUpdateModel(() => {
        writes += 1;
        return HttpResponse.json(model('gpt-5'));
      }),
    );

    await archiveModel('gpt-5');

    expect(writes).toBe(0);
  });
});
