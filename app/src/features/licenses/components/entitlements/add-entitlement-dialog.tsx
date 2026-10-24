import { Button } from '@/components/ui/button';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Entitlement } from '@/api-client';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getHighestAcceptedUsage } from '@/domains/entitlement-usage';
import { formatNumber } from '@/lib/format-date';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { NumberInput } from '@/components/ui/number-input';
import { isNumericEntitlementType } from '../../utils';

type AddEntitlementDialogProps = {
  availableEntitlements: Entitlement[];
  newBooleanValue: boolean;
  newConfigValue: string;
  newOveragePercent: number | null;
  newThreshold: number | null;
  newThresholdUnlimited: boolean;
  onAddEntitlement: () => Promise<void> | void;
  onNewBooleanValueChange: (value: boolean) => void;
  onNewConfigValueChange: (value: string) => void;
  onNewOveragePercentChange: (value: number | null) => void;
  onNewThresholdChange: (value: number | null) => void;
  onNewThresholdUnlimitedChange: (unlimited: boolean) => void;
  onOpenChange: (open: boolean) => void;
  onSelectedEntitlementIdChange: (entitlementId: string) => void;
  open: boolean;
  selectedEntitlementId: string;
};

export function AddEntitlementDialog({
  availableEntitlements,
  newBooleanValue,
  newConfigValue,
  newOveragePercent,
  newThreshold,
  newThresholdUnlimited,
  onAddEntitlement,
  onNewBooleanValueChange,
  onNewConfigValueChange,
  onNewOveragePercentChange,
  onNewThresholdChange,
  onNewThresholdUnlimitedChange,
  onOpenChange,
  onSelectedEntitlementIdChange,
  open,
  selectedEntitlementId,
}: AddEntitlementDialogProps) {
  const { t } = useTranslation();

  const selectedEntitlement = useMemo(
    () =>
      availableEntitlements.find(
        (entitlement) => entitlement.id === selectedEntitlementId,
      ) ?? null,
    [availableEntitlements, selectedEntitlementId],
  );
  const isNumericSelection = isNumericEntitlementType(
    selectedEntitlement?.type,
  );
  // An unlimited grant has no cap to exceed, so there is no allowance to set.
  const showOveragePercent = isNumericSelection && !newThresholdUnlimited;
  // What the allowance actually buys, in the unit being granted: the number
  // the API stops accepting usage above.
  const highestAcceptedUsage = showOveragePercent
    ? getHighestAcceptedUsage(newThreshold, newOveragePercent)
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="form">
        <DialogHeader>
          <DialogTitle>
            {t('Pages.Licenses.Entitlements.Dialog.title')}
          </DialogTitle>
          <DialogDescription>
            {t('Pages.Licenses.Entitlements.Dialog.description')}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-6">
          <div className="grid grid-cols-1 gap-2">
            <Label htmlFor="entitlement-select">
              {t('Pages.Licenses.Entitlements.Dialog.entitlementLabel')}
            </Label>
            <Select
              items={availableEntitlements.map((entitlement) => ({
                value: entitlement.id,
                label: entitlement.name,
              }))}
              value={selectedEntitlementId || null}
              onValueChange={(value) =>
                onSelectedEntitlementIdChange(value ?? '')
              }
            >
              <SelectTrigger id="entitlement-select" className="w-full">
                <SelectValue
                  placeholder={t(
                    'Pages.Licenses.Entitlements.Dialog.entitlementPlaceholder',
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                {availableEntitlements.map((entitlement) => (
                  <SelectItem key={entitlement.id} value={entitlement.id}>
                    {entitlement.name} (
                    {t(
                      `Pages.Entitlements.EntitlementTypes.${entitlement.type}`,
                    )}
                    )
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isNumericSelection ? (
            <div className="space-y-2">
              <Label htmlFor="threshold-input">
                {t('Pages.Licenses.Entitlements.Dialog.thresholdLabel')}
              </Label>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <div className="min-w-40 flex-1">
                  <NumberInput
                    id="threshold-input"
                    value={newThreshold}
                    min={0}
                    step={1}
                    disabled={newThresholdUnlimited}
                    placeholder={t(
                      'Pages.Licenses.Entitlements.Dialog.thresholdPlaceholder',
                    )}
                    onValueChange={onNewThresholdChange}
                  />
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Switch
                    id="threshold-unlimited"
                    checked={newThresholdUnlimited}
                    onCheckedChange={onNewThresholdUnlimitedChange}
                  />
                  <Label htmlFor="threshold-unlimited" className="font-normal">
                    {t('Pages.Licenses.Entitlements.Status.unlimited')}
                  </Label>
                </div>
              </div>
            </div>
          ) : null}

          {showOveragePercent ? (
            <div className="space-y-2">
              <Label htmlFor="overage-percent-input">
                {t('Pages.Licenses.Entitlements.Dialog.overagePercentLabel')}
              </Label>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <Slider
                  aria-label={t(
                    'Pages.Licenses.Entitlements.Dialog.overagePercentLabel',
                  )}
                  className="min-w-40 flex-1"
                  value={[newOveragePercent ?? 0]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={([percent]) =>
                    onNewOveragePercentChange(percent)
                  }
                />
                {/* Wide enough for the three digits of a hundred percent, once
                    the two stepper buttons have taken their share. */}
                <div className="w-36 shrink-0">
                  <NumberInput
                    id="overage-percent-input"
                    value={newOveragePercent}
                    min={0}
                    max={100}
                    step={1}
                    placeholder={t(
                      'Pages.Licenses.Entitlements.Dialog.overagePercentPlaceholder',
                    )}
                    onValueChange={onNewOveragePercentChange}
                  />
                </div>
              </div>
              {highestAcceptedUsage === null ? null : (
                <p className="text-sm">
                  {t('Pages.Licenses.Entitlements.Dialog.maximumAllowedUsage', {
                    max: formatNumber(highestAcceptedUsage),
                  })}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {t(
                  'Pages.Licenses.Entitlements.Dialog.overagePercentDescription',
                )}
              </p>
            </div>
          ) : null}

          {selectedEntitlement?.type === 'BOOLEAN' ? (
            <div className="grid grid-cols-1 gap-2">
              <Label htmlFor="boolean-select">
                {t('Pages.Licenses.Entitlements.Dialog.booleanLabel', 'Value')}
              </Label>
              <Select
                items={[
                  {
                    value: 'true',
                    label: t(
                      'Pages.Licenses.Entitlements.Dialog.booleanEnabled',
                      'Enabled',
                    ),
                  },
                  {
                    value: 'false',
                    label: t(
                      'Pages.Licenses.Entitlements.Dialog.booleanDisabled',
                      'Disabled',
                    ),
                  },
                ]}
                value={newBooleanValue ? 'true' : 'false'}
                onValueChange={(v) => onNewBooleanValueChange(v === 'true')}
              >
                <SelectTrigger id="boolean-select" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">
                    {t(
                      'Pages.Licenses.Entitlements.Dialog.booleanEnabled',
                      'Enabled',
                    )}
                  </SelectItem>
                  <SelectItem value="false">
                    {t(
                      'Pages.Licenses.Entitlements.Dialog.booleanDisabled',
                      'Disabled',
                    )}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {selectedEntitlement?.type === 'CONFIG' ? (
            <div className="space-y-2">
              <Label htmlFor="config-input">
                {t(
                  'Pages.Licenses.Entitlements.Dialog.configLabel',
                  'Configuration (JSON)',
                )}
              </Label>
              <Textarea
                id="config-input"
                value={newConfigValue}
                onChange={(event) => onNewConfigValueChange(event.target.value)}
                placeholder="{}"
                className="font-mono text-sm"
                rows={6}
              />
            </div>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('Pages.Licenses.Entitlements.Dialog.cancelButton')}
          </Button>
          <Button
            type="button"
            onClick={() => {
              void onAddEntitlement();
            }}
            disabled={!selectedEntitlementId}
          >
            {t('Pages.Licenses.Entitlements.Dialog.addButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
