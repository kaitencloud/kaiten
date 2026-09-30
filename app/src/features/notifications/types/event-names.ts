import type { Webhooks } from '@/api-client/types.gen';

/**
 * Every event name the API publishes, taken from the OpenAPI document rather
 * than written down again here.
 *
 * The document's `webhooks` section is generated from the same
 * `events.Metadata` values the notification catalogue is built from
 * (api/internal/infrastructure/events/webhook), so this union IS the server's
 * vocabulary — and a name that leaves the contract stops compiling here.
 *
 * That is not a theoretical benefit. Both maps below this were originally keyed
 * by plausible-looking names that no deployment ever emitted (`DEPLOYMENT`,
 * `INSTANCE_CREATION`, `RELEASE_PUBLISHED`), and because a missing key is a
 * legitimate state — an event the client has no opinion about — nothing failed.
 * Every notification silently rendered a fallback icon and no description, and
 * every one of them sorted into the "Other" group.
 */
export type KaitenEventName = Webhooks['body']['name'];

/**
 * The same events by CloudEvents type, which is the key the document itself is
 * indexed by. Notifications carry both, so a client can join either way.
 */
export type KaitenEventType = Webhooks['body']['type'];

/**
 * A map the client fills in for the events it has an opinion about.
 *
 * Partial, deliberately: the client does not have to know every event, and one
 * added to the catalogue must not need a frontend release. Wrong names, though,
 * are not a state anyone wants — and this is what makes them a build error.
 */
export type EventNameMap<Value> = Partial<Record<KaitenEventName, Value>>;
