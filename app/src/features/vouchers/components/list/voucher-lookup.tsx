import { useNavigate } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { type FormEvent, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { handleBillingProblem, ProblemAlert } from '@/domains/billing';
import { useVoucherLookup } from '../../hooks/use-voucher-lookup';

/**
 * Opens the voucher a code names, for whoever holds the code and not the voucher:
 * a customer writes in with a code that does not work. The code goes to the API in the
 * body of a request and is kept in this field alone: it is not searched in the address,
 * it is not remembered, and the page that opens is the voucher's by its id.
 */
export function VoucherLookup() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const lookup = useVoucherLookup();
  const [code, setCode] = useState('');
  const hintId = useId();
  const notFoundId = useId();
  const notFound =
    lookup.isError && handleBillingProblem(lookup.error).status === 404;

  async function find(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const typed = code.trim();

    if (typed === '') {
      return;
    }
    try {
      const voucher = await lookup.mutateAsync({ body: { code: typed } });

      setCode('');
      await navigate({
        params: { voucherId: voucher.id },
        to: '/vouchers/$voucherId',
      });
    } catch {
      // Said below, from the state of the request.
    }
  }

  return (
    <form
      aria-label={t('Pages.Vouchers.Lookup.title')}
      className="space-y-2"
      data-testid="voucher-lookup"
      onSubmit={find}
    >
      <div className="flex gap-2">
        <Input
          aria-describedby={notFound ? `${hintId} ${notFoundId}` : hintId}
          aria-label={t('Pages.Vouchers.Lookup.label')}
          autoComplete="off"
          className="font-mono sm:w-64"
          onChange={(event) => {
            setCode(event.target.value);
            lookup.reset();
          }}
          placeholder={t('Pages.Vouchers.Lookup.placeholder')}
          spellCheck={false}
          type="text"
          value={code}
        />
        <Button
          disabled={code.trim() === '' || lookup.isPending}
          type="submit"
          variant="outline"
        >
          <Search />
          {t('Pages.Vouchers.Lookup.action')}
        </Button>
      </div>
      <p className="sr-only" id={hintId}>
        {t('Pages.Vouchers.Lookup.hint')}
      </p>
      {notFound ? (
        <p
          className="text-sm text-muted-foreground"
          id={notFoundId}
          role="status"
        >
          {t('Pages.Vouchers.Lookup.notFound')}
        </p>
      ) : null}
      {lookup.isError && !notFound ? (
        <ProblemAlert error={lookup.error} />
      ) : null}
    </form>
  );
}
