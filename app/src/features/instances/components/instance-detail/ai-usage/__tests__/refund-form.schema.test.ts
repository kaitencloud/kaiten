import { describe, expect, it } from 'vite-plus/test';
import { refundBodyOf, refundFormSchema } from '../receipt/refund-form.schema';

const issuesOf = (values: { credits: string; reason: string }, refundable = '48.5') => {
  const result = refundFormSchema(refundable).safeParse(values);

  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

describe('the refund form', () => {
  it('accepts an amount up to what is left, the whole of it included', () => {
    expect(issuesOf({ credits: '48.5', reason: '' })).toEqual([]);
    expect(issuesOf({ credits: ' 3.5 ', reason: 'duplicate call' })).toEqual([]);
  });

  it('refuses more than what is left, and what is not a positive decimal', () => {
    expect(issuesOf({ credits: '48.6', reason: '' })).toEqual(['AI.Receipt.refund.amountExceeds']);
    expect(issuesOf({ credits: '0', reason: '' })).toEqual(['AI.Receipt.refund.amountInvalid']);
    expect(issuesOf({ credits: '', reason: '' })).toEqual(['AI.Receipt.refund.amountInvalid']);
    expect(issuesOf({ credits: '1.0000001', reason: '' })).toEqual(['AI.Receipt.refund.amountInvalid']);
  });

  it('refuses a reason over 500 characters', () => {
    expect(issuesOf({ credits: '1', reason: 'x'.repeat(500) })).toEqual([]);
    expect(issuesOf({ credits: '1', reason: 'x'.repeat(501) })).toEqual(['AI.Receipt.refund.reasonTooLong']);
  });

  it('reads a decimal comma as a point, and sends the amount as the API takes it', () => {
    expect(issuesOf({ credits: '48,5', reason: '' })).toEqual([]);
    expect(refundBodyOf({ credits: ' 8,5 ', reason: '  ' })).toEqual({ credits: '8.5', reason: undefined });
    expect(refundBodyOf({ credits: '8.5', reason: ' goodwill ' })).toEqual({ credits: '8.5', reason: 'goodwill' });
  });

  it('takes what the API takes: six decimals and twelve integer digits once written canonically', () => {
    // Seven digits typed, six or fewer that count: the API would refuse it as written.
    expect(issuesOf({ credits: '1.5000000', reason: '' })).toEqual([]);
    expect(refundBodyOf({ credits: '1.5000000', reason: '' }).credits).toBe('1.5');
    expect(refundBodyOf({ credits: '08,50', reason: '' }).credits).toBe('8.5');
    expect(issuesOf({ credits: '1.0000001', reason: '' })).toEqual(['AI.Receipt.refund.amountInvalid']);
    expect(issuesOf({ credits: '1234567890123', reason: '' }, '9999999999999')).toEqual(['AI.Receipt.refund.amountInvalid']);
    expect(issuesOf({ credits: '123456789012', reason: '' }, '9999999999999')).toEqual([]);
    expect(issuesOf({ credits: '-1', reason: '' })).toEqual(['AI.Receipt.refund.amountInvalid']);
    expect(issuesOf({ credits: '1.', reason: '' })).toEqual(['AI.Receipt.refund.amountInvalid']);
  });
});
