import type { ZodType } from 'zod';
import * as generated from '@/api-client/zod.gen';
import { parseContract } from './openapi-contract';

/** An event as the audit trail records it: the webhook body the API emits. */
export type AuditEventBody = {
  data: unknown;
  name: string;
  type: string;
};

type WebhookRequestSchema = {
  shape: { body: ZodType & { shape: { name: { options: string[] } } } };
};

/**
 * The body schema of every event the OpenAPI document declares, by event name.
 * The generated client holds one `zOn<Event>WebhookRequest` per event, whose
 * body is `{ data, name, type }`: the event's payload with its literal name and
 * versioned type. The audit trail stores exactly that payload, so these are the
 * schemas a seeded entry has to match.
 *
 * The registry is read from the generated module rather than listed here, so a
 * new event is covered by regenerating the client. An event with no schema
 * throws, which is how a generator that renamed them shows.
 */
const BODY_BY_EVENT = new Map<string, ZodType>(
  Object.entries(generated)
    .filter(([key]) => /^zOn\w+WebhookRequest$/.test(key))
    .map(([, request]) => {
      const { body } = (request as unknown as WebhookRequestSchema).shape;
      return [body.shape.name.options[0], body];
    }),
);

/**
 * Check a seeded audit trail event against the contract of its event, and
 * return it unchanged. The payload, the event name and its versioned type must
 * all be what the API emits, so a seed cannot drift from it.
 */
export function parseAuditEventContract<T extends AuditEventBody>(
  event: T,
  label: string,
): T {
  const body = BODY_BY_EVENT.get(event.name);
  if (!body) {
    throw new Error(
      `${label}: the OpenAPI document declares no event named ${event.name}`,
    );
  }
  return parseContract(body, event, label);
}
