import type { Meta, StoryObj } from '@storybook/react-vite';
import { HttpResponse } from 'msw';
import { expect, fn, screen, userEvent, within } from 'storybook/test';
import type { Instance, InstanceBilling } from '@/api-client';
import {
  handleDeprecateLicensePrice,
  handleGetInstanceBilling,
  handleGetInstances,
} from '@/api-client/msw.gen';
import {
  buildPrice,
  buildSubscription,
} from '@/test-fixtures/storybook-billing-fixtures';
import { onePage } from '@/test-fixtures/storybook-handlers';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { DeprecatePriceDialog } from '../prices/deprecate-price-dialog';

const meta = {
  title: 'Features/Licenses/DeprecatePrice',
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const PRICE = buildPrice({
  billingPeriod: 'MONTHLY',
  displayLabel: 'Enterprise, monthly',
  id: 'price-enterprise-monthly',
  unitAmountDecimal: '49900',
});

const instance = (slug: string, name: string) => ({ id: `id-${slug}`, name, slug }) as Instance;

const movingTo = (slug: string, name: string, customer: string, effectiveAt: string): InstanceBilling =>
  buildSubscription({
    anchorAt: '2027-02-01T00:00:00.000Z',
    customerName: customer,
    instanceName: name,
    instanceSlug: slug,
    scheduledChange: { effectiveAt, price: PRICE, scheduledAt: '2027-03-01T00:00:00.000Z' },
  });

const SUBSCRIPTIONS: Record<string, InstanceBilling> = {
  'acme-production': movingTo('acme-production', 'Acme Production', 'Acme Corp', '2027-04-01T00:00:00.000Z'),
  'globex-staging': movingTo('globex-staging', 'Globex Staging', 'Globex', '2027-03-20T00:00:00.000Z'),
  'initech-prod': buildSubscription({ anchorAt: '2027-02-01T00:00:00.000Z', instanceSlug: 'initech-prod' }),
};

// A price that a plan change is scheduled to move to cannot be deprecated until the
// change is cancelled. The refusal is the API's own words; the instances concerned
// are found, each with the way to its Billing tab.
export const RefusedBecauseAPlanChangeTargetsIt: Story = {
  parameters: {
    msw: {
      handlers: [
        handleDeprecateLicensePrice(() =>
          HttpResponse.json(
            {
              code: 'DeprecateLicensePrice.PlanChangeTarget',
              detail: 'a plan change is scheduled to this price: cancel it first',
              status: 409,
            },
            { status: 409 },
          ),
        ),
        handleGetInstances(
          onePage([
            instance('globex-staging', 'Globex Staging'),
            instance('initech-prod', 'Initech Production'),
            instance('acme-production', 'Acme Production'),
          ]),
        ),
        handleGetInstanceBilling(({ params }) =>
          HttpResponse.json(SUBSCRIPTIONS[String(params.instanceSlug)]),
        ),
      ],
    },
  },
  render: () => (
    <StorybookRouter>
      <DeprecatePriceDialog
        entitlementBySlug={new Map()}
        licenseSlug="enterprise-v3"
        onClose={fn()}
        price={PRICE}
      />
    </StorybookRouter>
  ),
  play: async () => {
    const dialog = await screen.findByRole('alertdialog');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Deprecate' }));

    await expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'a plan change is scheduled to this price: cancel it first',
    );
    const instances = await within(dialog).findByTestId('plan-change-instances');
    const links = within(instances).getAllByRole('link');

    await expect(links.map((link) => link.textContent)).toEqual([
      'Acme Production',
      'Globex Staging',
    ]);
    await expect(links[0]).toHaveAttribute(
      'href',
      '/customers/instances/acme-production/billing',
    );
  },
};
