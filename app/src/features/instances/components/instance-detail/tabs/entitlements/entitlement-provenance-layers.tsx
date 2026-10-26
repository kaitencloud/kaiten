import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { formatUtcDate } from '@/domains/billing';
import type { ServedProvenance } from '../../../../utils/entitlement-provenance.utils';

/** Render only public provenance fields: a reason or actor is never read here. */
export function EntitlementProvenanceLayers({
  provenance,
  name,
}: {
  provenance: ServedProvenance | null | undefined;
  name: string;
}) {
  const { t, i18n } = useTranslation();
  const KEY = 'Pages.EntitlementExceptions';
  if (!provenance?.exception && !provenance?.boosts?.length) return null;
  function valueText(
    value: { type: string; value: unknown } | null | undefined,
  ): string {
    if (!value) return t(`${KEY}.unlimited`);
    if (value.type === 'boolean')
      return t(value.value ? `${KEY}.enabled` : `${KEY}.disabled`);
    return JSON.stringify(value.value) ?? '';
  }
  function renderBoost(boost: NonNullable<ServedProvenance['boosts']>[number]) {
    return (
      <li key={boost.instanceVoucherId}>
        {t(`${KEY}.fromBoost`)}: {t(`${KEY}.kinds.${boost.modifierType}`)}{' '}
        {boost.value
          ? valueText(boost.value)
          : (boost.modifierValue ?? t(`${KEY}.unlimited`))}
      </li>
    );
  }
  function renderAddon(addon: NonNullable<ServedProvenance['addons']>[number]) {
    return (
      <li key={addon.instanceAddonId}>
        {t(`${KEY}.fromAddon`)}: {addon.quantity} × {valueText(addon.value)}
      </li>
    );
  }
  const exception = provenance.exception;
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            aria-label={t(`${KEY}.provenanceName`, { name })}
          />
        }
      >
        {t(`${KEY}.provenance`)}
      </PopoverTrigger>
      <PopoverContent className="w-80 max-w-[calc(100vw-2rem)]">
        <PopoverHeader>
          <PopoverTitle>{t(`${KEY}.provenance`)}</PopoverTitle>
        </PopoverHeader>
        <ul
          className="space-y-2 break-words text-sm"
          data-testid="entitlement-provenance-layers"
        >
          {provenance.license && (
            <li>
              {t(`${KEY}.fromLicense`)}: {valueText(provenance.license.value)}
            </li>
          )}
          {(provenance.addons ?? []).map(renderAddon)}
          {(provenance.boosts ?? []).map(renderBoost)}
          {exception && (
            <li>
              <strong>{t(`${KEY}.exception`)}</strong>:{' '}
              {t(`${KEY}.kinds.${exception.kind}`)} {valueText(exception.value)}
              <p>
                {t(`${KEY}.window`, {
                  start: formatUtcDate(exception.startsAt, i18n.language),
                  end: exception.endsAt
                    ? formatUtcDate(exception.endsAt, i18n.language)
                    : t(`${KEY}.noEnd`),
                })}
              </p>
            </li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
