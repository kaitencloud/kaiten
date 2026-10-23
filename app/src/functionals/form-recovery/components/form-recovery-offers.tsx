import { History, TriangleAlert } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FormRecovery, FormRecoveryOffer } from '../types';
import { useRecoveryText } from './use-recovery-text';

export type OfferProps = {
  recovery: FormRecovery<any, any>;
  stepLabels?: readonly string[];
  fieldLabels?: Partial<Record<string, string>>;
  children?: ReactNode;
};

export function Actions({ children }: { children: ReactNode }) {
  return (
    <div className="col-start-2 mt-2 flex flex-wrap items-center gap-2">
      {children}
    </div>
  );
}

/** The Alert has `role="alert"`; none of these is urgent, so they are statuses. */
export function StatusAlert({
  className,
  ...props
}: React.ComponentProps<typeof Alert>) {
  return <Alert role="status" className={cn('w-full', className)} {...props} />;
}

type OfferOf<K extends FormRecoveryOffer['kind']> = Extract<
  FormRecoveryOffer,
  { kind: K }
>;

function ResumableOffer({
  recovery,
  offer,
  stepLabels,
  fieldLabels,
}: OfferProps & {
  offer: OfferOf<'resumable'>;
}) {
  const text = useRecoveryText();
  const { t } = text;
  const descriptionId = useId();
  const when = text.when(offer.savedAt);
  const omitted = offer.omittedFilled.map(
    (path) => fieldLabels?.[path] ?? path,
  );

  return (
    <StatusAlert>
      <History aria-hidden="true" />
      <AlertTitle className="line-clamp-none">
        {t('Functionals.FormRecovery.offer.title')}
      </AlertTitle>
      <AlertDescription id={descriptionId}>
        <p>
          {offer.stepIndex !== undefined && offer.stepCount !== undefined
            ? t('Functionals.FormRecovery.offer.descriptionAtStep', {
                when,
                current: offer.stepIndex + 1,
                total: offer.stepCount,
                step: stepLabels?.[offer.stepIndex] ?? offer.stepIndex + 1,
              })
            : t('Functionals.FormRecovery.offer.description', { when })}
        </p>
        {omitted.length > 0 && (
          <p>
            {t('Functionals.FormRecovery.offer.omitted', {
              count: omitted.length,
              fields: text.list(omitted),
            })}
          </p>
        )}
        {offer.formChanged && (
          <p>{t('Functionals.FormRecovery.offer.formChanged')}</p>
        )}
        {offer.others > 0 && (
          <p>
            {t('Functionals.FormRecovery.offer.others', {
              count: offer.others,
            })}
          </p>
        )}
      </AlertDescription>
      <Actions>
        <Button
          data-form-recovery-resume=""
          type="button"
          size="sm"
          aria-describedby={descriptionId}
          onClick={recovery.resume}
        >
          {t('Functionals.FormRecovery.resume')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={recovery.startOver}
        >
          {t('Functionals.FormRecovery.startOver')}
        </Button>
        {offer.others > 0 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={recovery.showOther}
          >
            {t('Functionals.FormRecovery.offer.showOther', {
              count: offer.others,
            })}
          </Button>
        )}
      </Actions>
    </StatusAlert>
  );
}

function UncertainOffer({
  recovery,
  offer,
  children,
}: Pick<OfferProps, 'recovery' | 'children'> & {
  offer: OfferOf<'uncertain'>;
}) {
  const text = useRecoveryText();
  const { t } = text;
  const descriptionId = useId();

  return (
    <StatusAlert>
      <TriangleAlert aria-hidden="true" />
      <AlertTitle className="line-clamp-none">
        {t('Functionals.FormRecovery.uncertain.title')}
      </AlertTitle>
      <AlertDescription id={descriptionId}>
        <p>
          {t('Functionals.FormRecovery.uncertain.description', {
            date: text.date(offer.attemptedAt),
            time: text.time(offer.attemptedAt),
          })}
        </p>
      </AlertDescription>
      <Actions>
        {children}
        <Button
          data-form-recovery-resume=""
          type="button"
          size="sm"
          variant="outline"
          aria-describedby={descriptionId}
          onClick={recovery.resume}
        >
          {t('Functionals.FormRecovery.uncertain.resumeAnyway')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={recovery.startOver}
        >
          {t('Functionals.FormRecovery.uncertain.discard')}
        </Button>
      </Actions>
    </StatusAlert>
  );
}

function CondensedOffer({
  recovery,
  offer,
}: Pick<OfferProps, 'recovery'> & { offer: OfferOf<'condensed'> }) {
  const text = useRecoveryText();
  const { t } = text;

  return (
    <StatusAlert>
      <History aria-hidden="true" />
      <AlertDescription className="text-foreground">
        <p>
          {t('Functionals.FormRecovery.condensed.description', {
            when: text.when(offer.savedAt),
          })}
        </p>
      </AlertDescription>
      <Actions>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={recovery.restoreSetAside}
        >
          {t('Functionals.FormRecovery.condensed.restore')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => recovery.dismiss('condensed')}
        >
          {t('Functionals.FormRecovery.condensed.hide')}
        </Button>
      </Actions>
    </StatusAlert>
  );
}

export function Offer(props: OfferProps & { offer: FormRecoveryOffer }) {
  const { offer, children, ...rest } = props;
  switch (offer.kind) {
    case 'resumable':
      return <ResumableOffer {...rest} offer={offer} />;
    case 'uncertain':
      return (
        <UncertainOffer recovery={rest.recovery} offer={offer}>
          {children}
        </UncertainOffer>
      );
    case 'condensed':
      return <CondensedOffer recovery={rest.recovery} offer={offer} />;
  }
}
