import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { Model } from '@/api-client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  addModelExternalId,
  invalidateAiQueries,
  suggestModelFor,
} from '@/domains/ai-credits';
import { getApiErrorMessage } from '@/lib/errors';
import { ModelPicker } from './model-picker';
import { ReceiptCallout } from './receipt-parts';

type AddExternalIdDialogProps = {
  /** The model exactly as the integration sent it. */
  sent: string;
  models: readonly Model[];
  onClose: () => void;
};

/**
 * Teaches the catalogue the name an integration sent for a model it does not
 * know: the name becomes an external id of the model picked. A model whose
 * slug the name starts with is offered first. The write re-reads the model and
 * appends to what it holds now; a name another model already owns is refused
 * by the API, and the refusal is shown here.
 */
export function AddExternalIdDialog({
  sent,
  models,
  onClose,
}: AddExternalIdDialogProps) {
  const { t } = useTranslation();
  const client = useQueryClient();
  // An archived model is never priced: naming it would change nothing.
  const candidates = models.filter((model) => model.status !== 'ARCHIVED');
  const suggestion = suggestModelFor(sent, candidates);
  const [model, setModel] = useState<Model | null>(suggestion);
  const add = useMutation({
    mutationFn: (target: Model) => addModelExternalId(target.slug, sent),
    onSuccess: async (updated) => {
      await invalidateAiQueries(client);
      toast.success(
        t('AI.Receipt.externalId.success', { model: sent, name: updated.name }),
      );
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent variant="form">
        <DialogHeader>
          <DialogTitle>{t('AI.Receipt.externalId.title')}</DialogTitle>
          <DialogDescription>
            {t('AI.Receipt.externalId.description', { model: sent })}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <div className="space-y-1.5">
            <ModelPicker
              models={candidates}
              value={model}
              onChange={setModel}
            />
            {suggestion && model?.slug === suggestion.slug ? (
              <p className="text-xs text-muted-foreground">
                {t('AI.Receipt.externalId.suggested', {
                  name: suggestion.name,
                })}
              </p>
            ) : null}
          </div>
          <ReceiptCallout>
            <p>{t('AI.Receipt.externalId.explain', { model: sent })}</p>
          </ReceiptCallout>
          {add.isError ? (
            <p
              role="alert"
              className="rounded-lg bg-destructive-subtle p-3 text-sm text-destructive-subtle-foreground"
            >
              {getApiErrorMessage(add.error)}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button
            nativeButton={false}
            variant="ghost"
            className="sm:mr-auto"
            render={<Link to="/ai/models/new" />}
          >
            {t('AI.Receipt.externalId.createInstead')}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('Common.cancel')}
          </Button>
          <Button
            type="button"
            disabled={!model || add.isPending}
            onClick={() => model && add.mutate(model)}
          >
            {t('AI.Receipt.externalId.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
