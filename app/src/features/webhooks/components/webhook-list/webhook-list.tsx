import { GradientButton } from '@/components/gradient-button';
import { FilterTableLayout } from '@/functionals/table';
import { WebhookDeliveriesDialog } from '../webhook-deliveries';
import { useWebhookListController } from './webhook-list.controller';
import { WebhookListContent } from './webhook-list-content';

export function WebhookList() {
  const {
    deliveriesDialog,
    filterController,
    filteredWebhooks,
    handleDeleteHook,
    t,
    webhooks,
  } = useWebhookListController();

  return (
    <FilterTableLayout controller={filterController} className="pt-0">
      <FilterTableLayout.Toolbar className="shrink-0">
        <FilterTableLayout.ToolbarRow>
          <FilterTableLayout.Search
            filterId="query"
            inputClassName="w-full sm:w-[300px]"
          />
          <FilterTableLayout.Actions>
            <GradientButton
              to="/integrations/webhooks/new"
              label={t('Pages.Integrations.Webhooks.newButton')}
            />
          </FilterTableLayout.Actions>
        </FilterTableLayout.ToolbarRow>
        <FilterTableLayout.Filters />
      </FilterTableLayout.Toolbar>

      <FilterTableLayout.Content>
        <WebhookListContent
          filteredWebhooks={filteredWebhooks}
          onDelete={handleDeleteHook}
          onOpenDeliveries={deliveriesDialog.openDeliveries}
          webhooks={webhooks}
        />
      </FilterTableLayout.Content>

      <WebhookDeliveriesDialog
        onOpenChange={deliveriesDialog.setDeliveriesOpen}
        open={deliveriesDialog.deliveriesOpen}
        webhook={deliveriesDialog.deliveriesWebhook}
      />
    </FilterTableLayout>
  );
}
