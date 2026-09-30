/**
 * The browser side of `api/pkg/externalid`: Kaiten's internal id for a Clerk
 * organization, derived rather than looked up.
 *
 * It has to match the server byte for byte — it is the organization id the
 * platform flag service evaluates flags for, and the slug of the instance
 * onboarding tracks this organization as — so it repeats the same
 * UUIDv5 (SHA-1) chain: root namespace → "organization" → the Clerk org id.
 */
const ROOT_NAMESPACE = 'eb025416-6f74-4684-97e9-83e99784aaa5';

function uuidBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '');
  return Uint8Array.from({ length: 16 }, (_, i) =>
    Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16),
  );
}

async function uuidV5(namespace: string, name: string): Promise<string> {
  const nameBytes = new TextEncoder().encode(name);
  const input = new Uint8Array(16 + nameBytes.length);
  input.set(uuidBytes(namespace));
  input.set(nameBytes, 16);

  const bytes = new Uint8Array(
    (await crypto.subtle.digest('SHA-1', input)).slice(0, 16),
  );
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(
    '',
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function deriveOrganizationId(
  externalOrganizationId: string,
): Promise<string> {
  return uuidV5(
    await uuidV5(ROOT_NAMESPACE, 'organization'),
    externalOrganizationId,
  );
}
