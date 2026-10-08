import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { InvoiceScope } from '../../schemas/invoice-scope.schema';

type InvoiceScopeChipsProps = {
  /** Writes the scope without the slug that was taken off: none left is the bare path. */
  onChange: (scope: InvoiceScope) => void;
  scope: InvoiceScope;
};

type ScopeKey = keyof InvoiceScope;

const FIELD_LABEL_KEYS = {
  customerSlug: 'Pages.Billing.Invoices.Filters.customer',
  instanceSlug: 'Pages.Billing.Invoices.Filters.instance',
} as const satisfies Record<ScopeKey, string>;

const SCOPE_KEYS = Object.keys(FIELD_LABEL_KEYS) as ScopeKey[];

/**
 * The customer or the instance the list is scoped to, as a chip that takes it off,
 * drawn like the chips of the filters beside it. The scope is in the URL and the
 * API's to apply: it is why a link from the page of a customer lists its invoices
 * only, and a chip, not a filter, is how the page says so and lets it go.
 */
export function InvoiceScopeChips({ onChange, scope }: InvoiceScopeChipsProps) {
  const { t } = useTranslation();

  function renderChip(key: ScopeKey) {
    const text = t('Pages.Billing.Invoices.Filters.chip', {
      field: t(FIELD_LABEL_KEYS[key]),
      value: scope[key],
    });

    return (
      <div
        className="bg-secondary text-secondary-foreground inline-flex h-9 items-center gap-1 rounded-full px-3"
        data-scope={key}
        key={key}
      >
        <span className="max-w-[240px] truncate text-sm" title={text}>
          {text}
        </span>
        <button
          aria-label={t('Pages.Billing.Invoices.Filters.remove', {
            filter: text,
          })}
          className="text-muted-foreground hover:text-foreground"
          onClick={() => onChange({ ...scope, [key]: undefined })}
          type="button"
        >
          <X aria-hidden className="size-3.5" />
        </button>
      </div>
    );
  }

  return <>{SCOPE_KEYS.filter((key) => scope[key]).map(renderChip)}</>;
}
