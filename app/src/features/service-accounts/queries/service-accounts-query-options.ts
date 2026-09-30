import {
  getServiceAccountOptions,
  getServiceAccountsOptions,
} from '@/api-client/@tanstack/react-query.gen';

export const serviceAccountsQueryOptions = getServiceAccountsOptions();

export const serviceAccountQueryOptions = (serviceAccountSlug: string) =>
  getServiceAccountOptions({ path: { serviceAccountSlug } });
