import { Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type VoucherCodeBoxProps = {
  code: string;
};

/**
 * A voucher's code, to read and to copy. The code is a secret of a kind -- whoever has
 * it can redeem the offer -- so it lives in this box and the memory of the page and
 * nowhere else: not in the address, not in a key of the cache, not in the storage of the
 * browser. Copying is the way it leaves: the field selects itself on focus for whoever
 * prefers to copy it by hand.
 */
export function VoucherCodeBox({ code }: VoucherCodeBoxProps) {
  const { t } = useTranslation();

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(t('Pages.Vouchers.Code.copied'));
    } catch {
      toast.error(t('Pages.Vouchers.Code.copyFailed'));
    }
  }

  return (
    <div className="flex gap-2">
      <Input
        aria-label={t('Pages.Vouchers.Code.label')}
        autoComplete="off"
        className="bg-background font-mono text-base tracking-wide"
        data-testid="voucher-code"
        onFocus={(event) => event.currentTarget.select()}
        readOnly
        spellCheck={false}
        value={code}
      />
      <Button
        aria-label={t('Pages.Vouchers.Code.copy')}
        className="shrink-0"
        data-testid="voucher-code-copy"
        onClick={() => void copy()}
        size="icon"
        type="button"
        variant="outline"
      >
        <Copy className="size-4" />
      </Button>
    </div>
  );
}
