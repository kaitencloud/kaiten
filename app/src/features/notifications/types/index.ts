export type {
  EventNameMap,
  KaitenEventName,
  KaitenEventType,
} from './event-names';
import type {
  List,
  ListNotificationsData,
  PreferenceChoices,
  Notification as WireNotification,
  PreferenceEvent as WirePreferenceEvent,
  PreferenceMatrix as WirePreferenceMatrix,
} from '@/api-client/types.gen';

// The wire shapes are the generated ones (openapi.yaml, served by
// api/internal/modules/notifications): this module only gives them the names the
// feature uses.
export type Notification = WireNotification;
export type NotificationListResponse = List;
export type PreferenceEvent = WirePreferenceEvent;
export type PreferenceMatrix = WirePreferenceMatrix;
export type PutNotificationPreferencesInput = PreferenceChoices;

type ListNotificationsQuery = NonNullable<ListNotificationsData['query']>;

export type NotificationStatusFilter = NonNullable<
  ListNotificationsQuery['status']
>;

/** A kind of object the feed can be narrowed to: the list's objectType filter. */
export type NotificationObjectType = NonNullable<
  ListNotificationsQuery['objectType']
>[number];
