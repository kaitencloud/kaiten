import { getCustomerOptions } from '@/api-client/@tanstack/react-query.gen';

export const customerQueryOptions = (customerSlug: string) =>
  getCustomerOptions({ path: { customerSlug } });
