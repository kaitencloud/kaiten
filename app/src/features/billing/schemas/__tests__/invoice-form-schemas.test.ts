import { describe, expect, it, vi } from 'vite-plus/test';
import { dateTimeInputToInstant } from '@/lib/date-time-input';
import {
  acknowledgeHandoffFormSchema,
  acknowledgeHandoffValuesToBody,
  initialAcknowledgeHandoffValues,
} from '../acknowledge-handoff.schema';
import { EXTERNAL_REFERENCE_MAX_LENGTH } from '../external-reference';
import { REASON_MAX_LENGTH } from '@/domains/billing';
import {
  initialMarkPaidValues,
  markPaidFormSchema,
  markPaidValuesToBody,
} from '../mark-paid.schema';
import {
  releaseHoldFormSchema,
  releaseHoldValuesToBody,
} from '../release-hold.schema';
import { voidFormSchema, voidValuesToBody } from '../void.schema';
import {
  writeOffFormSchema,
  writeOffValuesToBody,
} from '../write-off.schema';

const messagesOf = (result: { error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((issue) => issue.message) ?? [];

describe.each([
  ['releasing a hold', releaseHoldFormSchema, releaseHoldValuesToBody],
  ['writing an invoice off', writeOffFormSchema, writeOffValuesToBody],
  ['voiding an invoice', voidFormSchema, voidValuesToBody],
] as const)('the reason of %s', (_name, schema, toBody) => {
  it('is required: nothing is accepted without one', () => {
    expect(messagesOf(schema.safeParse({ reason: '' }))).toEqual([
      'Features.Billing.Reason.Errors.required',
    ]);
  });

  it('is not spaces alone', () => {
    expect(schema.safeParse({ reason: '   \n ' }).success).toBe(false);
  });

  it('takes up to the number of characters the API counts, and no more', () => {
    expect(
      schema.safeParse({ reason: 'x'.repeat(REASON_MAX_LENGTH) }).success,
    ).toBe(true);
    expect(
      messagesOf(schema.safeParse({ reason: 'x'.repeat(REASON_MAX_LENGTH + 1) })),
    ).toEqual(['Features.Billing.Reason.Errors.tooLong']);
  });

  it('is sent trimmed', () => {
    expect(toBody({ reason: '  Accepted after the audit  ' })).toEqual({
      reason: 'Accepted after the audit',
    });
  });
});

describe('marking an invoice paid', () => {
  it('asks for nothing: a payment recorded with nothing else is paid now', () => {
    expect(markPaidFormSchema.safeParse(initialMarkPaidValues).success).toBe(true);
    expect(markPaidValuesToBody(initialMarkPaidValues)).toEqual({
      externalReference: undefined,
      note: undefined,
      paidAt: undefined,
    });
  });

  it('sends only what was filled in, trimmed', () => {
    expect(
      markPaidValuesToBody({
        externalReference: '  ERP-1042 ',
        note: ' wire transfer ',
        paidAt: '2027-03-03T10:00',
      }),
    ).toEqual({
      externalReference: 'ERP-1042',
      note: 'wire transfer',
      paidAt: '2027-03-03T10:00:00.000Z',
    });
  });

  it('refuses a reference longer than the API takes', () => {
    const values = { ...initialMarkPaidValues };

    expect(
      markPaidFormSchema.safeParse({
        ...values,
        externalReference: 'x'.repeat(EXTERNAL_REFERENCE_MAX_LENGTH),
      }).success,
    ).toBe(true);
    expect(
      messagesOf(
        markPaidFormSchema.safeParse({
          ...values,
          externalReference: 'x'.repeat(EXTERNAL_REFERENCE_MAX_LENGTH + 1),
        }),
      ),
    ).toEqual(['Features.Billing.MarkPaid.Errors.referenceTooLong']);
  });

  it('refuses a note that is too long', () => {
    expect(
      messagesOf(
        markPaidFormSchema.safeParse({
          ...initialMarkPaidValues,
          note: 'x'.repeat(1001),
        }),
      ),
    ).toEqual(['Features.Billing.MarkPaid.Errors.noteTooLong']);
  });

  describe('the time of the payment', () => {
    it('is read as UTC, as every billing time is', () => {
      expect(dateTimeInputToInstant('2027-03-03T10:00')).toBe(
        '2027-03-03T10:00:00.000Z',
      );
      expect(dateTimeInputToInstant('2027-03-03T10:00:30')).toBe(
        '2027-03-03T10:00:30.000Z',
      );
    });

    it.each(['', 'yesterday', '2027-13-45T10:00', '2027-03-03'])(
      'is no time when it reads %j',
      (value) => {
        expect(dateTimeInputToInstant(value)).toBeNull();
      },
    );

    it('is refused when it is not a date', () => {
      expect(
        messagesOf(
          markPaidFormSchema.safeParse({
            ...initialMarkPaidValues,
            paidAt: 'tomorrow',
          }),
        ),
      ).toContain('Features.Billing.MarkPaid.Errors.paidAtInvalid');
    });

    it('is refused in the future: a payment is recorded once it happened', () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date('2027-03-03T12:00:00.000Z'));

        expect(
          messagesOf(
            markPaidFormSchema.safeParse({
              ...initialMarkPaidValues,
              paidAt: '2027-03-03T12:01',
            }),
          ),
        ).toEqual(['Features.Billing.MarkPaid.Errors.paidAtInFuture']);
        expect(
          markPaidFormSchema.safeParse({
            ...initialMarkPaidValues,
            paidAt: '2027-03-03T12:00',
          }).success,
        ).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it('may be left empty, which means now', () => {
      expect(
        markPaidFormSchema.safeParse({ ...initialMarkPaidValues, paidAt: '' })
          .success,
      ).toBe(true);
    });
  });
});

describe('acknowledging a handoff by hand', () => {
  it('asks for nothing: the number of the accounting system is optional', () => {
    expect(
      acknowledgeHandoffFormSchema.safeParse(initialAcknowledgeHandoffValues)
        .success,
    ).toBe(true);
    expect(
      acknowledgeHandoffValuesToBody(initialAcknowledgeHandoffValues),
    ).toEqual({ externalReference: undefined });
  });

  it('sends the reference trimmed, and never a lease: this is not the consumer that claimed it', () => {
    const body = acknowledgeHandoffValuesToBody({ externalReference: ' ERP-7 ' });

    expect(body).toEqual({ externalReference: 'ERP-7' });
    expect(body).not.toHaveProperty('leaseId');
  });

  it('refuses a reference longer than the API takes', () => {
    expect(
      messagesOf(
        acknowledgeHandoffFormSchema.safeParse({
          externalReference: 'x'.repeat(EXTERNAL_REFERENCE_MAX_LENGTH + 1),
        }),
      ),
    ).toEqual(['Features.Billing.MarkPaid.Errors.referenceTooLong']);
  });
});
