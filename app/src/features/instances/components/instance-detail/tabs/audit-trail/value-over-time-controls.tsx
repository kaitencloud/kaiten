import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type {
  AuditTrailEntitlementOption,
  ValueOverTimeMode,
} from './audit-trail.utils';
import type { SelectOption } from './audit-trail-select';

export function ValueOverTimeModeToggle({
  onChange,
  value,
}: {
  onChange: (value: ValueOverTimeMode) => void;
  value: ValueOverTimeMode;
}) {
  const { t } = useTranslation();

  return (
    <ToggleGroup
      value={[value]}
      variant="outline"
      size="sm"
      onValueChange={([nextValue]) => {
        if (nextValue === 'entitlement' || nextValue === 'group') {
          onChange(nextValue);
        }
      }}
      aria-label={t(
        'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.modeLabel',
      )}
    >
      <ToggleGroupItem value="entitlement">
        {t(
          'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.modes.entitlement',
        )}
      </ToggleGroupItem>
      <ToggleGroupItem value="group">
        {t(
          'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.modes.group',
        )}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

export function ValueOverTimeSummary({
  currentValue,
  locale,
  mode,
  numericEntitlementsCount,
  selectedEntitlement,
  selectedGroup,
}: {
  currentValue: number | null;
  locale: string;
  mode: ValueOverTimeMode;
  numericEntitlementsCount?: number;
  selectedEntitlement?: AuditTrailEntitlementOption;
  selectedGroup?: SelectOption;
}) {
  const { t } = useTranslation();

  if (mode === 'group' && selectedGroup) {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-sm font-medium">{selectedGroup.label}</span>
        <Badge variant="outline">
          {t(
            'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.groupBadge',
          )}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {t(
            'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.numericEntitlementsCount',
            {
              count: numericEntitlementsCount ?? 0,
            },
          )}
        </span>
        {currentValue !== null ? (
          <span className="text-xs text-muted-foreground">
            {t(
              'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.currentTotalLabel',
            )}{' '}
            <span className="font-mono font-medium text-foreground">
              {currentValue.toLocaleString(locale)}
            </span>
          </span>
        ) : null}
      </div>
    );
  }

  if (!selectedEntitlement) {
    return null;
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
      <span className="text-sm font-medium">{selectedEntitlement.label}</span>
      <Badge variant="outline">
        {t(`Pages.Entitlements.EntitlementTypes.${selectedEntitlement.type}`)}
      </Badge>
      {/* Without this, the saw-tooth of a resetting counter reads as bad data. */}
      {selectedEntitlement.isPeriodic ? (
        <Badge variant="secondary">
          {t(
            'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.periodicBadge',
          )}
        </Badge>
      ) : null}
      {currentValue !== null ? (
        <span className="text-xs text-muted-foreground">
          {t(
            'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.currentLabel',
          )}{' '}
          <span className="font-mono font-medium text-foreground">
            {currentValue.toLocaleString(locale)}
          </span>
        </span>
      ) : null}
    </div>
  );
}
