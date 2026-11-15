import { useTranslation } from 'react-i18next';
import { formatDateTime } from '@/lib/format-date';
import { formatCredits, formatWholeCredits } from '../format';
import { usageLabel } from '../usage-label';
import {
  ReceiptCallout,
  ReceiptList,
  ReceiptRow,
  ReceiptSection,
} from './receipt-parts';
import type { ReceiptView } from './receipt-view';

const UTC_TIME: Intl.DateTimeFormatOptions = {
  dateStyle: 'medium',
  timeStyle: 'medium',
  timeZone: 'UTC',
};

function LicenceRow({
  licence,
  name,
}: {
  licence: NonNullable<ReceiptView['licence']>;
  name?: string | null;
}) {
  const { t } = useTranslation();
  const note =
    licence.source === 'CURRENT'
      ? t('AI.Receipt.call.licenceCurrent')
      : licence.source === 'DELETED'
        ? t('AI.Receipt.call.licenceDeleted')
        : undefined;

  return (
    <ReceiptRow label={t('AI.Receipt.call.licence')} note={note}>
      {licence.source === 'DELETED' ? (
        <code className="break-all">{licence.id}</code>
      ) : (
        <>
          {name ? `${name} ` : null}
          <code className={name ? 'text-muted-foreground' : undefined}>
            {licence.slug}
          </code>
        </>
      )}
    </ReceiptRow>
  );
}

export function ReceiptCall({
  view,
  licenceName,
}: {
  view: ReceiptView;
  licenceName?: string | null;
}) {
  const { t } = useTranslation();
  const { inference, model, licence, pool } = view;
  const showUsage = view.kind === 'COMMITTED' || view.kind === 'RELEASED';

  return (
    <ReceiptSection title={t('AI.Receipt.sections.call')}>
      <ReceiptList>
        <ReceiptRow label={t('AI.Receipt.call.reportedAt')}>
          {formatDateTime(inference.reportedAt, UTC_TIME)} UTC
        </ReceiptRow>
        {inference.committedAt ? (
          <ReceiptRow label={t('AI.Receipt.call.committedAt')}>
            {formatDateTime(inference.committedAt, UTC_TIME)} UTC
          </ReceiptRow>
        ) : null}
        <ReceiptRow label={t('AI.Receipt.call.modelSent')}>
          <code className="break-all">{inference.model}</code>
        </ReceiptRow>
        <ReceiptRow
          label={t('AI.Receipt.call.resolvedTo')}
          note={
            view.catalogueUnread
              ? t('AI.Receipt.call.catalogueUnread')
              : view.knownSince
                ? t('AI.Receipt.call.knownSince')
                : view.matchedBy === 'EXTERNAL_ID'
                  ? t('AI.Receipt.call.matchedByExternalId')
                  : view.matchedBy === 'SLUG'
                    ? t('AI.Receipt.call.matchedBySlug')
                    : undefined
          }
        >
          {model ? (
            <>
              {model.name}{' '}
              <code className="text-muted-foreground">{model.slug}</code>
            </>
          ) : view.catalogueUnread ? (
            // The row stores the slug it resolved to; its name is the catalogue's.
            inference.modelSlug ? (
              <code className="break-all">{inference.modelSlug}</code>
            ) : (
              '—'
            )
          ) : (
            <span className="text-warning-subtle-foreground">
              {t('AI.Receipt.call.notInCatalogue')}
            </span>
          )}
        </ReceiptRow>
        <ReceiptRow label={t('AI.Receipt.call.pool')}>
          {pool.name} <code className="text-muted-foreground">{pool.slug}</code>
        </ReceiptRow>
        {licence ? <LicenceRow licence={licence} name={licenceName} /> : null}
        {showUsage ? (
          <ReceiptRow label={t('AI.Receipt.call.usage')}>
            {usageLabel(t, inference.usage)}
          </ReceiptRow>
        ) : null}
      </ReceiptList>
    </ReceiptSection>
  );
}

