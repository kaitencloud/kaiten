import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import {
  type PriceLine,
  type Priced,
  type PricingTerms,
  RATE_KEY_OF,
  type Specificity,
} from '../engine';
import { formatDateTime } from '@/lib/format-date';
import { formatCredits, formatRate } from '../format';
import {
  ReceiptCallout,
  ReceiptList,
  ReceiptRow,
  ReceiptSection,
} from './receipt-parts';
import type { ChangedTerms } from './receipt-terms';
import type { ReceiptView } from './receipt-view';

const RATE_ORDER = Object.values(RATE_KEY_OF);

/** What is said of a snapshot whose rule, today, calls for no warning. */
const SNAPSHOT_SENTENCE = {
  UNCHANGED: 'AI.Receipt.priced.snapshotUnchanged',
  SAME_TERMS: 'AI.Receipt.priced.snapshotSameToday',
  NOT_FOUND: 'AI.Receipt.priced.snapshot',
  UNREAD: 'AI.Receipt.priced.snapshotRuleUnread',
} as const;

function RuleRow({
  specificity,
  ruleId,
}: {
  specificity: Specificity | null;
  ruleId: string | null | undefined;
}) {
  const { t } = useTranslation();

  return (
    <ReceiptRow
      label={t('AI.Receipt.priced.rule')}
      note={ruleId ? <code className="break-all">{ruleId}</code> : undefined}
    >
      {specificity
        ? t(`AI.Receipt.priced.specificity.${specificity}`)
        : t('AI.Receipt.priced.noRule')}
    </ReceiptRow>
  );
}

/** "now 0.003" beside a term of the snapshot that the rule no longer has. */
function nowNote(
  t: ReturnType<typeof useTranslation>['t'],
  current: string | null | undefined,
  blankKey: string,
) {
  if (current === undefined) {
    return undefined;
  }

  return (
    <span className="text-warning-subtle-foreground">
      {current === null
        ? t(blankKey)
        : t('AI.Receipt.priced.now', { value: formatRate(current) })}
    </span>
  );
}

function renderRate(
  terms: PricingTerms,
  current: ChangedTerms | null,
  t: ReturnType<typeof useTranslation>['t'],
) {
  return function RateRow(key: (typeof RATE_ORDER)[number]) {
    const rate = terms.rates[key];
    const changed = current?.rates[key];
    // A rate the rule has gained since is shown too: it was not applied.
    if (rate == null && changed == null) {
      return null;
    }

    return (
      <ReceiptRow
        key={key}
        label={t(`AI.Receipt.priced.rates.${key}`)}
        note={nowNote(t, changed, 'AI.Receipt.priced.nowBlank')}
      >
        {rate == null ? '—' : formatRate(rate)}
      </ReceiptRow>
    );
  };
}

function renderLine(t: ReturnType<typeof useTranslation>['t']) {
  return function LineRow(line: PriceLine) {
    const label = t(`AI.Receipt.priced.lines.${line.dimension}`, {
      quantity: formatRate(line.quantity),
      rate: formatRate(line.rate),
    });

    return (
      <ReceiptRow
        key={line.dimension}
        mono
        label={label}
        note={
          line.rateSource === 'INPUT_FALLBACK'
            ? t('AI.Receipt.priced.inputFallback')
            : undefined
        }
      >
        {formatRate(line.credits)}
      </ReceiptRow>
    );
  };
}

