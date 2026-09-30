import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useMutation } from '@tanstack/react-query';
import { AlertCircle, ChevronRight, FlaskConical, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { EvaluationSuccess, FeatureFlag } from '@/api-client';
import { evaluateFlagMutation } from '@/api-client/@tanstack/react-query.gen';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getApiErrorMessage } from '@/lib/errors';
import { useFeatureFlagTryItDialogStore } from '../hooks/use-feature-flag-try-it-dialog-store';

type TryItDialogProps = {
  flag: FeatureFlag;
  open: boolean;
  onClose: () => void;
  onEvaluated?: (payload: {
    context: Record<string, unknown>;
    result: EvaluationSuccess;
  }) => void;
};

export function TryItDialog({
  flag,
  onClose,
  onEvaluated,
  open,
}: TryItDialogProps) {
  const { t } = useTranslation();
  const {
    contextInput,
    parseError,
    clearParseError,
    setContextInput,
    setParseError,
  } = useFeatureFlagTryItDialogStore();

  const evaluateMutation = useMutation({
    ...evaluateFlagMutation(),
  });

  const handleClose = () => {
    clearParseError();
    evaluateMutation.reset();
    onClose();
  };

  const handleEvaluate = () => {
    clearParseError();
    evaluateMutation.reset();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(contextInput);
    } catch {
      setParseError(t('Pages.FeatureFlags.TryIt.invalidJson'));
      return;
    }

    if (!parsed.targetingKey) {
      setParseError(t('Pages.FeatureFlags.TryIt.missingTargetingKey'));
      return;
    }

    evaluateMutation.mutate(
      {
        path: { key: flag.slug! },
        body: { context: parsed },
      },
      {
        onSuccess: (result) => {
          onEvaluated?.({ context: parsed, result });
        },
      },
    );
  };

  const result = evaluateMutation.data;
  const evalError = evaluateMutation.error;

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          handleClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-xl" variant="form">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="size-4" />
            {t('Pages.FeatureFlags.TryIt.title')}
          </DialogTitle>
          <DialogDescription>
            {t('Pages.FeatureFlags.TryIt.description')}{' '}
            <span className="font-mono font-medium text-foreground">
              {flag.slug}
            </span>
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-6">
          {/* JSON textarea */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {t('Pages.FeatureFlags.TryIt.contextLabel')}
            </label>
            <p className="text-xs text-muted-foreground">
              {t('Pages.FeatureFlags.TryIt.contextHint')}
            </p>
            <textarea
              aria-label={t('Pages.FeatureFlags.TryIt.contextLabel')}
              value={contextInput}
              onChange={(event) => {
                setContextInput(event.target.value);
                clearParseError();
                evaluateMutation.reset();
              }}
              rows={7}
              spellCheck={false}
              className="w-full rounded-md border border-input bg-muted/30 px-3 py-2 text-sm font-mono resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {/* Parse / validation error */}
          {parseError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive-subtle px-3 py-2 text-sm text-destructive-subtle-foreground">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              {parseError}
            </div>
          )}

          {/* API error */}
          {evalError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive-subtle px-3 py-2 text-sm text-destructive-subtle-foreground">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              {getApiErrorMessage(evalError)}
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="rounded-md border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t('Pages.FeatureFlags.TryIt.result')}
                </span>
                {result.reason && (
                  <Badge variant="secondary">{result.reason}</Badge>
                )}
              </div>

              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {t('Pages.FeatureFlags.TryIt.evaluatedValue')}
                </span>
                <code className="text-base font-mono font-semibold text-foreground bg-background border rounded px-2 py-0.5">
                  {JSON.stringify(result.value)}
                </code>
              </div>

              {result.variant && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ChevronRight className="size-3 shrink-0" />
                  {t('Pages.FeatureFlags.TryIt.variant')}:{' '}
                  <code className="font-mono text-foreground">
                    {result.variant}
                  </code>
                </div>
              )}

              {result.metadata && Object.keys(result.metadata).length > 0 && (
                <div className="pt-2 border-t text-xs text-muted-foreground">
                  Metadata:{' '}
                  <code className="bg-background border rounded px-1 py-0.5 text-foreground">
                    {JSON.stringify(result.metadata)}
                  </code>
                </div>
              )}
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {t('Pages.FeatureFlags.TryIt.close')}
          </Button>
          <Button
            onClick={handleEvaluate}
            disabled={evaluateMutation.isPending}
            className="gap-2"
          >
            {evaluateMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t('Pages.FeatureFlags.TryIt.evaluating')}
              </>
            ) : (
              <>
                <FlaskConical className="size-4" />
                {t('Pages.FeatureFlags.TryIt.evaluate')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
