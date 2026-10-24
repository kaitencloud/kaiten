import { describe, expect, it } from 'vite-plus/test';
import { zPublishableKeyDraft } from '@/api-client/zod.gen';
import { MAX_ORIGINS } from '../../utils/origins';
import {
  publishableKeyFormValuesToCreateBody,
  publishableKeyFormValuesToUpdateBody,
} from '../publishable-key-bodies';
import {
  initialPublishableKeyFormValues,
  type PublishableKeyFormValues,
  publishableKeyFormSchema,
  publishableKeyToFormValues,
} from '../publishable-key.schema';
import { readPublishableKeysSearch } from '../publishable-keys-search.schema';

const ERRORS = 'Pages.Integrations.PublishableKeys.Form.Errors';

/** A key with nothing but a label and origins: the part of the form that is not Turnstile. */
const valuesOf = (
  values: Partial<PublishableKeyFormValues> & { label: string; origins: string },
): PublishableKeyFormValues => ({
  ...initialPublishableKeyFormValues,
  ...values,
});

const issuesOf = (values: PublishableKeyFormValues) =>
  publishableKeyFormSchema
    .safeParse(values)
    .error?.issues.map(({ message, path }) => ({
      message,
      path: path.join('.'),
    })) ?? [];

const messagesOf = (
  values: Partial<PublishableKeyFormValues> & { label: string; origins: string },
) => issuesOf(valuesOf(values)).map(({ message }) => message);

describe('publishableKeyFormSchema', () => {
  it('takes a label and no origin at all', () => {
    expect(
      publishableKeyFormSchema.safeParse(
        valuesOf({ label: 'pricing', origins: '' }),
      ).success,
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
      publishableKeyFormSchema.safeParse(
        valuesOf({ label: 'x'.repeat(longest), origins: '' }),
      ).success,
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
      publishableKeyFormSchema.safeParse(
        valuesOf({ label: 'pricing', origins: origins(MAX_ORIGINS) }),
      ).success,
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
      publishableKeyFormSchema.safeParse(
        valuesOf({ label: 'pricing', origins: twice }),
      ).success,
    ).toBe(true);
  });
});

