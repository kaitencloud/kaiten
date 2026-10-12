import { PackageOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import {
  ExportInvoicesMenu,
  useBillingCapabilities,
  useCanPerform,
} from '@/domains/billing';
import { SettingsCardHeader } from '../../components/settings-card-header';
import { UsageExport } from './usage-export';

// Every invoice of the organization: no filter.
const ALL_INVOICES = {} as const;

/**
 * What to keep before an organization is deleted. Deleting it erases what billing
 * recorded, the journal of usage included, and Kaiten is not an organization's
 * accounting system, so the invoices and the usage reports are offered as files
 * first. The deletion itself is not here (the identity provider owns it): this is
 * where a person who is about to do it, or leave, comes for their data, on a
 * self-hosted deployment as much as on the cloud.
 *
 * The invoices are billing's and are offered only where billing is on. The usage
 * reports are not: they are kept with or without billing, so they are always
 * offered, and the card is absent only for a session that may export neither.
 */
export function ExportDataCard() {
  const { t } = useTranslation();
  const { isEnabled } = useBillingCapabilities();
  const mayExportInvoices = useCanPerform('invoices.export');
  const mayExportUsage = useCanPerform('usageHistory.exportOrganization');
  const showInvoices = isEnabled && mayExportInvoices;

  if (!showInvoices && !mayExportUsage) {
    return null;
  }

  return (
    <Card data-testid="export-data">
      <SettingsCardHeader
        description={t('Pages.Settings.DataExport.description')}
        icon={PackageOpen}
        title={t('Pages.Settings.DataExport.title')}
      />
      <CardContent className="space-y-6">
        {showInvoices ? (
          <div
            className="flex flex-wrap items-center justify-between gap-3"
            data-testid="invoices-export"
          >
            <div className="space-y-1">
              <h3 className="text-sm font-medium">
                {t('Pages.Settings.DataExport.Invoices.title')}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t('Pages.Settings.DataExport.Invoices.description')}
              </p>
            </div>
            <ExportInvoicesMenu filters={ALL_INVOICES} />
          </div>
        ) : null}
        {mayExportUsage ? <UsageExport /> : null}
      </CardContent>
    </Card>
  );
}
