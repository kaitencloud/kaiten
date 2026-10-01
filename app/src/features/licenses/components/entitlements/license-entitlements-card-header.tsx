import { Button } from '@/components/ui/button';
import { Info, Plus, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { TableCard } from '@/functionals/table';
import { dataModelIcons } from '@/lib/data-model-icons';
import type { LicenseEntitlementsCardResetAction } from './license-entitlements-card.types';

type LicenseEntitlementsHeaderProps = {
  addButtonLabel?: string;
  cardDescriptionDetails: string | null;
  cardDescriptionSummary: string;
  hasAvailableEntitlements: boolean;
  onOpenAddDialog: () => void;
  resetAction?: LicenseEntitlementsCardResetAction;
};

type AddEntitlementButtonProps = {
  disabled: boolean;
  disabledHint: string;
  label: string;
  onClick: () => void;
};

function AddEntitlementButton({
  disabled,
  disabledHint,
  label,
  onClick,
}: AddEntitlementButtonProps) {
  const button = (
    <Button
      type="button"
      size="sm"
      className="gap-2"
      onClick={onClick}
      disabled={disabled}
    >
      <Plus className="size-4" />
      {label}
    </Button>
  );

  if (!disabled) {
    return button;
  }

  // A disabled button swallows pointer events, so the wrapper carries the
  // tooltip that says why there is nothing left to add.
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <span tabIndex={0} className="inline-flex">
              {button}
            </span>
          }
        />
        <TooltipContent>{disabledHint}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function LicenseEntitlementsHeader({
  addButtonLabel,
  cardDescriptionDetails,
  cardDescriptionSummary,
  hasAvailableEntitlements,
  onOpenAddDialog,
  resetAction,
}: LicenseEntitlementsHeaderProps) {
  const { t } = useTranslation();
  const EntitlementIcon = dataModelIcons.entitlement;

  return (
    <TableCard.Header className="flex items-start justify-between gap-4">
      <TableCard.HeaderLeading>
        <TableCard.HeaderIcon>
          <EntitlementIcon />
        </TableCard.HeaderIcon>
        <TableCard.HeaderHeading>
          <TableCard.HeaderTitle>
            {t('Pages.Licenses.Entitlements.cardTitle')}
          </TableCard.HeaderTitle>
          <TableCard.HeaderSubtitle className="flex items-center gap-1">
            <span>{cardDescriptionSummary}</span>
            {cardDescriptionDetails ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="size-5 text-muted-foreground hover:text-foreground"
                      aria-label={t(
                        'Common.moreInformation',
                        'More information',
                      )}
                    >
                      <Info className="size-3.5" />
                    </Button>
                  }
                />
                <TooltipContent className="max-w-xs">
                  {cardDescriptionDetails}
                </TooltipContent>
              </Tooltip>
            ) : null}
          </TableCard.HeaderSubtitle>
        </TableCard.HeaderHeading>
      </TableCard.HeaderLeading>

      <TableCard.HeaderActions>
        {resetAction ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={resetAction.onReset}
            disabled={resetAction.disabled}
          >
            <RotateCcw className="size-4" />
            {resetAction.label ?? t('Pages.Licenses.Entitlements.resetButton')}
          </Button>
        ) : null}
        <AddEntitlementButton
          disabled={!hasAvailableEntitlements}
          disabledHint={t('Pages.Licenses.Entitlements.allAttachedHint')}
          label={addButtonLabel ?? t('Pages.Licenses.Entitlements.addButton')}
          onClick={onOpenAddDialog}
        />
      </TableCard.HeaderActions>
    </TableCard.Header>
  );
}