describe('publishableKeyFormSchema, Turnstile', () => {
  const base = { label: 'pricing', origins: '' };

  it('takes a key that has no Turnstile value and does not open the anonymous checkout', () => {
    expect(messagesOf(base)).toEqual([]);
  });

  it('asks for a site key and a secret before the anonymous checkout is on', () => {
    expect(issuesOf(valuesOf({ ...base, anonymousCheckout: true }))).toEqual([
      { message: `${ERRORS}.turnstileRequired`, path: 'anonymousCheckout' },
    ]);
    expect(
      messagesOf({
        ...base,
        anonymousCheckout: true,
        turnstileSiteKey: '0x4AAAAAAA',
      }),
    ).toEqual([`${ERRORS}.turnstileRequired`]);
    expect(
      messagesOf({
        ...base,
        anonymousCheckout: true,
        turnstileSecret: 'secret',
      }),
    ).toEqual([`${ERRORS}.turnstileRequired`]);
    expect(
      messagesOf({
        ...base,
        anonymousCheckout: true,
        turnstileSecret: 'secret',
        turnstileSiteKey: '0x4AAAAAAA',
      }),
    ).toEqual([]);
  });

  it('counts blanks as nothing', () => {
    expect(
      messagesOf({
        ...base,
        anonymousCheckout: true,
        turnstileSecret: '   ',
        turnstileSiteKey: '   ',
      }),
    ).toEqual([`${ERRORS}.turnstileRequired`]);
  });

  it('takes the secret that is stored as the secret of the key, until it is removed', () => {
    const stored = {
      ...base,
      anonymousCheckout: true,
      turnstileSecretAction: 'keep' as const,
      turnstileSecretOnFile: true,
      turnstileSiteKey: '0x4AAAAAAA',
    };

    expect(messagesOf(stored)).toEqual([]);
    expect(
      messagesOf({ ...stored, turnstileSecretAction: 'remove' }),
    ).toEqual([`${ERRORS}.turnstileSecretRemoved`]);
    expect(
      messagesOf({
        ...stored,
        anonymousCheckout: false,
        turnstileSecretAction: 'remove',
      }),
    ).toEqual([]);
  });

  it('asks for the new secret once Replace was chosen, and says it once', () => {
    expect(
      issuesOf(
        valuesOf({
          ...base,
          anonymousCheckout: true,
          turnstileSecretAction: 'set',
          turnstileSecretOnFile: true,
          turnstileSiteKey: '0x4AAAAAAA',
        }),
      ),
    ).toEqual([
      { message: `${ERRORS}.turnstileSecretRequired`, path: 'turnstileSecret' },
    ]);
  });

  it('holds the site key and the secret to the contract', () => {
    const shortest = 1;
    const longest = 255;
    const siteKey = zPublishableKeyDraft.shape.turnstileSiteKey;
    const secret = zPublishableKeyDraft.shape.turnstileSecret;

    expect(siteKey.safeParse('a'.repeat(shortest)).success).toBe(true);
    expect(secret.safeParse('x'.repeat(longest + 1)).success).toBe(false);
    expect(messagesOf({ ...base, turnstileSiteKey: 'a'.repeat(longest) })).toEqual(
      [],
    );
    expect(
      messagesOf({ ...base, turnstileSiteKey: 'a'.repeat(longest + 1) }),
    ).toEqual([`${ERRORS}.turnstileSiteKey`]);
    expect(messagesOf({ ...base, turnstileSiteKey: 'not a key!' })).toEqual([
      `${ERRORS}.turnstileSiteKey`,
    ]);
    expect(
      messagesOf({ ...base, turnstileSecret: 'x'.repeat(longest) }),
    ).toEqual([]);
    expect(
      messagesOf({ ...base, turnstileSecret: 'x'.repeat(longest + 1) }),
    ).toEqual([`${ERRORS}.turnstileSecretTooLong`]);
  });
});

