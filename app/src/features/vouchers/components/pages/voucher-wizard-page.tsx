import { useStore } from '@tanstack/react-form';
import { useNavigate } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Voucher } from '@/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProblemAlert } from '@/domains/billing';
import { Page } from '@/functionals/page';
import { ProgressStepper } from '@/functionals/progress-stepper';
import { dataModelIcons } from '@/lib/data-model-icons';
import { useVoucherForm } from '../../hooks/use-voucher-form';
import { useVoucherReferences } from '../../hooks/use-voucher-references';
import { boostLikeToFormValues, VOUCHER_STEPS } from '../../schemas';
import { EligibilityStep } from '../wizard/eligibility-step';
import { OfferStep } from '../wizard/offer-step';
import { PublishedView } from '../wizard/published-view';
import { ReviewStep } from '../wizard/review-step';
import { TypeStep } from '../wizard/type-step';
import { WizardFooter } from '../wizard/wizard-footer';

const STEP_LABEL_KEYS = {
  eligibility: 'Pages.Vouchers.Wizard.Steps.eligibility',
  offer: 'Pages.Vouchers.Wizard.Steps.offer',
  review: 'Pages.Vouchers.Wizard.Steps.review',
  type: 'Pages.Vouchers.Wizard.Steps.type',
} as const satisfies Record<(typeof VOUCHER_STEPS)[number], string>;

type VoucherWizardPageProps = {
  /** The discount a boost is made to go with: the new voucher starts from its duration, eligibility and limits. */
  boostFor?: Voucher;
  /** A draft being finished; a new voucher when left out. */
  draft?: Voucher;
};

/**
 * The wizard that makes a voucher, or finishes a draft: what it is, what it offers,
 * who may redeem it and how often, then a plain-language review that publishes it. The
 * code, once published, is shown and copied from the page that follows. Nothing here is
 * optimistic: the voucher exists once the API has accepted it.
 */
export function VoucherWizardPage({ boostFor, draft }: VoucherWizardPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const VoucherIcon = dataModelIcons.voucher;
  // Where the wizard starts is decided once, when it opens.
  const [start] = useState(() =>
    boostFor
      ? {
          step: 1,
          values: boostLikeToFormValues(
            boostFor,
            t('Pages.Vouchers.Wizard.boostName', { name: boostFor.name }),
          ),
        }
      : undefined,
  );
  const wizard = useVoucherForm({
    draft,
    onDraftSaved: (saved) =>
      void navigate({
        params: { voucherId: saved.id },
        to: '/catalog/vouchers/$voucherId',
      }),
    start,
  });
  const { form } = wizard;
  const choosesPrices = useStore(
    form.store,
    (state) =>
      state.values.voucherType === 'PRICE' &&
      state.values.priceAppliesTo === 'SELECTED_PRICES',
  );
  const references = useVoucherReferences({
    startedByLoader: true,
    withPrices: choosesPrices,
  });
  const stepName = VOUCHER_STEPS[wizard.step];
  const steps = VOUCHER_STEPS.map((id) => ({
    id,
    label: t(STEP_LABEL_KEYS[id]),
  }));

  if (wizard.published) {
    return (
      <PublishedView
        names={references.names}
        onAnother={wizard.restart}
        voucher={wizard.published}
      />
    );
  }

  function renderStep() {
    switch (stepName) {
      case 'type':
        return <TypeStep form={form} />;
      case 'offer':
        return <OfferStep form={form} references={references} />;
      case 'eligibility':
        return <EligibilityStep form={form} references={references} />;
      case 'review':
        return <ReviewStep form={form} references={references} />;
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (stepName === 'review') {
      wizard.submit('publish');
    } else {
      wizard.next();
    }
  }

  return (
    <form
      className="flex h-full min-h-0 flex-col overflow-hidden"
      noValidate
      onSubmit={onSubmit}
    >
      <form.AppForm>
        <Page className="h-full min-h-0 flex-1 overflow-hidden">
          <Page.Header className="sticky top-0 z-20 bg-app-background pb-4">
            <Page.Leading>
              <Page.Icon>
                <VoucherIcon className="size-8 text-primary-subtle-foreground" />
              </Page.Icon>
              <Page.Heading>
                <Page.Title>
                  {t(
                    draft
                      ? 'Pages.Vouchers.Wizard.titleDraft'
                      : 'Pages.Vouchers.Wizard.title',
                  )}
                </Page.Title>
                <Page.Subtitle>
                  {t('Pages.Vouchers.Wizard.subtitle')}
                </Page.Subtitle>
              </Page.Heading>
            </Page.Leading>
          </Page.Header>
          <div className="flex min-h-0 flex-1 flex-col gap-6">
            <ProgressStepper
              activeStep={wizard.step}
              furthestStep={wizard.furthest}
              onStepChange={wizard.goTo}
              steps={steps}
            />
            <div className="min-h-0 flex-1 overflow-y-auto">
              <Card>
                <CardHeader>
                  <CardTitle>{steps[wizard.step].label}</CardTitle>
                </CardHeader>
                <CardContent>{renderStep()}</CardContent>
              </Card>
              {wizard.failure ? (
                <div className="mt-4 space-y-2">
                  <ProblemAlert error={wizard.failure} onRetry={wizard.retry} />
                  {wizard.saved ? (
                    <p className="text-sm text-muted-foreground">
                      {t('Pages.Vouchers.Wizard.draftKept')}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <WizardFooter
                isFirst={wizard.step === 0}
                isReview={stepName === 'review'}
                onBack={() => wizard.goTo(wizard.step - 1)}
                onSaveDraft={() => wizard.submit('draft')}
                submitting={wizard.submitting}
              />
            </div>
          </div>
        </Page>
      </form.AppForm>
    </form>
  );
}
