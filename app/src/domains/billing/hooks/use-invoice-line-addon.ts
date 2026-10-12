import { useQuery } from '@tanstack/react-query';
import type { InstanceAddon, InvoiceLine } from '@/api-client';
import { instanceAddonsWithRemovedQueryOptions } from '../queries';
import { useCanPerform } from './use-can-perform';

type LineAttachmentMembers = Pick<InvoiceLine, 'instanceAddonId' | 'serviceTo'>;

/**
 * The attachment an invoice line bills, found in what the instance has held,
 * removed attachments included (`GET /instances/{slug}/addons?includeRemoved=true`),
 * by the `instanceAddonId` of the line. It is read only for a line that names an
 * attachment, by a session that may list the add-ons of an instance, and asked once
 * for the instance however many lines ask. `attachment` is `undefined` while it is
 * read, when the session may not read it, and when the instance no longer has the
 * attachment or no longer exists (an invoice keeps the identity it was composed
 * for): the line is then shown without the name.
 *
 * `removedAt` is when the attachment was taken off, and only when that is not after the
 * end of the window the line bills: a line of an invoice composed before the removal says
 * nothing of it, since the add-on was still held when that invoice was issued.
 */
export function useInvoiceLineAddon(
  instanceSlug: string | undefined,
  line: Partial<LineAttachmentMembers>,
): {
  attachment: InstanceAddon | undefined;
  isPending: boolean;
  removedAt: string | undefined;
} {
  const mayList = useCanPerform('instance.addons.list');
  const instanceAddonId = line.instanceAddonId ?? null;
  const enabled = mayList && Boolean(instanceSlug) && instanceAddonId !== null;
  const query = useQuery({
    ...instanceAddonsWithRemovedQueryOptions(instanceSlug ?? ''),
    enabled,
  });

  const attachment = enabled
    ? query.data?.find((candidate) => candidate.id === instanceAddonId)
    : undefined;
  const removedAt = attachment?.removedAt ?? undefined;

  return {
    attachment,
    isPending: enabled && query.isPending,
    removedAt:
      removedAt !== undefined &&
      line.serviceTo !== undefined &&
      Date.parse(removedAt) <= Date.parse(line.serviceTo)
        ? removedAt
        : undefined,
  };
}
