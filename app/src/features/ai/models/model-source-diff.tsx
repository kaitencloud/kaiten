import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { Model } from '@/api-client';
import {
  openRouterDisplayName,
  type OpenRouterEntry,
  type OpenRouterPriceKey,
} from './openrouter-catalogue';

type Props = {
  model: Model;
  entry: OpenRouterEntry;
  changedPrices: OpenRouterPriceKey[];
  unavailablePrices: OpenRouterPriceKey[];
  changedFields: ('name' | 'description')[];
  prices: OpenRouterPriceKey[];
  fields: ('name' | 'description')[];
  setPrices: Dispatch<SetStateAction<OpenRouterPriceKey[]>>;
  setFields: Dispatch<SetStateAction<('name' | 'description')[]>>;
  mayWrite: boolean;
  pending: boolean;
};
export function ModelSourceDiff({
  model,
  entry,
  changedPrices,
  unavailablePrices,
  changedFields,
  prices,
  fields,
  setPrices,
  setFields,
  mayWrite,
  pending,
}: Props) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      {changedPrices.map((key) => (
        <label key={key} className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            disabled={!mayWrite || pending}
            checked={prices.includes(key)}
            onChange={(event) =>
              setPrices((value) =>
                event.target.checked
                  ? [...value, key]
                  : value.filter((item) => item !== key),
              )
            }
          />
          <span>
            {t(`AI.rates.${key}`)}{' '}
            <span className="tabular-nums">
              {model.vendorCosts?.[key] ?? '—'} → {entry.mappedVendorCosts[key]}
            </span>{' '}
            USD/
            {t(
              key === 'perRequest'
                ? 'AI.OpenRouter.requestUnit'
                : 'AI.OpenRouter.tokenUnit',
            )}
          </span>
        </label>
      ))}
      {unavailablePrices.length ? (
        <div className="space-y-1 text-sm">
          <p role="status">{t('AI.OpenRouter.unavailablePrices')}</p>
          {unavailablePrices.map((key) => (
            <p key={key}>
              {t(`AI.rates.${key}`)} · {t('AI.OpenRouter.notListed')} ·{' '}
              {model.vendorCosts?.[key]} USD/
              {t(
                key === 'perRequest'
                  ? 'AI.OpenRouter.requestUnit'
                  : 'AI.OpenRouter.tokenUnit',
              )}
            </p>
          ))}
        </div>
      ) : null}
      {changedFields.length ? (
        <details>
          <summary className="cursor-pointer text-sm">
            {t('AI.OpenRouter.optionalDetails')}
          </summary>
          <div className="mt-3 space-y-3">
            {changedFields.map((key) => (
              <label key={key} className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  disabled={!mayWrite || pending}
                  checked={fields.includes(key)}
                  onChange={(event) =>
                    setFields((value) =>
                      event.target.checked
                        ? [...value, key]
                        : value.filter((item) => item !== key),
                    )
                  }
                />
                <span>
                  {t(key === 'name' ? 'AI.name' : 'AI.description')}
                  <span className="block whitespace-pre-wrap wrap-anywhere">
                    {model[key] ?? '—'} →{' '}
                    {key === 'name'
                      ? openRouterDisplayName(entry.name)
                      : entry.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </details>
      ) : null}
      {!changedPrices.length &&
      !changedFields.length &&
      !unavailablePrices.length ? (
        <p role="status">{t('AI.OpenRouter.unchanged')}</p>
      ) : null}
    </div>
  );
}