/** The arithmetic of an applied rule: rates, lines, bounds, policy, charge. */
function Arithmetic({
  terms,
  price,
  view,
}: {
  terms: PricingTerms;
  price: Priced | null;
  view: ReceiptView;
}) {
  const current = view.currentTerms;
  const { t } = useTranslation();
  const { credits, requestStatus } = view.inference;
  const clamp = price?.clamp;

  return (
    <>
      <ReceiptList>{RATE_ORDER.map(renderRate(terms, current, t))}</ReceiptList>
      {price ? (
        <ReceiptList>{price.lines.map(renderLine(t))}</ReceiptList>
      ) : null}
      {price?.missingInput ? (
        <p className="text-xs text-muted-foreground">
          {t('AI.Receipt.priced.missingInput')}
        </p>
      ) : null}
      <ReceiptList>
        <ReceiptRow total label={t('AI.Receipt.priced.computed')}>
          {formatCredits(credits.computed)}
        </ReceiptRow>
        <ReceiptRow
          label={t('AI.Receipt.priced.bounds', {
            minimum: formatCredits(terms.minimumCreditsPerRequest),
            maximum:
              terms.maximumCreditsPerRequest == null
                ? t('AI.Receipt.priced.noMaximum')
                : formatCredits(terms.maximumCreditsPerRequest),
          })}
          note={
            current &&
            (current.minimumCreditsPerRequest !== undefined ||
              current.maximumCreditsPerRequest !== undefined) ? (
              <span className="text-warning-subtle-foreground">
                {[
                  current.minimumCreditsPerRequest === undefined
                    ? null
                    : t('AI.Receipt.priced.nowMinimum', {
                        value: formatCredits(current.minimumCreditsPerRequest),
                      }),
                  current.maximumCreditsPerRequest === undefined
                    ? null
                    : current.maximumCreditsPerRequest === null
                      ? t('AI.Receipt.priced.nowNoMaximum')
                      : t('AI.Receipt.priced.nowMaximum', {
                          value: formatCredits(
                            current.maximumCreditsPerRequest,
                          ),
                        }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            ) : undefined
          }
        >
          {
            // Whether a bound applied is only known from a recomputation.
            price === null
              ? '—'
              : clamp === 'MINIMUM'
                ? t('AI.Receipt.priced.raisedTo', {
                    amount: formatCredits(credits.charged),
                  })
                : clamp === 'MAXIMUM'
                  ? t('AI.Receipt.priced.loweredTo', {
                      amount: formatCredits(credits.charged),
                    })
                  : t('AI.Receipt.priced.within')
          }
        </ReceiptRow>
        {requestStatus && requestStatus !== 'SUCCESS' ? (
          <ReceiptRow
            label={t('AI.Receipt.priced.policy', {
              policy: t(`AI.Receipt.priced.policies.${terms.chargeOnError}`),
            })}
            note={
              current?.chargeOnError ? (
                <span className="text-warning-subtle-foreground">
                  {t('AI.Receipt.priced.now', {
                    value: t(
                      `AI.Receipt.priced.policies.${current.chargeOnError}`,
                    ),
                  })}
                </span>
              ) : undefined
            }
          >
            {price === null
              ? '—'
              : price.chargeable
                ? t('AI.Receipt.priced.chargedOutcome')
                : t('AI.Receipt.priced.notChargedOutcome')}
          </ReceiptRow>
        ) : null}
        <ReceiptRow total label={t('AI.Receipt.priced.charged')}>
          {t('AI.Receipt.priced.chargedValue', {
            amount: formatCredits(credits.charged),
          })}
        </ReceiptRow>
      </ReceiptList>
    </>
  );
}

/** What is stored when the arithmetic cannot be shown: the facts, nothing derived. */
function StoredFacts({ view }: { view: ReceiptView }) {
  const { t } = useTranslation();
  const { credits, conversionRuleId } = view.inference;

  return (
    <ReceiptList>
      <ReceiptRow label={t('AI.Receipt.priced.reserved')}>
        {formatCredits(credits.reserved)}
      </ReceiptRow>
      <ReceiptRow label={t('AI.Receipt.priced.computed')}>
        {formatCredits(credits.computed)}
      </ReceiptRow>
      <ReceiptRow total label={t('AI.Receipt.priced.charged')}>
        {t('AI.Receipt.priced.chargedValue', {
          amount: formatCredits(credits.charged),
        })}
      </ReceiptRow>
      <ReceiptRow label={t('AI.Receipt.priced.ruleId')} mono>
        {conversionRuleId ?? t('AI.Receipt.priced.noRule')}
      </ReceiptRow>
    </ReceiptList>
  );
}

/**
 * "How it was priced", by the receipt policy: the snapshot when the row stores
 * one; the rule as it is now only when it gives back exactly the stored
 * amounts; otherwise the stored facts and why nothing is re-derived.
 */
export function ReceiptPricing({ view }: { view: ReceiptView }) {
  const { t } = useTranslation();
  const { pricing } = view;
  if (!pricing) {
    return null;
  }
  if (pricing.kind === 'CANNOT_RECONSTRUCT') {
    const rule = pricing.rule;

    return (
      <ReceiptSection title={t('AI.Receipt.sections.priced')}>
        <ReceiptCallout>
          <p>{t('AI.Receipt.priced.cannot.intro')}</p>
          <p>
            {t(`AI.Receipt.priced.cannot.reasons.${pricing.reason}`, {
              date: formatDateTime(rule?.updatedAt, { timeZone: 'UTC' }),
              id: view.inference.conversionRuleId ?? '—',
              ruleVersion: rule?.licenseSlug ?? '—',
              version: view.licence?.slug ?? view.licence?.id ?? '—',
            })}
          </p>
        </ReceiptCallout>
        <StoredFacts view={view} />
      </ReceiptSection>
    );
  }
  const snapshot = pricing.kind === 'SNAPSHOT';
  const terms = snapshot ? pricing.snapshot : pricing.rule;
  const price = pricing.price.ok ? pricing.price : null;

  return (
    <ReceiptSection title={t('AI.Receipt.sections.priced')}>
      <ReceiptList>
        <RuleRow
          specificity={pricing.specificity}
          ruleId={snapshot ? pricing.snapshot.ruleId : pricing.rule.id}
        />
      </ReceiptList>
      {view.ruleToday === 'EDITED' || view.ruleToday === 'ARCHIVED' ? (
        <ReceiptCallout tone="warning">
          <Badge
            variant="outline"
            className="border-0 bg-background font-medium"
          >
            {t(
              view.ruleToday === 'EDITED'
                ? 'AI.Receipt.priced.editedSince'
                : 'AI.Receipt.priced.archivedSince',
            )}
          </Badge>
          <p>
            {t(
              view.ruleToday === 'EDITED'
                ? 'AI.Receipt.priced.editedSinceHelp'
                : 'AI.Receipt.priced.archivedSinceHelp',
            )}
          </p>
        </ReceiptCallout>
      ) : (
        <ReceiptCallout>
          <p>
            {view.ruleToday === null
              ? t('AI.Receipt.priced.matches')
              : t(SNAPSHOT_SENTENCE[view.ruleToday])}
          </p>
        </ReceiptCallout>
      )}
      {snapshot && !pricing.agreesWithStored ? (
        <ReceiptCallout tone="warning">
          <p>{t('AI.Receipt.priced.snapshotDisagrees')}</p>
        </ReceiptCallout>
      ) : null}
      <Arithmetic terms={terms} price={price} view={view} />
    </ReceiptSection>
  );
}
