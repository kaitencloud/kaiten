import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { testI18n } from '@/__tests__/test-i18n';
import type { License } from '@/api-client';
import { handleGetBillingCapabilities } from '@/api-client/msw.gen';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';
import { billingCapabilitiesProfiles } from '../../../../../e2e/app/_support/model/billing-capabilities';
import { LicenseCommercialCard } from '../commercial';

// A link is only an anchor here: where it leads is what the tests read.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
    search,
    to,
    ...props
  }: {
    children: ReactNode;
    params: { licenseSlug: string };
    search: { mode: string };
    to: string;
  }) => (
    <a
      {...props}
      href={`${to.replace('$licenseSlug', params.licenseSlug)}?mode=${search.mode}`}
    >
      {children}
    </a>
  ),
}));

beforeAll(async () => {
  testI18n.addResourceBundle('en', 'translation', en, true, true);
  testI18n.addResourceBundle('fr', 'translation', fr, true, true);
  await testI18n.changeLanguage('en');
});

afterAll(async () => {
  await testI18n.changeLanguage('en');
});

const license = (overrides: Partial<License> = {}): License =>
  ({
    description: 'Pro',
    id: 'license-pro-v2',
    isDefault: false,
    name: 'Pro',
    pricingType: 'PAID',
    requiresPaymentMethod: true,
    slug: 'pro-v2',
    trialPeriodDays: 14,
    type: 'PAID',
    version: '2',
    ...overrides,
  }) as License;

function renderCard(value: License, { billing = true } = {}) {
  server.use(
    handleGetBillingCapabilities({
      body: billing
        ? billingCapabilitiesProfiles.stack()
        : billingCapabilitiesProfiles.disabled(),
    }),
  );
  const client = new QueryClient();

  return {
    client,
    ...render(<LicenseCommercialCard license={value} />, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    }),
  };
}

describe('LicenseCommercialCard', () => {
  it('says how the version is sold', async () => {
    renderCard(license({ selfServeCtaUrl: 'https://acme.test/contact' }));

    expect(await screen.findByText('Commercial terms')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText('14 days')).toBeInTheDocument();
    expect(screen.getByText('Captured at sign-up')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'https://acme.test/contact' }),
    ).toHaveAttribute('href', 'https://acme.test/contact');
  });

  it('reads a version with no trial and no URL as having none', async () => {
    renderCard(
      license({
        pricingType: 'CUSTOM',
        requiresPaymentMethod: false,
        selfServeCtaUrl: undefined,
        trialPeriodDays: 0,
      }),
    );

    expect(await screen.findByText('No trial')).toBeInTheDocument();
    expect(screen.getByText('Custom')).toBeInTheDocument();
    expect(screen.getByText('Not required')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /^https?:/ }),
    ).not.toBeInTheDocument();
  });

  // The API only takes an http(s) URL, and a link is made of nothing else: what
  // the API sent in any other scheme is shown, and cannot be followed.
  it('does not make a link of a URL that is not http or https', async () => {
    renderCard(license({ selfServeCtaUrl: 'javascript:alert(1)' }));

    expect(await screen.findByText('javascript:alert(1)')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'javascript:alert(1)' }),
    ).not.toBeInTheDocument();
  });

  it('offers the edit, as a link that opens the dialog', async () => {
    renderCard(license());

    expect(await screen.findByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/licenses/pro-v2?mode=configure',
    );
  });

  it('is not there where billing is not', async () => {
    const { client } = renderCard(license(), { billing: false });

    // Billing is read once: the answer has to be in before saying nothing.
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(screen.queryByText('Commercial terms')).not.toBeInTheDocument();
  });
});
