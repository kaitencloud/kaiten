import type { TFunction } from 'i18next';
import { getApiErrorMessage } from '@/lib/errors';
import {
  OpenRouterError,
  normalizeOpenRouterDecimal,
} from './openrouter-catalogue';

export function openRouterErrorMessage(error: unknown, t: TFunction): string {
  return error instanceof OpenRouterError
    ? t(`AI.OpenRouter.errors.${error.code}`)
    : getApiErrorMessage(error);
}
/** Display only: exact decimal shift. Never feed this value back into vendorCosts. */
export function perMillionDisplay(value: string | null | undefined): string {
  const normalized = normalizeOpenRouterDecimal(value);
  if (normalized === undefined) return '—';
  const [whole, fraction = ''] = normalized.split('.');
  const digits = whole + fraction.padEnd(6, '0');
  const point = whole.length + 6;
  const integer = digits.slice(0, point).replace(/^0+(?=\d)/, '');
  const remainder = digits.slice(point).replace(/0+$/, '');
  return remainder ? `${integer}.${remainder}` : integer;
}
