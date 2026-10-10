import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PublishableKey } from '@/api-client';
import { GradientButton } from '@/components/gradient-button';
import { Switch } from '@/components/ui/switch';
import {
  ListEmptyState,
  TableEmptyMessage,
  useCanPerform,
} from '@/domains/billing';
import { Button } from '@/components/ui/button';
import {
  type FilterFieldDefinition,
  useFilterBuilder,
} from '@/functionals/filters';
import { FilterTableLayout } from '@/functionals/table';
import { dataModelIcons } from '@/lib/data-model-icons';
import {
  createPublishableKeyFilterFields,
  PUBLISHABLE_KEY_SEARCH_ID,
} from '../../utils/publishable-key-filter-fields';
import { PublishableKeysTable } from './publishable-keys-table';

type PublishableKeyListProps = {
  /** Whether the revoked keys are listed too, which the API reads and the URL holds. */
  includeRevoked: boolean;
  keys: readonly PublishableKey[];
  onIncludeRevokedChange: (includeRevoked: boolean) => void;
};

/**
 * The keys of the organization as a list page like the others: a search that matches
 * the label, the last characters of the key and the origins, the switch that adds the
 * revoked keys, the button that issues a new one, and the table, sorted and paged in the
 * browser. The revoked keys are the API's to leave out, so the switch asks it again.
 */
export function PublishableKeyList({
  includeRevoked,
  keys,
  onIncludeRevokedChange,
}: PublishableKeyListProps) {
  const { t } = useTranslation();
  const mayCreate = useCanPerform('publishableKeys.create');
  const fields = useMemo<FilterFieldDefinition<PublishableKey>[]>(
    () => createPublishableKeyFilterFields(t),
    [t],
  );
  const controller = useFilterBuilder({
    data: keys as PublishableKey[],
    debounceMs: 200,
    fields,
    pinnedFilterIds: [PUBLISHABLE_KEY_SEARCH_ID],
    // The search is a value, valid for any set of keys: a refetch after an action must
    // not wipe what it found.
    resetOnDataChange: false,
  });
  const revokedSwitchId = useId();
  const KeyIcon = dataModelIcons.publishableKey;
  const newKey = mayCreate ? (
    <GradientButton
      label={t('Pages.Integrations.PublishableKeys.List.new')}
      to="/integrations/publishable-keys/new"
    />
  ) : null;

  return (
    <FilterTableLayout controller={controller}>
      <FilterTableLayout.Toolbar>
        <FilterTableLayout.ToolbarRow>
          <FilterTableLayout.Search filterId={PUBLISHABLE_KEY_SEARCH_ID} />
          <FilterTableLayout.Actions className="flex-wrap gap-4">
            <label
              className="flex cursor-pointer items-center gap-2 text-sm"
              htmlFor={revokedSwitchId}
            >
              <Switch
                checked={includeRevoked}
                id={revokedSwitchId}
                onCheckedChange={(checked) => onIncludeRevokedChange(checked)}
                size="sm"
              />
              {t('Pages.Integrations.PublishableKeys.List.includeRevoked')}
            </label>
            {newKey}
          </FilterTableLayout.Actions>
        </FilterTableLayout.ToolbarRow>
        <FilterTableLayout.Filters />
      </FilterTableLayout.Toolbar>
      <FilterTableLayout.Content>
        <PublishableKeysTable
          emptyMessage={
            keys.length === 0 ? (
              <ListEmptyState
                description={t(
                  'Pages.Integrations.PublishableKeys.List.Empty.description',
                )}
                icon={KeyIcon}
                testId="publishable-keys-empty"
                title={t('Pages.Integrations.PublishableKeys.List.Empty.title')}
              >
                {newKey}
              </ListEmptyState>
            ) : (
              <TableEmptyMessage
                description={t(
                  'Pages.Integrations.PublishableKeys.List.Empty.filteredDescription',
                )}
                testId="publishable-keys-filtered-empty"
                title={t(
                  'Pages.Integrations.PublishableKeys.List.Empty.filteredTitle',
                )}
              >
                <Button
                  onClick={controller.resetAll}
                  size="sm"
                  variant="outline"
                >
                  {t('Pages.Integrations.PublishableKeys.List.Filters.clear')}
                </Button>
              </TableEmptyMessage>
            )
          }
          keys={controller.filteredData}
        />
      </FilterTableLayout.Content>
    </FilterTableLayout>
  );
}
