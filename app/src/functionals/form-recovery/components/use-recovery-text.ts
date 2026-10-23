import { useTranslation } from 'react-i18next';
import { formatRelativeTimeToNow, formatTimeOfDay } from '@/lib/feed-time';
import type { FormRecoveryLabel, FormRecoveryNote } from '../types';

/** Under a minute `formatRelativeTimeToNow` says "now" or "3 seconds ago". */
const JUST_NOW_SECONDS = 60;

/**
 * The words of the recovery: relative times, lists of fields and labels. The
 * labels are keys or server texts, because the logic that makes them is pure
 * and has no `t`.
 */
export function useRecoveryText() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  const when = (timestamp: string): string => {
    const seconds = Math.abs(Date.now() - new Date(timestamp).getTime()) / 1000;
    return seconds < JUST_NOW_SECONDS
      ? t('Functionals.FormRecovery.time.justNow')
      : formatRelativeTimeToNow(timestamp, locale);
  };

  const list = (items: readonly string[]): string =>
    new Intl.ListFormat(locale, { type: 'conjunction' }).format(items);

  const label = (value: FormRecoveryLabel): string =>
    'key' in value ? t(value.key) : value.text;

  const date = (timestamp: string): string =>
    new Date(timestamp).toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
    });

  const time = (timestamp: string): string =>
    formatTimeOfDay(timestamp, locale);

  const note = (item: FormRecoveryNote): string => {
    switch (item.kind) {
      case 'unavailable':
        return item.name === null
          ? t('Functionals.FormRecovery.notes.unavailableUnnamed', {
              kind: label(item.entity),
            })
          : t('Functionals.FormRecovery.notes.unavailable', {
              name: item.name,
              kind: label(item.entity),
            });
      case 'reset':
        return t('Functionals.FormRecovery.notes.reset', {
          field: label(item.field),
        });
      case 'itemRemoved':
        return t('Functionals.FormRecovery.notes.itemRemoved', {
          field: label(item.field),
        });
      case 'sourceChanged':
        return t('Functionals.FormRecovery.notes.sourceChanged', {
          source: label(item.source),
        });
    }
  };

  return { t, locale, when, list, label, date, time, note };
}
