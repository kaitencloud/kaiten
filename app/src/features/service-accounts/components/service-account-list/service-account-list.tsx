import { useNavigate } from '@tanstack/react-router';
import type { TFunction } from 'i18next';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { GradientButton } from '@/components/gradient-button';
import {
  type FilterFieldDefinition,
  FilterToolbarQuickAccessFilters,
  useFilterBuilder,
} from '@/functionals/filters';
import { FilterTableLayout } from '@/functionals/table';
import { useServiceAccountsMutations } from '../../hooks/use-service-accounts-mutations';
import type { ServiceAccount } from '../../types';
import { ServiceAccountListContent } from './service-account-list-content';

interface ServiceAccountListProps {
  serviceAccounts: ServiceAccount[];
}

export const hasActiveTokens = (serviceAccount: ServiceAccount) =>
  serviceAccount.tokens?.some((token) => !token.revokedBy) ?? false;

export const hasRevokedTokens = (serviceAccount: ServiceAccount) =>
  serviceAccount.tokens?.some((token) => !!token.revokedBy) ?? false;

const buildFilterFields = (
  t: TFunction,
): FilterFieldDefinition<ServiceAccount>[] => [
  {
    id: 'name',
    label: t('Pages.Integrations.ServiceAccounts.Dialog.nameLabel'),
    type: 'text',
    accessor: (serviceAccount) => serviceAccount.name,
    placeholder: t('Pages.Integrations.ServiceAccounts.Dialog.nameLabel'),
  },
  // Neither is pinned as a chip: every account already filters its own
  // tokens (All / Active / Revoked), and the same filter repeated above the
  // list read as two controls for one thing. Both stay in the filter builder.
  {
    id: 'hasActiveTokens',
    label: t('Pages.Integrations.ServiceAccounts.Filters.activeTokens'),
    type: 'boolean',
    accessor: hasActiveTokens,
  },
  {
    id: 'hasRevokedTokens',
    label: t('Pages.Integrations.ServiceAccounts.Filters.revokedTokens'),
    type: 'boolean',
    accessor: hasRevokedTokens,
  },
];

function useServiceAccountListController(serviceAccounts: ServiceAccount[]) {
  const { t } = useTranslation();
  const { handlers } = useServiceAccountsMutations();
  const filterFields = useMemo<FilterFieldDefinition<ServiceAccount>[]>(
    () => buildFilterFields(t),
    [t],
  );
  const filterController = useFilterBuilder({
    data: serviceAccounts,
    fields: filterFields,
    pinnedFilterIds: ['name'],
    debounceMs: 200,
    resetOnDataChange: true,
  });

  return {
    filterController,
    filteredServiceAccounts: filterController.filteredData,
    handlers,
    t,
  };
}

export function ServiceAccountList({
  serviceAccounts,
}: ServiceAccountListProps) {
  const navigate = useNavigate();
  const { filterController, filteredServiceAccounts, handlers, t } =
    useServiceAccountListController(serviceAccounts);

  return (
    <FilterTableLayout controller={filterController} className="pt-0">
      <FilterTableLayout.Toolbar className="shrink-0">
        <FilterTableLayout.ToolbarRow>
          <FilterTableLayout.Search
            filterId="name"
            inputClassName="w-full sm:w-[300px]"
          >
            <FilterToolbarQuickAccessFilters className="sm:shrink-0" />
          </FilterTableLayout.Search>
          <FilterTableLayout.Actions>
            <GradientButton
              onClick={() =>
                navigate({ to: '/integrations/service-accounts/new' })
              }
              label={t('Pages.Integrations.ServiceAccounts.createButton')}
            />
          </FilterTableLayout.Actions>
        </FilterTableLayout.ToolbarRow>
        <FilterTableLayout.Filters />
      </FilterTableLayout.Toolbar>

      <FilterTableLayout.Content className="mt-6 overflow-auto pr-1">
        <ServiceAccountListContent
          filteredServiceAccounts={filteredServiceAccounts}
          onDeleteServiceAccount={handlers.handleDeleteServiceAccount}
          onGenerateToken={(serviceAccountSlug) =>
            navigate({
              to: '/integrations/service-accounts/$serviceAccountSlug/tokens/new',
              params: { serviceAccountSlug },
            })
          }
          onRevokeToken={handlers.handleRevokeToken}
          serviceAccounts={serviceAccounts}
        />
      </FilterTableLayout.Content>
    </FilterTableLayout>
  );
}
