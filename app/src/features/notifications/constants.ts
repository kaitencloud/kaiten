import { zListNotificationsQuery } from '@/api-client/zod.gen';

// What a notification can be about -- the kind of page it opens -- in the order
// the object filter offers them: the values the list's objectType filter
// accepts, read from the generated contract, so a kind the API adds to
// catalogue.Objects reaches the filter with the next regeneration.
export const NOTIFICATION_OBJECT_TYPES =
  zListNotificationsQuery.shape.objectType.unwrap().unwrap().element.options;
