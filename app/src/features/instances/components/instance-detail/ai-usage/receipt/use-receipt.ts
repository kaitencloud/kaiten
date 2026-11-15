import { useQuery } from '@tanstack/react-query';
import {
  getConversionRuleOptions,
  getLicenseOptions,
  listAiInferencesOptions,
} from '@/api-client/@tanstack/react-query.gen';
import {
  modelsQueryOptions,
  useAiAccess,
  useLocalCreditValue,
} from '@/domains/ai-credits';
import { isForbiddenError, isNotFoundError } from '@/lib/errors';
import {
  buildReceiptView,
  type ReceiptPool,
  receiptRuleId,
} from './receipt-view';

type UseReceiptOptions = {
  instanceSlug: string;
  pool: ReceiptPool;
  transactionId: string;
};

/** The key of a receipt's row, which a refund clears. */
export function receiptRowOptions(
  instanceSlug: string,
  entitlementSlug: string,
  transactionId: string,
) {
  return listAiInferencesOptions({
    path: { instanceSlug, entitlementSlug },
    query: { transactionId },
  });
}

/**
 * The receipt of one transaction: its row, read by transaction id so that a
 * link opens it whether or not the feed has loaded that page; the rule it was
 * priced by, read on the licence version the row stores (the pool's current
 * one for an older row that stores none); the name of that version, where the
 * session may read licences; and the catalogue, for the model and its vendor
 * costs. A rule or a licence the API no longer finds is a fact of the receipt,
 * not an error.
 *
 * The row is all a receipt needs. The rule and the catalogue each ask for a
 * scope of their own (the generated table's, through `access.allows`): they
 * are asked only of a session that may read them, and a refusal (403) is "not
 * read", never a failed receipt. The stored facts are shown, and the view says
 * what could not be compared or named.
 */
export function useReceipt({
  instanceSlug,
  pool,
  transactionId,
}: UseReceiptOptions) {
  const access = useAiAccess();
  const row = useQuery({
    ...receiptRowOptions(instanceSlug, pool.slug, transactionId),
    select: (page) =>
      (page.items ?? []).find((item) => item.transactionId === transactionId) ??
      null,
  });
  const inference = row.data ?? null;
  const ruleId = inference ? receiptRuleId(inference) : null;
  // A row that names a licence by id alone lost it: nothing is read for it.
  const licenseSlug =
    inference?.licenseSlug ?? (inference?.licenseId ? null : pool.licenseSlug);
  const committed = inference?.status === 'COMMITTED';
  const wantsRule = committed && Boolean(ruleId && licenseSlug);
  const mayReadRule = access.allows('getConversionRule');
  const mayReadModels = access.allows('listModels');
  const rule = useQuery({
    ...getConversionRuleOptions({
      path: { licenseSlug: licenseSlug ?? '', ruleId: ruleId ?? '' },
    }),
    enabled: wantsRule && mayReadRule,
    retry: false,
  });
  // Only a name: its absence (no scope, licence gone) never fails the receipt.
  const licence = useQuery({
    ...getLicenseOptions({ path: { licenseSlug: licenseSlug ?? '' } }),
    enabled: Boolean(licenseSlug) && access.allows('getLicense'),
    retry: false,
    staleTime: 5 * 60_000,
  });
  const models = useQuery({ ...modelsQueryOptions, enabled: mayReadModels });
  const creditValue = useLocalCreditValue(pool.slug);
  const ruleMissing = rule.isError && isNotFoundError(rule.error);
  const ruleUnread =
    wantsRule &&
    !access.isPending &&
    (!mayReadRule || (rule.isError && isForbiddenError(rule.error)));
  const catalogueUnread =
    !access.isPending &&
    (!mayReadModels || (models.isError && isForbiddenError(models.error)));
  const ruleFailed = rule.isError && !ruleMissing && !ruleUnread;
  const modelsFailed = models.isError && !catalogueUnread;
  const ruleSettled = !wantsRule || rule.isSuccess || ruleMissing || ruleUnread;
  const error =
    row.error ??
    (ruleFailed ? rule.error : null) ??
    (modelsFailed ? models.error : null);
  const view =
    inference && ruleSettled && (models.data || catalogueUnread)
      ? buildReceiptView({
          inference,
          rule: ruleUnread ? null : (rule.data ?? null),
          ruleUnread,
          models: models.data?.items ?? [],
          catalogueUnread,
          pool,
          creditValue,
        })
      : null;

  return {
    error,
    licenceName: licence.data
      ? [licence.data.name, licence.data.versionName].filter(Boolean).join(' ')
      : null,
    models: models.data?.items ?? [],
    notFound: row.isSuccess && inference === null,
    isPending: !error && !view && !(row.isSuccess && inference === null),
    retry: () => {
      // A disabled query refetches when asked: only what failed is asked again.
      if (row.isError) void row.refetch();
      if (ruleFailed) void rule.refetch();
      if (modelsFailed) void models.refetch();
    },
    view,
  };
}
