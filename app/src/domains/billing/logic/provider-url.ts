/**
 * The address of a page the payment provider hosts (the invoice a customer pays on,
 * its PDF), when it is safe to put in a link: an absolute https address. The
 * console renders what the API sent each time and keeps none of it, but a link is
 * followed, and a provider's data is not the console's to trust: an address that
 * is not https, or not an address at all (`javascript:`, a relative path, text),
 * is no link.
 */
export function getSafeProviderUrl(
  url: string | null | undefined,
): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    const parsed = new URL(url);

    return parsed.protocol === 'https:' ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The page of an invoice in Stripe's dashboard, where a credit note is made, in the mode
 * the connection reaches (`livemode`). The dashboard keeps the test and the live data
 * apart, and a link to the wrong one finds nothing, so a mode that is not known gives no
 * link; neither does an identifier that is not an invoice's, which is not put in an
 * address.
 */
export function getStripeInvoiceDashboardUrl(
  livemode: boolean | null | undefined,
  externalInvoiceId: string | null | undefined,
): string | undefined {
  if (typeof livemode !== 'boolean' || !externalInvoiceId) {
    return undefined;
  }
  if (!/^in_\w+$/.test(externalInvoiceId)) {
    return undefined;
  }

  return `https://dashboard.stripe.com${livemode ? '' : '/test'}/invoices/${externalInvoiceId}`;
}
