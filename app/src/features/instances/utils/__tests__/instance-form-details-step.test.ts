import { describe, expect, it } from 'vite-plus/test';
import {
  instanceCreationDetailsFormSchema,
  instanceDetailsFormSchema,
} from '../instance-form.shared';

// The first step of the creation form asks for the slug too, which the name fills in as it is
// typed. Next opens the next step only when the whole step is valid, so that an error on the slug
// is stopped at its field and not carried to a last step that cannot be sent.
const details = {
  customerId: 'customer-1',
  description: '',
  name: 'Acme Production',
  slug: 'acme-production',
};

describe('instanceCreationDetailsFormSchema', () => {
  it('passes with a valid slug, or none', () => {
    expect(instanceCreationDetailsFormSchema.safeParse(details).success).toBe(
      true,
    );
    expect(
      instanceCreationDetailsFormSchema.safeParse({ ...details, slug: '' })
        .success,
    ).toBe(true);
  });

  it('fails with a slug of more than 100 characters, which a name of 101 gives', () => {
    expect(
      instanceCreationDetailsFormSchema.safeParse({
        ...details,
        name: 'a'.repeat(101),
        slug: 'a'.repeat(101),
      }).success,
    ).toBe(false);
  });

  it.each(['-acme', 'Acme', 'acme-', 'acme_x', 'ac me'])(
    'fails with the slug %s',
    (slug) => {
      expect(
        instanceCreationDetailsFormSchema.safeParse({ ...details, slug })
          .success,
      ).toBe(false);
    },
  );

  it('leaves the edit of an existing instance alone, which has no slug to check', () => {
    expect(
      instanceDetailsFormSchema.safeParse({
        customerId: details.customerId,
        description: details.description,
        name: details.name,
      }).success,
    ).toBe(true);
  });
});
