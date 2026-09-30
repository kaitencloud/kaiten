import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/errors';
import { deleteAttioSettings, upsertAttioSettings } from '../attio.api';
import { invalidateAttioQueries } from '../queries';
import type { AttioConnectorSettings } from '../types';

export function useAttioSettingsMutations() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const invalidate = () => invalidateAttioQueries(queryClient);

  const connect = useMutation({
    mutationFn: (settings: AttioConnectorSettings) =>
      upsertAttioSettings(settings),
    onSuccess: () => {
      toast.success(t('Pages.Integrations.Connectors.Toast.connected'));
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
    onSettled: () => invalidate(),
  });

  const updateMapping = useMutation({
    mutationFn: (settings: AttioConnectorSettings) =>
      upsertAttioSettings(settings),
    onSuccess: () => {
      toast.success(t('Pages.Integrations.Connectors.Toast.mappingUpdated'));
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
    onSettled: () => invalidate(),
  });

  const disconnect = useMutation({
    mutationFn: () => deleteAttioSettings(),
    onSuccess: () => {
      toast.success(t('Pages.Integrations.Connectors.Toast.disconnected'));
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
    onSettled: () => invalidate(),
  });

  return { connect, updateMapping, disconnect };
}
