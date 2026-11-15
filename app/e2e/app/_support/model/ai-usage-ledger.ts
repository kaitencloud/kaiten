import type {
  AiInferenceRefund,
  ListAiInferencesData,
  NewAiInferenceRefund,
  User,
} from '@/api-client';
import {
  refundAmountIssue,
  refundableCredits,
} from '@/domains/ai-credits/pricing';
import { addDecimalStrings } from '@/lib/decimal';
import { type AiInferenceRecord, refundId } from '../fixtures/build-ai-usage';
import { BillingProblem } from './billing-problem';

/**
 * The inference history of the mocks as the API reads and corrects it: the
 * filters of `listAiInferences` and the refund of a charge, with the codes and
 * statuses of the API. Pure functions over the rows; the model owns the state.
 */

type InferenceQuery = NonNullable<ListAiInferencesData['query']>;

/** A release that closed no reservation: kept, and hidden unless asked for. */
const isTombstone = (row: AiInferenceRecord) =>
  row.status === 'RELEASED' && row.warnings.includes('NO_RESERVATION');

/** Whether a row passes the filters of the API, dates aside. */
export function matchesInferenceQuery(
  row: AiInferenceRecord,
  query: InferenceQuery,
): boolean {
  if (
    isTombstone(row) &&
    query.status !== 'RELEASED' &&
    query.transactionId === undefined
  ) {
    return false;
  }
  if (query.status && row.status !== query.status) return false;
  if (query.transactionId && row.transactionId !== query.transactionId) {
    return false;
  }
  // An operation still RESERVED is neither authorized nor refused.
  if (
    query.authorized !== undefined &&
    (row.authorized === undefined ||
      row.status === 'RESERVED' ||
      String(row.authorized) !== query.authorized)
  ) {
    return false;
  }
  if (query.modelSlug && row.modelSlug !== query.modelSlug) return false;
  if (query.model && row.model !== query.model) return false;

  return !query.requestType || row.requestType === query.requestType;
}

export type RefundKey = {
  body: string;
  refund: AiInferenceRefund;
  transactionId: string;
};

const problem = (
  status: number,
  code: string,
  detail: string,
  value?: string,
) =>
  new BillingProblem(
    status,
    `RefundAiInference.${code}`,
    detail,
    value === undefined
      ? {}
      : { errors: [{ location: 'body.credits', message: detail, value }] },
  );

const KEY = /^[A-Za-z0-9._:-]{1,128}$/;

export type RefundRequest = {
  body: NewAiInferenceRefund;
  by: User;
  idempotencyKey: string | null;
  /** The keys the pool has seen, by key. */
  keys: Record<string, RefundKey>;
  now: string;
  /** Whether the instance still holds the pool. */
  poolGranted: boolean;
  /** The rows of the instance's pool; empty when the pair does not exist. */
  rows: AiInferenceRecord[];
  transactionId: string;
};

/**
 * Refunds a charge as `refundAiInference` does: the checks in the API's order,
 * then a refund appended to the row and `credits.refunded` raised. A key
 * replayed with the same request answers the first refund and moves nothing.
 */
export function refundInference({
  body,
  by,
  idempotencyKey,
  keys,
  now,
  poolGranted,
  rows,
  transactionId,
}: RefundRequest): { refund: AiInferenceRefund; replayed: boolean } {
  if (!rows.length) {
    throw problem(404, 'ContextNotFound', 'instance or credit pool not found');
  }
  if (idempotencyKey === null) {
    throw problem(422, 'IdempotencyKeyRequired', 'Idempotency-Key is required');
  }
  if (!KEY.test(idempotencyKey)) {
    throw problem(422, 'InvalidIdempotencyKey', 'invalid Idempotency-Key');
  }
  if (body.reason !== undefined && !/^.{1,500}$/su.test(body.reason)) {
    throw problem(422, 'InvalidReason', 'reason must be 1 to 500 characters');
  }
  const row = rows.find((item) => item.transactionId === transactionId);
  if (!row) {
    throw problem(404, 'InferenceNotFound', 'inference not found');
  }
  const fingerprint = JSON.stringify([
    body.credits ?? null,
    body.reason ?? null,
  ]);
  const seen = keys[idempotencyKey];
  if (seen) {
    if (seen.transactionId !== transactionId || seen.body !== fingerprint) {
      throw problem(
        409,
        'IdempotencyKeyReused',
        'idempotency key already used for another refund',
      );
    }
    return { refund: seen.refund, replayed: true };
  }
  if (row.status !== 'COMMITTED') {
    throw problem(409, 'NotCommitted', 'inference is not committed');
  }
  const left = refundableCredits(row.credits);
  if (left === '0') {
    throw problem(409, 'NothingToRefund', 'nothing is left to refund');
  }
  const credits = body.credits ?? left;
  const issue = refundAmountIssue(credits, left);
  if (issue === 'INVALID') {
    throw problem(422, 'InvalidAmount', 'credits must be a positive decimal');
  }
  if (issue === 'EXCEEDS') {
    throw problem(
      409,
      'ExceedsRefundable',
      'refund exceeds what is left to refund',
      left,
    );
  }
  if (!poolGranted) {
    throw problem(
      409,
      'PoolNotGranted',
      'the instance no longer holds this credit pool',
    );
  }
  const highest = Math.max(
    0,
    ...rows.flatMap((item) => [
      item.reportSeq ?? 0,
      ...item.refunds.map((refund) => refund.reportSeq),
    ]),
  );
  const refund: AiInferenceRefund = {
    createdAt: now,
    createdBy: by,
    credits,
    id: refundId(highest + 1),
    ...(body.reason === undefined ? {} : { reason: body.reason }),
    reportSeq: highest + 1,
  };
  row.refunds = [...row.refunds, refund];
  row.credits = {
    ...row.credits,
    refunded: addDecimalStrings(row.credits.refunded ?? '0', credits),
  };
  keys[idempotencyKey] = { body: fingerprint, refund, transactionId };

  return { refund, replayed: false };
}
