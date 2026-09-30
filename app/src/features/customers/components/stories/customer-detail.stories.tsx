import type { Meta, StoryObj } from '@storybook/react-vite';
import type { QueryClient } from '@tanstack/react-query';
import { customerQueryOptions } from '../../queries/customer-query-options';
import { instancesWithRelationsQueryKey } from '@/domains/customer-management';
import {
  storyCustomers,
  storyInstanceRows,
} from '@/test-fixtures/p0-storybook-fixtures';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { CustomerDetailPageContent } from '../customer-detail/customer-detail-page-content';

const customer = storyCustomers[0];

const seedCustomerDetailQueries = (queryClient: QueryClient) => {
  queryClient.setQueryData(
    customerQueryOptions(customer.slug!).queryKey,
    customer,
  );
  queryClient.setQueryData(instancesWithRelationsQueryKey(), {
    instances: { items: storyInstanceRows },
  });
};

const meta = {
  title: 'Features/Customers/CustomerDetailPageContent',
  component: CustomerDetailPageContent,
  parameters: {
    layout: 'fullscreen',
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
      seed={seedCustomerDetailQueries}
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
