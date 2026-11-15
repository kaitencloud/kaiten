import { Link } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Entitlement } from '@/api-client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PricingChip } from './pricing-chip';

/** No credit pool exists: the rate card has nothing to price. */
export function NoPoolState({ canCreate }: { canCreate: boolean }) {
  const { t } = useTranslation();

  return (
    <section className="rounded-xl border bg-card p-6">
      <h2 className="text-base font-semibold">
        {t('AI.Pricing.empty.noPoolTitle')}
      </h2>
      <p className="mt-1 max-w-prose text-sm text-muted-foreground">
        {t('AI.Pricing.empty.noPoolBody')}
      </p>
      {canCreate ? (
        <Button
          className="mt-4"
          nativeButton={false}
          render={<Link to="/catalog/entitlements/new" />}
          size="sm"
        >
          {t('AI.Pricing.empty.newPool')}
        </Button>
      ) : null}
    </section>
  );
}

type StepProps = {
  action: ReactNode;
  body: string;
  done: boolean;
  index: number;
  next: boolean;
  title: string;
};

function Step({ action, body, done, index, next, title }: StepProps) {
  return (
    <li
      aria-current={next ? 'step' : undefined}
      className={cn(
        'flex flex-col gap-1.5 rounded-lg border bg-card p-3',
        next && 'border-primary ring-1 ring-primary',
      )}
    >
      <span
        className={cn(
          'grid size-6 place-items-center rounded-full text-xs font-bold',
          done ? 'bg-success text-success-foreground' : 'bg-secondary',
        )}
      >
        {done ? <Check aria-hidden="true" className="size-3.5" /> : index + 1}
      </span>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-xs text-muted-foreground">{body}</p>
      <div className="mt-auto pt-1">{action}</div>
    </li>
  );
}

type PoolSetupProps = {
  activeModels: number;
  /** Adds the first rule; absent when the session may not write rules. */
  onAddWildcard: (() => void) | undefined;
  grantingVersions: number;
  liveVersions: number;
  modelCount: number;
  pool: Entitlement;
  typeLabel: string;
};

/**
 * A pool that nothing prices yet: the short list of what makes it chargeable,
 * each step with a link to the screen that does it today.
 */
export function PoolSetup(props: PoolSetupProps) {
  const { t } = useTranslation();
  const { pool } = props;
  const done = [props.modelCount > 0, true, props.grantingVersions > 0, false];
  const next = done.indexOf(false);
  const steps: Omit<StepProps, 'index' | 'next' | 'done'>[] = [
    {
      title: t('AI.Pricing.empty.steps.models.title'),
      body: t('AI.Pricing.empty.steps.models.body', {
        active: props.activeModels,
        count: props.modelCount,
      }),
      action: (
        <Button
          nativeButton={false}
          render={<Link to="/ai/models" />}
          size="sm"
          variant="outline"
        >
          {t('AI.Pricing.empty.steps.models.action')}
        </Button>
      ),
    },
    {
      title: t('AI.Pricing.empty.steps.pool.title'),
      body: t('AI.Pricing.empty.steps.pool.body', {
        name: pool.name,
        slug: pool.slug,
      }),
      action: (
        <PricingChip tone="success">
          <Check aria-hidden="true" className="size-3" />
          {t('AI.Pricing.empty.steps.pool.done')}
        </PricingChip>
      ),
    },
    {
      title: t('AI.Pricing.empty.steps.grant.title'),
      body: t('AI.Pricing.empty.steps.grant.body', {
        granted: props.grantingVersions,
        total: props.liveVersions,
      }),
      action: (
        <Button
          nativeButton={false}
          render={
            <Link
              params={{ entitlementSlug: pool.slug ?? '' }}
              to="/catalog/entitlements/$entitlementSlug/licenses"
            />
          }
          size="sm"
          variant="outline"
        >
          {t('AI.Pricing.empty.steps.grant.action')}
        </Button>
      ),
    },
    {
      title: t('AI.Pricing.empty.steps.price.title'),
      body: t('AI.Pricing.empty.steps.price.body'),
      action: props.onAddWildcard ? (
        <Button onClick={props.onAddWildcard} size="sm" type="button">
          {t('AI.Pricing.empty.steps.price.action', { type: props.typeLabel })}
        </Button>
      ) : null,
    },
  ];

  function renderStep(step: (typeof steps)[number], index: number) {
    return (
      <Step
        {...step}
        done={done[index] ?? false}
        index={index}
        key={step.title}
        next={index === next}
      />
    );
  }

  return (
    <section
      aria-labelledby="ai-pricing-setup"
      className="rounded-xl border bg-card p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold" id="ai-pricing-setup">
            {t('AI.Pricing.empty.setupTitle', { pool: pool.name })}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t('AI.Pricing.empty.setupBody')}
          </p>
        </div>
        <PricingChip tone="warning">
          {t('AI.Pricing.empty.progress', {
            done: done.filter(Boolean).length,
            total: done.length,
          })}
        </PricingChip>
      </div>
      <ol className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] gap-2.5">
        {steps.map(renderStep)}
      </ol>
    </section>
  );
}
