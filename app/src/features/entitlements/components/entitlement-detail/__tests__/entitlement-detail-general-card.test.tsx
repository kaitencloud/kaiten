import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vite-plus/test';
import type { Entitlement } from '@/api-client';
import { EntitlementDetailGeneralCard } from '../entitlement-detail-general-card';

// Resolve keys to their English default value and interpolate {{tokens}} so the
// unit/calculation strings can be asserted on directly. Keys called without a
// default (type/aggregation displays) fall through to the raw key, which
// these tests never assert on.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      defaultValue?: string,
      options?: Record<string, unknown>,
    ) => {
      if (typeof defaultValue !== 'string') {
        return key;
      }

      if (!options) {
        return defaultValue;
      }

      return defaultValue.replace(/\{\{(\w+)\}\}/g, (_match, name) =>
        name in options ? String(options[name]) : `{{${name}}}`,
      );
    },
  }),
}));

const numberEntitlement: Entitlement = {
  aggregationMethod: 'SUM',
  createdAt: '2026-03-01T09:00:00.000Z',
  description: 'Monthly API requests included in the customer plan.',
  entitlementGroups: [],
  icon: 'lucide:zap',
  id: 'entitlement-api-requests',
  name: 'API Requests',
  slug: 'api-requests',
  type: 'NUMBER',
  updatedAt: '2026-03-01T09:00:00.000Z',
  userFacing: true,
  displayOrder: 10,
  unitSingular: 'request',
  unitPlural: 'requests',
  saleUnitSingular: 'pack',
  saleUnitPlural: 'packs',
  saleUnitFactor: 3,
};

const renderCard = (entitlement: Entitlement, onEdit = vi.fn()) => {
  render(
    <EntitlementDetailGeneralCard
      entitlement={entitlement}
      entitlementAudit={entitlement}
      locale="en-US"
      onEdit={onEdit}
    />,
  );
  return { onEdit };
};

describe('EntitlementDetailGeneralCard', () => {
  it('renders the visibility flag and unit summary for a NUMBER entitlement', () => {
    renderCard(numberEntitlement);

    expect(screen.getByText('User facing')).toBeInTheDocument();
    expect(screen.getByText('Visible')).toBeInTheDocument();
    expect(screen.getByText('request / requests')).toBeInTheDocument();
    expect(screen.getByText('pack / packs')).toBeInTheDocument();
    expect(screen.getByText('1 pack = 3 requests')).toBeInTheDocument();
  });

  it('never surfaces the display order on the detail card', () => {
    renderCard(numberEntitlement);

    expect(screen.queryByText('Display order')).not.toBeInTheDocument();
  });

  it('marks a hidden entitlement', () => {
    renderCard({ ...numberEntitlement, userFacing: false });

    expect(screen.getByText('Hidden')).toBeInTheDocument();
    expect(screen.queryByText('Visible')).not.toBeInTheDocument();
  });

  it('shows the base unit but hides sale rows when no sale unit is configured', () => {
    renderCard({
      ...numberEntitlement,
      saleUnitSingular: undefined,
      saleUnitPlural: undefined,
      saleUnitFactor: undefined,
    });

    expect(screen.getByText('request / requests')).toBeInTheDocument();
    expect(screen.queryByText('Sale unit')).not.toBeInTheDocument();
    expect(screen.queryByText('Calculation')).not.toBeInTheDocument();
  });

  it('keeps the calculation row hidden when the sale unit row is hidden', () => {
    renderCard({ ...numberEntitlement, saleUnitPlural: undefined });

    expect(screen.queryByText('Sale unit')).not.toBeInTheDocument();
    expect(screen.queryByText('Calculation')).not.toBeInTheDocument();
    expect(screen.queryByText('1 pack = 3 requests')).not.toBeInTheDocument();
  });

  it('omits the unit rows entirely for non-NUMBER entitlements', () => {
    renderCard({
      aggregationMethod: 'COUNT',
      createdAt: '2026-03-01T09:00:00.000Z',
      description: 'Access to SAML authentication.',
      entitlementGroups: [],
      id: 'entitlement-saml',
      name: 'SAML SSO',
      slug: 'saml-sso',
      type: 'BOOLEAN',
      updatedAt: '2026-03-01T09:00:00.000Z',
      userFacing: false,
    });

    expect(screen.getByText('User facing')).toBeInTheDocument();
    expect(screen.getByText('Hidden')).toBeInTheDocument();
    expect(screen.queryByText('Base unit')).not.toBeInTheDocument();
    expect(screen.queryByText('Sale unit')).not.toBeInTheDocument();
  });

  it('always states how usage resets for a NUMBER entitlement', () => {
    renderCard(numberEntitlement);

    expect(screen.getByText('Usage resets')).toBeInTheDocument();
  });

  it('names the window alignment only once a cadence is configured', () => {
    renderCard(numberEntitlement);

    expect(screen.queryByText('Window aligned on')).not.toBeInTheDocument();

    renderCard({
      ...numberEntitlement,
      resetPeriod: 'MONTH',
      resetAnchor: 'LICENSE_START',
    });

    expect(screen.getByText('Window aligned on')).toBeInTheDocument();
  });

  it('omits the reset rows entirely for a non-numeric entitlement', () => {
    renderCard({
      aggregationMethod: 'COUNT',
      createdAt: '2026-03-01T09:00:00.000Z',
      description: 'Access to SAML authentication.',
      entitlementGroups: [],
      id: 'entitlement-saml',
      name: 'SAML SSO',
      slug: 'saml-sso',
      type: 'BOOLEAN',
      updatedAt: '2026-03-01T09:00:00.000Z',
      userFacing: false,
    });

    expect(screen.queryByText('Usage resets')).not.toBeInTheDocument();
    expect(screen.queryByText('Window aligned on')).not.toBeInTheDocument();
  });

  it('invokes onEdit when the edit button is pressed', () => {
    const { onEdit } = renderCard(numberEntitlement);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});
