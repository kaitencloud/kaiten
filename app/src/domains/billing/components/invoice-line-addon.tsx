import { useTranslation } from 'react-i18next';
import type { InvoiceLine } from '@/api-client';
import { useInvoiceLineAddon } from '../hooks';
import { formatBoundary, getInvoiceLineSource } from '../logic';

type InvoiceLineAddonProps = {
  /**
   * The slug of the instance the invoice is for, which names the attachment of a
   * line. A preview of a licence has no instance, so its lines say only that they
   * come from an add-on.
   */
  instanceSlug?: string;
  line: InvoiceLine;
};

// Written out in full, so that a key that does not exist fails the check of the keys.
const KEYS = {
  from: 'Features.Billing.InvoiceLines.Addon.from',
  fromRemoved: 'Features.Billing.InvoiceLines.Addon.fromRemoved',
  fromUnknown: 'Features.Billing.InvoiceLines.Addon.fromUnknown',
} as const;

// A line that names an attachment and a session that may read it: the add-on is
// named, and said to be removed when it was taken off the instance before the
// boundary that bills it.
function AttachedAddonNote({
  instanceSlug,
  line,
}: {
  instanceSlug: string;
  line: InvoiceLine;
}) {
  const { i18n, t } = useTranslation();
  const { attachment, isPending, removedAt } = useInvoiceLineAddon(
    instanceSlug,
    line,
  );
  const isMetered = line.type !== 'ADDON';

  if (isPending) {
    return null;
  }
  if (!attachment) {
    return isMetered ? <AddonNote text={t(KEYS.fromUnknown)} /> : null;
  }
  if (removedAt) {
    return (
      <AddonNote
        text={t(KEYS.fromRemoved, {
          date: formatBoundary(removedAt, i18n.language),
          name: attachment.name,
        })}
      />
    );
  }

  // The label of a fee already names the add-on and its quantity: only what a
  // label cannot say, that it was taken off, is added to it.
  return isMetered ? (
    <AddonNote text={t(KEYS.from, { name: attachment.name })} />
  ) : null;
}

function AddonNote({ text }: { text: string }) {
  return (
    <p
      className="text-xs text-muted-foreground"
      data-testid="invoice-line-addon"
    >
      {text}
    </p>
  );
}

/**
 * Which add-on a line bills, when it bills one: the usage and the overage an add-on
 * rated are lines of the type of a licence's, labelled by the entitlement they
 * measure, so nothing in the line itself says they are the add-on's. The attachment
 * is found by `instanceAddonId` among everything the instance has held, because an
 * add-on removed before the boundary is still billed on the invoice of that boundary
 * and is no longer in the list of the instance's add-ons. A fee of an add-on is named
 * by its own label, and says only that the add-on was removed.
 */
export function InvoiceLineAddon({
  instanceSlug,
  line,
}: InvoiceLineAddonProps) {
  const { t } = useTranslation();
  const source = getInvoiceLineSource(line);

  if (source.kind !== 'ADDON') {
    return null;
  }
  if (instanceSlug && source.instanceAddonId !== null) {
    return <AttachedAddonNote instanceSlug={instanceSlug} line={line} />;
  }

  return line.type === 'ADDON' ? null : (
    <AddonNote text={t(KEYS.fromUnknown)} />
  );
}
