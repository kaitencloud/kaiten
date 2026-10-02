import type { Meta, StoryObj } from '@storybook/react-vite';
import { handleGetCustomer } from '@/api-client/msw.gen';
import { graphqlOperationHandler } from '@/e2e/msw/handler-factory';
import {
  storyCustomers,
  storyInstanceRows,
} from '@/test-fixtures/storybook-fixtures';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { CustomerDetailPageContent } from '../customer-detail/customer-detail-page-content';

const customer = storyCustomers[0];

const meta = {
  title: 'Features/Customers/CustomerDetailPageContent',
  component: CustomerDetailPageContent,
  parameters: {
    layout: 'fullscreen',
    msw: {
      handlers: [
        handleGetCustomer({ body: customer }),
        graphqlOperationHandler({
          GetInstancesWithRelations: () => ({
            instances: { hasMore: false, items: storyInstanceRows, nextCursor: null },
          }),
        }),
      ],
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof CustomerDetailPageContent>;

export default meta;
type Story = StoryObj<typeof CustomerDetailPageContent>;

export const Overview: Story = {
  render: () => (
    <StorybookRouter
      initialEntries={[`/customers/${customer.slug}`]}
      routePath="/customers/$customerSlug"
    >
      <CustomerDetailPageContent customerSlug={customer.slug!} />
    </StorybookRouter>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Customer detail page content with header actions, general details card and linked instances card.',
      },
    },
  },
};
