import { getReleaseBySlugOptions } from '@/api-client/@tanstack/react-query.gen';
import { allReleasesOptions } from '@/lib/api/all-pages-query-options';

export const releasesQueryOptions = allReleasesOptions();

export const releaseQueryOptions = (releaseSlug: string) =>
  getReleaseBySlugOptions({
    path: { releaseSlug },
  });
