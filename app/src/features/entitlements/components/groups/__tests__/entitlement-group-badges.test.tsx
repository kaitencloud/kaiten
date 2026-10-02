import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';
import { EntitlementGroupBadges } from '../entitlement-group-badges';

describe('EntitlementGroupBadges', () => {
  it('renders visible badges and collapses the remaining count', () => {
    render(
      <EntitlementGroupBadges
        groups={[
          { name: 'Usage', slug: 'usage' },
          { name: 'Security', slug: 'security' },
          { name: 'Billing', slug: 'billing' },
          { name: 'Provisioning', slug: 'provisioning' },
        ]}
      />,
    );

    expect(screen.getByText('Usage')).toBeInTheDocument();
    expect(screen.getByText('Security')).toBeInTheDocument();
    expect(screen.getByText('Billing')).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(screen.queryByText('Provisioning')).not.toBeInTheDocument();
  });
});
