import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FILTER_MULTI_SELECT_SEPARATOR,
  type FilterFieldDefinition,
  useFilterBuilder,
} from '@/functionals/filters';
import { NOTIFICATION_OBJECT_TYPES } from '../constants';
import type { Notification, NotificationObjectType } from '../types';

const OBJECT_TYPE_FILTER_ID = 'objectType';

// The controller filters nothing itself (see below), so it is given no rows; a
// module-level empty array keeps its identity stable across renders.
const NO_ROWS: Notification[] = [];

const isObjectType = (value: string): value is NotificationObjectType =>
  (NOTIFICATION_OBJECT_TYPES as readonly string[]).includes(value);

/**
 * The feed's object filter: the filters functional's controller, which drives
 * its quick-access chip (as on the feature-flags list), and the object types
 * the user picked.
 *
 * The feed is paged by the server, so the selection goes to the API -- the
 * list's objectType filter -- instead of being applied to the rows loaded so
 * far, which would only ever filter the first page.
 */
export function useNotificationObjectFilter() {
  const { t } = useTranslation();

  const fields = useMemo<FilterFieldDefinition<Notification>[]>(
    () => [
      {
        id: OBJECT_TYPE_FILTER_ID,
        label: t('Pages.Notifications.filters.objectType', 'Object'),
        type: 'enum_list',
        accessor: (notification) => [notification.objectType],
        options: NOTIFICATION_OBJECT_TYPES.map((objectType) => ({
          value: objectType,
          label: t(`Pages.Notifications.filters.objectTypes.${objectType}`),
        })),
        quickAccess: true,
        advancedFilterable: false,
      },
    ],
    [t],
  );

  const controller = useFilterBuilder({ data: NO_ROWS, fields });

  // A quick-access field is never among activeFilterIds: its chip is always
  // there, and its value applies whenever it is set.
  const selection = controller.normal.values[OBJECT_TYPE_FILTER_ID] ?? '';

  const objectTypes = useMemo(
    () =>
      selection
        .split(FILTER_MULTI_SELECT_SEPARATOR)
        .map((value) => value.trim())
        .filter(isObjectType),
    [selection],
  );

  return { controller, objectTypes };
}