describe('the bodies of the form', () => {
  const values = valuesOf({
    label: '  pricing page ',
    origins: 'http://localhost:5173\nhttps://Shop.acme.test',
  });
  const opened = valuesOf({ label: 'pricing', origins: '' });

  it('issues a key with the label trimmed and the origins as the API keeps them', () => {
    expect(publishableKeyFormValuesToCreateBody(values)).toEqual({
      allowedOrigins: ['http://localhost:5173', 'https://shop.acme.test'],
      label: 'pricing page',
    });
    expect(
      zPublishableKeyDraft.safeParse(
        publishableKeyFormValuesToCreateBody(values),
      ).success,
    ).toBe(true);
  });

  it('issues a key that opens the anonymous checkout with its site key and its secret, trimmed', () => {
    const body = publishableKeyFormValuesToCreateBody({
      ...values,
      anonymousCheckout: true,
      turnstileSecret: ' 1x0000000000000000000000000000000AA ',
      turnstileSiteKey: ' 1x00000000000000000000AA ',
    });

    expect(body).toEqual({
      allowedOrigins: ['http://localhost:5173', 'https://shop.acme.test'],
      anonymousCheckout: true,
      label: 'pricing page',
      turnstileSecret: '1x0000000000000000000000000000000AA',
      turnstileSiteKey: '1x00000000000000000000AA',
    });
    expect(zPublishableKeyDraft.safeParse(body).success).toBe(true);
  });

  it('changes a key by saying both members, so that the request is the same however often it is sent', () => {
    expect(publishableKeyFormValuesToUpdateBody(values, opened)).toEqual(
      publishableKeyFormValuesToCreateBody(values),
    );
    expect(publishableKeyFormValuesToUpdateBody(values, values)).toEqual(
      publishableKeyFormValuesToCreateBody(values),
    );
  });

  it('sends no origin when the field is empty, which allows no browser origin', () => {
    expect(
      publishableKeyFormValuesToCreateBody(
        valuesOf({ label: 'pricing', origins: '' }),
      ),
    ).toEqual({ allowedOrigins: [], label: 'pricing' });
  });

  describe('of a key that has a secret stored', () => {
    const stored = publishableKeyToFormValues({
      allowedOrigins: ['https://shop.acme.test'],
      anonymousCheckout: true,
      label: 'pricing',
      turnstileSecretConfigured: true,
      turnstileSiteKey: '0x4AAAAAAA',
    });

    it('says nothing of Turnstile when only the label changed, so that the stored secret stays', () => {
      const body = publishableKeyFormValuesToUpdateBody(
        { ...stored, label: 'pricing page' },
        stored,
      );

      expect(body).toEqual({
        allowedOrigins: ['https://shop.acme.test'],
        label: 'pricing page',
      });
      expect(Object.keys(body)).not.toContain('turnstileSiteKey');
      expect(Object.keys(body)).not.toContain('turnstileSecret');
      expect(Object.keys(body)).not.toContain('anonymousCheckout');
    });

    it('sends the new secret when it is replaced, and nothing else of Turnstile', () => {
      expect(
        publishableKeyFormValuesToUpdateBody(
          {
            ...stored,
            turnstileSecret: ' new-secret ',
            turnstileSecretAction: 'set',
          },
          stored,
        ),
      ).toEqual({
        allowedOrigins: ['https://shop.acme.test'],
        label: 'pricing',
        turnstileSecret: 'new-secret',
      });
    });

    it('sends an empty secret to delete it, once the checkout is off', () => {
      expect(
        publishableKeyFormValuesToUpdateBody(
          {
            ...stored,
            anonymousCheckout: false,
            turnstileSecretAction: 'remove',
          },
          stored,
        ),
      ).toEqual({
        allowedOrigins: ['https://shop.acme.test'],
        anonymousCheckout: false,
        label: 'pricing',
        turnstileSecret: '',
      });
    });

    it('sends an empty site key to clear it, and a new one to change it', () => {
      expect(
        publishableKeyFormValuesToUpdateBody(
          { ...stored, turnstileSiteKey: '' },
          stored,
        ),
      ).toMatchObject({ turnstileSiteKey: '' });
      expect(
        publishableKeyFormValuesToUpdateBody(
          { ...stored, turnstileSiteKey: '0x4BBBBBBB' },
          stored,
        ),
      ).toMatchObject({ turnstileSiteKey: '0x4BBBBBBB' });
    });

    it('opens with the secret kept, empty, and never with a value', () => {
      expect(stored).toMatchObject({
        turnstileSecret: '',
        turnstileSecretAction: 'keep',
        turnstileSecretOnFile: true,
        turnstileSiteKey: '0x4AAAAAAA',
      });
    });
  });

  it('switches the anonymous checkout on with the two values, and only then names the member', () => {
    expect(
      publishableKeyFormValuesToUpdateBody(
        {
          ...opened,
          anonymousCheckout: true,
          turnstileSecret: 'secret',
          turnstileSiteKey: 'site',
        },
        opened,
      ),
    ).toEqual({
      allowedOrigins: [],
      anonymousCheckout: true,
      label: 'pricing',
      turnstileSecret: 'secret',
      turnstileSiteKey: 'site',
    });
  });

  it('opens a key with its origins one to a line', () => {
    expect(
      publishableKeyToFormValues({
        allowedOrigins: ['https://a.acme.test', 'https://b.acme.test'],
        anonymousCheckout: false,
        label: 'pricing',
        turnstileSecretConfigured: false,
        turnstileSiteKey: null,
      }),
    ).toEqual({
      anonymousCheckout: false,
      label: 'pricing',
      origins: 'https://a.acme.test\nhttps://b.acme.test',
      turnstileSecret: '',
      turnstileSecretAction: 'set',
      turnstileSecretOnFile: false,
      turnstileSiteKey: '',
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
