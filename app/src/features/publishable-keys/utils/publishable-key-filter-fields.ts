import type { TFunction } from 'i18next';
import type { PublishableKey } from '@/api-client';
import type { FilterFieldDefinition } from '@/functionals/filters';

/** The id of the search of the list, the one filter it has. */
export const PUBLISHABLE_KEY_SEARCH_ID = 'query';

/**
 * What the search of the list matches: the label of a key, the last four characters
 * that tell it apart, and the origins it may be sent from. A part of any of them is
 * enough, in any case. The search runs in the browser, on the keys the page holds.
 */
export function getPublishableKeySearchTokens(
  publishableKey: PublishableKey,
): string[] {
  return [
    publishableKey.label,
    publishableKey.keyHint,
    ...publishableKey.allowedOrigins,
  ];
}

export function createPublishableKeyFilterFields(
  t: TFunction,
): FilterFieldDefinition<PublishableKey>[] {
  return [
    {
      accessor: getPublishableKeySearchTokens,
      id: PUBLISHABLE_KEY_SEARCH_ID,
      label: t('Pages.Integrations.PublishableKeys.List.Filters.search'),
      placeholder: t(
        'Pages.Integrations.PublishableKeys.List.Filters.searchPlaceholder',
      ),
      type: 'text',
    },
  ];
}
