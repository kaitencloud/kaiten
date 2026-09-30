import { useMutation } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { PageRelease } from '@/api-client';
import {
  deleteReleaseMutation,
  listReleasesQueryKey,
} from '@/api-client/@tanstack/react-query.gen';
import { invalidateReleaseQueries } from '../queries';
import type { Release } from '../types';

export function useDeleteReleaseMutation(
  release: Pick<Release, 'slug' | 'version'>,
) {
  const { t } = useTranslation();
  const { queryClient } = useRouteContext({ from: '__root__' });

  return useMutation({
    ...deleteReleaseMutation(),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: listReleasesQueryKey() });

      const previousReleases = queryClient.getQueryData(listReleasesQueryKey());

      queryClient.setQueryData<PageRelease | undefined>(
        listReleasesQueryKey(),
        (old) => {
          if (!old) {
            return old;
          }

          return {
            ...old,
            items: old.items.filter(
              (currentRelease) => currentRelease.slug !== release.slug,
            ),
          };
        },
      );

      return { previousReleases };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousReleases) {
        queryClient.setQueryData(
          listReleasesQueryKey(),
          context.previousReleases,
        );
      }
      toast.error(t('Features.Releases.deleteError'));
    },
    onSuccess: async () => {
      toast.success(t('Features.Releases.Success.releaseDeleted'));
      await invalidateReleaseQueries(queryClient, release.slug ?? undefined);
    },
    onSettled: async () => {
      await invalidateReleaseQueries(queryClient, release.slug ?? undefined);
    },
  });
}