/** Why a call cost nothing, or what happened to a hold, in plain sentences. */
export function ReceiptOutcome({ view }: { view: ReceiptView }) {
  const { t } = useTranslation();
  const { inference, model } = view;
  if (view.kind === 'UNAUTHORIZED') {
    const reason = view.denialReason;
    const values = {
      // An unknown model is named as it was sent: that name is what was unknown.
      model:
        reason === 'UNKNOWN_MODEL'
          ? inference.model
          : (model?.name ?? inference.model),
      name: model?.name ?? '',
      pool: view.pool.name,
      type: t(`AI.Usage.requestTypes.${inference.requestType}`).toLowerCase(),
      version: view.licence?.slug ?? view.licence?.id ?? '—',
    };

    return (
      <ReceiptSection title={t('AI.Receipt.sections.notCharged')}>
        <ReceiptCallout tone="destructive">
          <p>
            {reason
              ? t(`AI.Receipt.denial.${reason}`, values)
              : t('AI.Receipt.denial.generic')}
          </p>
          <p>{t('AI.Receipt.denial.recorded')}</p>
        </ReceiptCallout>
        {reason ? (
          <p className="text-sm text-muted-foreground">
            {view.knownSince
              ? t('AI.Receipt.denial.knownSince', values)
              : t(`AI.Receipt.denial.fix.${reason}`, values)}
          </p>
        ) : null}
      </ReceiptSection>
    );
  }
  if (view.kind === 'COMMITTED') {
    return null;
  }
  const time = {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
  } as const;

  return (
    <ReceiptSection title={t('AI.Receipt.sections.happened')}>
      <ReceiptCallout>
        <p>
          {view.kind === 'EXPIRED'
            ? t('AI.Receipt.happened.expired', {
                amount: formatCredits(inference.credits.reserved),
                expiresAt: formatDateTime(inference.expiresAt, time),
                reportedAt: formatDateTime(inference.reportedAt, time),
              })
            : view.kind === 'OPEN'
              ? t('AI.Receipt.happened.open', {
                  amount: formatCredits(inference.credits.reserved),
                  expiresAt: formatDateTime(inference.expiresAt, UTC_TIME),
                })
              : view.warnings.includes('NO_RESERVATION')
                ? t('AI.Receipt.happened.noReservation')
                : t('AI.Receipt.happened.released')}
        </p>
      </ReceiptCallout>
    </ReceiptSection>
  );
}

export function ReceiptEffect({ view }: { view: ReceiptView }) {
  const { t } = useTranslation();
  const { inference, effect, pool } = view;
  const counterOf = (value: number | undefined) =>
    pool.maximum == null
      ? formatCredits(value)
      : t('AI.Receipt.pool.counterOf', {
          value: formatCredits(value),
          maximum: formatWholeCredits(pool.maximum),
        });
  if (view.kind === 'UNAUTHORIZED') {
    return (
      <ReceiptSection title={t('AI.Receipt.sections.pool')}>
        <ReceiptList>
          <ReceiptRow label={t('AI.Receipt.pool.reservation')}>
            {t('AI.Receipt.pool.nothingHeld')}
          </ReceiptRow>
          <ReceiptRow label={t('AI.Receipt.pool.counter')}>
            {t('AI.Receipt.pool.unchanged')}
          </ReceiptRow>
        </ReceiptList>
      </ReceiptSection>
    );
  }

  return (
    <ReceiptSection title={t('AI.Receipt.sections.pool')}>
      <ReceiptList>
        <ReceiptRow label={t('AI.Receipt.pool.reserved')}>
          {formatCredits(effect.reserved)}
        </ReceiptRow>
        {view.kind === 'OPEN' ? (
          <ReceiptRow label={t('AI.Receipt.pool.held')}>
            {formatDateTime(inference.expiresAt, UTC_TIME)}
          </ReceiptRow>
        ) : effect.drawnAbove ? (
          <ReceiptRow label={t('AI.Receipt.pool.drawnAbove')}>
            {formatCredits(effect.drawnAbove)}
          </ReceiptRow>
        ) : effect.givenBack ? (
          <ReceiptRow label={t(`AI.Receipt.pool.givenBack.${view.kind}`)}>
            {formatCredits(effect.givenBack)}
          </ReceiptRow>
        ) : null}
        {inference.valueBefore != null ? (
          <ReceiptRow label={t('AI.Receipt.pool.counterBefore')}>
            {formatCredits(inference.valueBefore)}
          </ReceiptRow>
        ) : null}
        {inference.valueAfter != null ? (
          <ReceiptRow total label={t('AI.Receipt.pool.counterAfter')}>
            {counterOf(inference.valueAfter)}
          </ReceiptRow>
        ) : null}
        {view.refund && view.refund.refunds.length > 0 ? (
          <ReceiptRow label={t('AI.Receipt.pool.refunded')}>
            {formatCredits(view.refund.refunded)}
          </ReceiptRow>
        ) : null}
        {inference.reportSeq != null ? (
          <ReceiptRow label={t('AI.Receipt.pool.reportSeq')}>
            {inference.reportSeq}
          </ReceiptRow>
        ) : null}
      </ReceiptList>
    </ReceiptSection>
  );
}
