import { describe, expect, it } from 'vite-plus/test';
import { zPublishableKeyDraft } from '@/api-client/zod.gen';
import { MAX_ORIGINS } from '../../utils/origins';
import {
  initialPublishableKeyFormValues,
  publishableKeyFormSchema,
  publishableKeyFormValuesToCreateBody,
  publishableKeyFormValuesToUpdateBody,
  publishableKeyToFormValues,
} from '../publishable-key.schema';
import { readPublishableKeysSearch } from '../publishable-keys-search.schema';

const messagesOf = (values: { label: string; origins: string }) =>
  publishableKeyFormSchema
    .safeParse(values)
    .error?.issues.map(({ message }) => message) ?? [];

describe('publishableKeyFormSchema', () => {
  it('takes a label and no origin at all', () => {
    expect(
      publishableKeyFormSchema.safeParse({ label: 'pricing', origins: '' })
        .success,
    ).toBe(true);
  });

  it('asks for a label that is more than blanks', () => {
    expect(messagesOf({ label: '   ', origins: '' })).toEqual([
      'Pages.Integrations.PublishableKeys.Form.Errors.label',
    ]);
    expect(
      publishableKeyFormSchema.safeParse(initialPublishableKeyFormValues)
        .success,
    ).toBe(false);
  });

  it('holds the label to the length the contract does', () => {
    // Read from the contract, which the schema reads from too: a change of the bound
    // there moves both.
    const longest = zPublishableKeyDraft.shape.label.maxLength ?? 0;

    expect(longest).toBeGreaterThan(0);
    expect(messagesOf({ label: 'x'.repeat(longest + 1), origins: '' })).toEqual([
      'Pages.Integrations.PublishableKeys.Form.Errors.labelTooLong',
    ]);
    expect(
      publishableKeyFormSchema.safeParse({
        label: 'x'.repeat(longest),
        origins: '',
      }).success,
    ).toBe(true);
  });

  it('refuses an origin the API would refuse', () => {
    expect(
      messagesOf({ label: 'pricing', origins: 'http://shop.acme.test' }),
    ).toEqual(['Pages.Integrations.PublishableKeys.Form.Errors.origins']);
    expect(
      messagesOf({ label: 'pricing', origins: 'https://shop.acme.test/' }),
    ).toEqual(['Pages.Integrations.PublishableKeys.Form.Errors.origins']);
  });

  it('refuses the fifty-first origin, and takes fifty', () => {
    const origins = (count: number) =>
      Array.from({ length: count }, (_, index) => `https://s${index}.acme.test`)
        .join('\n');

    expect(
      publishableKeyFormSchema.safeParse({
        label: 'pricing',
        origins: origins(MAX_ORIGINS),
      }).success,
    ).toBe(true);
    expect(
      messagesOf({ label: 'pricing', origins: origins(MAX_ORIGINS + 1) }),
    ).toEqual(['Pages.Integrations.PublishableKeys.Form.Errors.tooManyOrigins']);
  });

  it('counts an origin typed twice once', () => {
    const twice = Array.from(
      { length: MAX_ORIGINS + 1 },
      () => 'https://a.acme.test',
    ).join('\n');

    expect(
      publishableKeyFormSchema.safeParse({ label: 'pricing', origins: twice })
        .success,
    ).toBe(true);
  });
});

describe('the bodies of the form', () => {
  const values = {
    label: '  pricing page ',
    origins: 'http://localhost:5173\nhttps://Shop.acme.test',
  };

  it('issues a key with the label trimmed and the origins as the API keeps them', () => {
    expect(publishableKeyFormValuesToCreateBody(values)).toEqual({
      allowedOrigins: ['http://localhost:5173', 'https://shop.acme.test'],
      label: 'pricing page',
    });
    expect(
      zPublishableKeyDraft.safeParse(publishableKeyFormValuesToCreateBody(values))
        .success,
    ).toBe(true);
  });

  it('changes a key by saying both members, so that the request is the same however often it is sent', () => {
    expect(publishableKeyFormValuesToUpdateBody(values)).toEqual(
      publishableKeyFormValuesToCreateBody(values),
    );
  });

  it('sends no origin when the field is empty, which allows no browser origin', () => {
    expect(
      publishableKeyFormValuesToCreateBody({ label: 'pricing', origins: '' }),
    ).toEqual({ allowedOrigins: [], label: 'pricing' });
  });

  it('opens a key with its origins one to a line', () => {
    expect(
      publishableKeyToFormValues({
        allowedOrigins: ['https://a.acme.test', 'https://b.acme.test'],
        label: 'pricing',
      }),
    ).toEqual({
      label: 'pricing',
      origins: 'https://a.acme.test\nhttps://b.acme.test',
    });
  });
});

describe('readPublishableKeysSearch', () => {
  it('keeps includeRevoked when it is on', () => {
    expect(readPublishableKeysSearch({ includeRevoked: true })).toEqual({
      includeRevoked: true,
    });
  });

  it.each([
    [{}],
    [{ includeRevoked: false }],
    [{ includeRevoked: 'yes' }],
    [{ includeRevoked: 1 }],
    [{ other: true }],
  ])('starts on the list without the revoked keys for %j', (search) => {
    expect(readPublishableKeysSearch(search)).toEqual({});
  });
});
