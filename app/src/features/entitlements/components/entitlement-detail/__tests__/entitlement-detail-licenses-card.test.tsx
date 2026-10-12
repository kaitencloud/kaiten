import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vite-plus/test';
import type { License, LicenseEntitlement } from '@/api-client';
import type {
  LicenseAggregate,
  LinkedLicenseMapping,
} from '../entitlement-detail-context';
import { EntitlementDetailLicensesCard } from '../entitlement-detail-licenses-card';

// Links render as anchors with their params filled in, so hrefs can be
// asserted without a router.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    className,
    params,
    to,
  }: {
    children: ReactNode;
    className?: string;
    params?: Record<string, string>;
    to: string;
  }) => (
    <a
      className={className}
      href={to.replace(
        /\$(\w+)/g,
        (_match, name: string) => params?.[name] ?? `$${name}`,
      )}
    >
      {children}
    </a>
  ),
}));

// English defaults; plural keys resolve from `count`; {{tokens}} interpolate.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      defaultValue?: string | Record<string, unknown>,
      options?: Record<string, unknown>,
    ) => {
      const values = typeof defaultValue === 'object' ? defaultValue : options;
      const count =
        typeof values?.count === 'number' ? values.count : undefined;
      const translations: Record<string, string> = {
        'Pages.Entitlements.Detail.Overview.licenses.instances_one': 'instance',
        'Pages.Entitlements.Detail.Overview.licenses.instances_other':
          'instances',
        'Pages.Entitlements.Detail.Overview.licenses.more_one':
          'Show {{count}} more license',
        'Pages.Entitlements.Detail.Overview.licenses.more_other':
          'Show {{count}} more licenses',
        'Pages.Licenses.Mutation.Form.Types.Community': 'Community',
        'Pages.Licenses.Mutation.Form.Types.Paid': 'Paid',
      };
      const template =
        (count === undefined
          ? translations[key]
          : translations[`${key}_${count === 1 ? 'one' : 'other'}`]) ??
        (typeof defaultValue === 'string' ? defaultValue : key);

      return values
        ? template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) =>
            name in values ? String(values[name]) : `{{${name}}}`,
          )
        : template;
    },
  }),
}));

const aggregate = (
  overrides: Partial<LicenseAggregate> &
    Pick<LicenseAggregate, 'licenseName' | 'licenseSlug'>,
): LicenseAggregate => ({
  instances: 0,
  licenseType: 'COMMUNITY',
  maxRatio: null,
  nearLimitCount: 0,
  overLimitCount: 0,
  threshold: null,
  totalUsage: 0,
  updatedAt: '2026-09-01T00:00:00.000Z',
  version: '1',
  ...overrides,
});

const mapping = (
  licenseSlug: string,
  grant: LicenseEntitlement['value'],
): LinkedLicenseMapping => ({
  license: { name: licenseSlug, slug: licenseSlug } as License & {
    slug: string;
  },
  mapping: {
    entitlementType: grant.type === 'number' ? 'NUMBER' : 'BOOLEAN',
    licenseSlug,
    value: grant,
  } as LicenseEntitlement,
});

const renderCard = (
  props: Partial<Parameters<typeof EntitlementDetailLicensesCard>[0]> = {},
) =>
  render(
    <EntitlementDetailLicensesCard
      isLoading={false}
      isUsageLoading={false}
      licenseAggregates={[]}
      linkedLicenseMappings={[]}
      locale="en-US"
      {...props}
    />,
  );

describe('EntitlementDetailLicensesCard', () => {
  it('lists each license with what it grants and links to it', () => {
    renderCard({
      licenseAggregates: [
        aggregate({
          instances: 3,
          licenseName: 'Beta Tester',
          licenseSlug: 'beta-tester',
          licenseType: 'PAID',
        }),
        aggregate({
          instances: 1,
          licenseName: 'Community',
          licenseSlug: 'community',
        }),
      ],
      linkedLicenseMappings: [
        mapping('beta-tester', { type: 'number', value: 1000 }),
        mapping('community', { type: 'boolean', value: true }),
      ],
    });

    expect(screen.getByRole('link', { name: 'Beta Tester' })).toHaveAttribute(
      'href',
      '/catalog/licenses/beta-tester',
    );
    expect(screen.getByText('Paid · v1 · 3 instances')).toBeInTheDocument();
    expect(screen.getByText('1,000')).toBeInTheDocument();
    expect(screen.getByText('Community · v1 · 1 instance')).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
  });

  it('shows the licenses in trouble first, and the rest on demand', () => {
    const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

    renderCard({
      licenseAggregates: names.map((name) =>
        aggregate({
          licenseName: name,
          licenseSlug: name,
          nearLimitCount: name === 'f' ? 2 : 0,
          overLimitCount: name === 'g' ? 1 : 0,
        }),
      ),
    });

    const links = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('/catalog/licenses/'));

    expect(links.map((link) => link.textContent)).toEqual([
      'g',
      'f',
      'a',
      'b',
      'c',
    ]);
    expect(screen.getByText('Over limit: 1')).toBeInTheDocument();
    expect(screen.getByText('Near limit: 2')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Show 2 more licenses' }),
    );

    expect(
      screen
        .getAllByRole('link')
        .filter((link) => link.getAttribute('href')?.startsWith('/catalog/licenses/')),
    ).toHaveLength(7);
    expect(
      screen.queryByRole('button', { name: /more licenses/ }),
    ).not.toBeInTheDocument();
  });

  it('says so while loading and when no license grants the entitlement', () => {
    const { unmount } = renderCard({ isLoading: true });

    expect(screen.getByText('Loading...')).toBeInTheDocument();

    unmount();
    renderCard();

    expect(
      screen.getByText('No license grants this entitlement yet.'),
    ).toBeInTheDocument();
  });
});
