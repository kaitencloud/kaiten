import env from '@/env';

// The REST operations come from the generated client (listNotifications,
// markNotificationsRead and the preferences, in @/api-client), through
// queries/ and hooks/. What stays here is the one endpoint openapi.yaml does
// not describe: the Server-Sent Events stream, which EventSource opens by URL.

// `EventSource` cannot set an Authorization header, so the stream authenticates
// with the Clerk session cookie instead: its route on the gateway reads the same
// JWT out of `__session` (charts/kaiten templates/ingress/policies.yaml). The
// cookie only travels when the EventSource is opened with `withCredentials`,
// which is what use-notification-stream does.
export function notificationStreamUrl(): string {
  return `${env.API_URL}/v1/notifications/stream`;
}
