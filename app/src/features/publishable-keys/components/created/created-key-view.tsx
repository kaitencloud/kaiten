import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PublishableKeyCreated } from '@/api-client';
import { Button } from '@/components/ui/button';
import { CopyableValueField } from '@/components/copyable-value-field';
import { StackedFormDialogPanel } from '@/functionals/stacked-form-dialog';

type CreatedKeyViewProps = {
  created: Pick<PublishableKeyCreated, 'key' | 'keyHint' | 'label'>;
  onDone: () => void;
  /** Called when the key has been copied, so that leaving the dialog can stop asking. */
  onCopied?: () => void;
};

/**
 * The one moment the key exists outside the API, which stores only a digest of it: shown
 * here, copied from here, gone once the dialog is closed. It lives in the memory of this
 * component and nowhere else, not in the address, a key of the cache, the storage of the
 * browser or a toast. Copying is the way it leaves, by the button or by hand from the
 * field, which selects itself on focus.
 */
export function CreatedKeyView({
  created,
  onCopied,
  onDone,
}: CreatedKeyViewProps) {
  const { t } = useTranslation();
  const base = 'Pages.Integrations.PublishableKeys.Create.Created';

  return (
    <StackedFormDialogPanel
      footer={
        <Button data-testid="created-key-done" onClick={onDone} type="button">
          {t(`${base}.done`)}
        </Button>
      }
    >
      <div className="space-y-4">
        <div
          className="flex items-start gap-3 rounded-lg border border-warning-subtle-foreground/30 bg-warning-subtle px-4 py-3 text-sm text-warning-subtle-foreground"
          role="status"
        >
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p>{t(`${base}.warning`, { hint: created.keyHint })}</p>
        </div>
        <CopyableValueField
          // The button that issued the key is gone: the focus goes to the key, which is
          // what the person came for, instead of falling to the page behind the dialog.
          autoFocus
          copiedMessage={t(`${base}.copied`)}
          copyFailedMessage={t(`${base}.copyFailed`)}
          copyLabel={t(`${base}.copy`)}
          copyTestId="created-key-copy"
          inputClassName="text-sm"
          inputTestId="created-key"
          label={t(`${base}.keyLabel`, { label: created.label })}
          onCopied={onCopied}
          value={created.key}
        />
      </div>
    </StackedFormDialogPanel>
  );
}
