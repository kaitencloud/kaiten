import { screen, waitFor } from '@testing-library/react';
import type { AnchorHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { handleGetBillingCapabilities } from '@/api-client/msw.gen';
import { ActionAccordion } from '@/components/ui/action-accordion';
import {
  renderWithClient,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { buildLicense } from '../../../../../e2e/app/_support/fixtures/build-license';
import { billingCapabilitiesProfiles } from '../../../../../e2e/app/_support/model/billing-capabilities';
import type { LicenseGroup, LicenseWithInstances } from '../../types';
import { LicenseListItem } from '../license-list-item';

const getAuthToken = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
    to,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { params?: unknown; to: string }) => (
    <a {...props} data-params={JSON.stringify(params)} href={to}>
      {children}
    </a>
  ),
}));

useBillingTexts();

const head = {
  ...buildLicense({
    description: 'Pro',
    familyId: 'family-pro',
    id: 'license-pro-2',
    lifecycleState: 'PUBLISHED',
    name: 'Pro',
    slug: 'pro-v2',
    type: 'PAID',
    version: '2',
  }),
  nbInstances: 0,
} as LicenseWithInstances;

const group = (overrides: Partial<LicenseGroup> = {}): LicenseGroup => ({
  defaultLicense: undefined,
  familyId: 'family-pro',
  familySlug: 'pro',
  headLicense: head,
  isPublic: false,
  licenseName: 'Pro',
  licenses: [head],
  ...overrides,
});

const renderItem = (value: LicenseGroup) =>
  renderWithClient(
    <ActionAccordion>
      <LicenseListItem group={value} />
    </ActionAccordion>,
  );

beforeEach(() => {
  getAuthToken.mockResolvedValue(sessionToken(['read:licenses', 'write:licenses']));
  server.use(handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stack() }));
});

describe('a family in the list of licenses', () => {
  it('says it is public, and offers the switch to take it out, where billing is on', async () => {
    renderItem(group({ isPublic: true }));

    expect(await screen.findByText('Public')).toBeInTheDocument();
    expect(await screen.findByRole('switch', { name: 'List Pro in the public catalogue' })).toBeChecked();
  });

  it('says nothing of the catalogue for a family that is private, and offers the switch to list it', async () => {
    renderItem(group());

    expect(await screen.findByRole('switch', { name: 'List Pro in the public catalogue' })).not.toBeChecked();
    expect(screen.queryByText('Public')).toBeNull();
  });

  it('says nothing of the catalogue where billing is off, whatever the family says', async () => {
    server.use(handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.disabled() }));
    renderItem(group({ isPublic: true }));

    await screen.findByRole('link', { name: /New Version/ });
    await waitFor(() => expect(screen.queryByText('Public')).toBeNull());
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('keeps the way to a new version beside the switch', async () => {
    renderItem(group());

    expect(await screen.findByRole('link', { name: /New Version/ })).toHaveAttribute(
      'href',
      '/licenses/versions/$licenseSlug',
    );
  });
});
