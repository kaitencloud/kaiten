import { describe, expect, it } from 'vite-plus/test';
import { deriveOrganizationId } from '../external-id';

describe('deriveOrganizationId', () => {
  it('matches the id the API derives for the same Clerk organization', async () => {
    // Taken from a live deployment: the instance onboarding renamed for this
    // Clerk organization carries exactly this slug. A mismatch here means every
    // platform flag evaluates for an organization that does not exist.
    expect(await deriveOrganizationId('org_3JKpp4TPWQDLjnrcUCDnwL73jE4')).toBe(
      '87052d9c-88de-5900-80fe-f8a05abda186',
    );
  });
});
