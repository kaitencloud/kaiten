import { listComponentsQueryKey } from '@/api-client/@tanstack/react-query.gen';
import { allComponentsOptions } from '@/lib/api/all-pages-query-options';

export const componentsBaseQueryKey = listComponentsQueryKey();

export const componentsQueryOptions = allComponentsOptions();
