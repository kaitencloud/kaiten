import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useQuery } from '@tanstack/react-query';
import { FlaskConical } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { testTargetingRule } from '@/api-client';
import type { TargetingRuleRehearsal } from '@/api-client';
import { allInstancesOptions } from '@/lib/api/all-pages-query-options';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const NO_INSTANCE = '__none__';

/**
 * A rehearsal of the rule being written: pick a situation, run the rule the
 * way an evaluation would, see whether it matched — and, more importantly,
 * see the facts the server computed, which is usually the answer to why.
 *
 * This is what turns "my rule is well-formed" into "my rule does what I
 * think": the lint can say a rule is legal, only a run can say it is right.
 */
export function CelTestDialog({ rule }: { rule: string }) {
  const { t } = useTranslation();
  const keyId = useId();
  const contextId = useId();
  const [open, setOpen] = useState(false);
  const [instanceSlug, setInstanceSlug] = useState(NO_INSTANCE);
  const [targetingKey, setTargetingKey] = useState('');
  const [contextJson, setContextJson] = useState('');
  const [contextError, setContextError] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [rehearsal, setRehearsal] = useState<TargetingRuleRehearsal | null>(
    null,
  );

  // Fetched only once the dialog opens: most rules are saved without ever
  // being rehearsed, and the list is only needed here.
  const { data: instancesPage } = useQuery({
    ...allInstancesOptions(),
    enabled: open,
  });
  const instances = instancesPage?.items ?? [];

  const run = async () => {
    let context: Record<string, unknown> = {};
    if (contextJson.trim() !== '') {
      try {
        context = JSON.parse(contextJson) as Record<string, unknown>;
        setContextError(false);
      } catch {
        setContextError(true);
        return;
      }
    } else {
      setContextError(false);
    }

    if (instanceSlug !== NO_INSTANCE) {
      context = {
        ...context,
        kaiten: {
          ...(context.kaiten as Record<string, unknown> | undefined),
          instanceSlug,
        },
      };
    }

    setIsRunning(true);
    try {
      const { data } = await testTargetingRule({
        body: { rule, targetingKey, context },
        throwOnError: true,
      });
      setRehearsal(data);
    } catch {
      setRehearsal(null);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* A disabled button swallows hover, so the reason sits on a wrapper. */}
      <span
        title={
          rule.trim() === ''
            ? t('Features.Targeting.Editor.testDisabledHint')
            : undefined
        }
      >
        <DialogTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground h-6 gap-1 px-1.5 text-xs"
              disabled={rule.trim() === ''}
            >
              <FlaskConical className="h-3.5 w-3.5" />
              {t('Features.Targeting.Editor.test')}
            </Button>
          }
        />
      </span>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('Features.Targeting.Editor.testTitle')}</DialogTitle>
          <DialogDescription>
            {t('Features.Targeting.Editor.testDescription')}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <code className="bg-muted block max-h-20 overflow-y-auto rounded p-2 text-xs break-words">
            {rule}
          </code>

          <div className="grid grid-cols-1 gap-2">
            <Label>{t('Features.Targeting.Editor.testInstance')}</Label>
            <Select
              items={[
                {
                  value: NO_INSTANCE,
                  label: t('Features.Targeting.Editor.testInstanceNone'),
                },
                ...instances
                  .filter(
                    (instance) =>
                      typeof instance.slug === 'string' && instance.slug !== '',
                  )
                  .map((instance) => ({
                    value: instance.slug!,
                    label: instance.name,
                  })),
              ]}
              value={instanceSlug}
              onValueChange={(value) => {
                if (value !== null) setInstanceSlug(value);
              }}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={t(
                    'Features.Targeting.Editor.testInstancePlaceholder',
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_INSTANCE}>
                  {t('Features.Targeting.Editor.testInstanceNone')}
                </SelectItem>
                {instances
                  .filter(
                    (
                      instance,
                    ): instance is typeof instance & { slug: string } =>
                      typeof instance.slug === 'string' && instance.slug !== '',
                  )
                  .map((instance) => (
                    <SelectItem key={instance.slug} value={instance.slug}>
                      {instance.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor={keyId}>
              {t('Features.Targeting.Editor.testTargetingKey')}
            </Label>
            <Input
              id={keyId}
              value={targetingKey}
              onChange={(event) => setTargetingKey(event.target.value)}
              placeholder={t(
                'Features.Targeting.Editor.testTargetingKeyPlaceholder',
              )}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={contextId}>
              {t('Features.Targeting.Editor.testContext')}
            </Label>
            <Textarea
              id={contextId}
              value={contextJson}
              onChange={(event) => setContextJson(event.target.value)}
              placeholder={t(
                'Features.Targeting.Editor.testContextPlaceholder',
              )}
              className="min-h-20 font-mono text-xs"
            />
            {contextError && (
              <p className="text-destructive-subtle-foreground text-xs">
                {t('Features.Targeting.Editor.testContextInvalid')}
              </p>
            )}
          </div>

          <Button type="button" onClick={run} disabled={isRunning}>
            {t('Features.Targeting.Editor.testRun')}
          </Button>

          {rehearsal && <RehearsalOutcome rehearsal={rehearsal} />}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function RehearsalOutcome({
  rehearsal,
}: {
  rehearsal: TargetingRuleRehearsal;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2 border-t pt-3">
      {!rehearsal.valid ? (
        <div>
          <p className="text-destructive-subtle-foreground text-sm font-medium">
            {t('Features.Targeting.Editor.testInvalidRule')}
          </p>
          <ul className="text-destructive-subtle-foreground mt-1 space-y-0.5 text-xs">
            {(rehearsal.issues ?? []).map((issue, index) => (
              <li key={index}>{issue.message}</li>
            ))}
          </ul>
        </div>
      ) : rehearsal.evaluationError ? (
        <div>
          <p className="text-sm font-medium">
            {t('Features.Targeting.Editor.testEvaluationError')}
          </p>
          <code className="text-muted-foreground mt-1 block text-xs break-words">
            {rehearsal.evaluationError}
          </code>
        </div>
      ) : (
        <p
          className={cn(
            'text-sm font-medium',
            rehearsal.matched
              ? 'text-primary-subtle-foreground'
              : 'text-muted-foreground',
          )}
        >
          {rehearsal.matched
            ? t('Features.Targeting.Editor.testMatched')
            : t('Features.Targeting.Editor.testNotMatched')}
        </p>
      )}

      <div>
        <p className="text-muted-foreground text-xs font-medium">
          {t('Features.Targeting.Editor.testFacts')}
        </p>
        <pre className="bg-muted mt-1 max-h-40 overflow-auto rounded p-2 text-xs">
          {JSON.stringify(rehearsal.facts ?? {}, null, 2)}
        </pre>
      </div>
    </div>
  );
}
