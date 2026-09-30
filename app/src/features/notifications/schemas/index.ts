import { z } from 'zod';
import { zNotification } from '@/api-client/zod.gen';

// Frames of the notification stream (GET /v1/notifications/stream). The REST
// operations are described by openapi.yaml and their schemas generated; a
// Server-Sent Events stream is not, so its frames are declared here -- around
// the generated Notification, which a frame carries exactly as the list does.

export const zStreamConnectedFrame = z.object({
  unreadCount: z.number().int(),
});

export const zStreamNotificationFrame = z.object({
  notification: zNotification,
  unreadCount: z.number().int(),
});

export const zStreamReadFrame = z.object({
  unreadCount: z.number().int(),
});
