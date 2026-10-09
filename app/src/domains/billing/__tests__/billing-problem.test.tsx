import type { AnyFormApi } from '@tanstack/react-form';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { describe, expect, it } from 'vite-plus/test';
import { useAppForm } from '@/hooks/form';
import { ApiError } from '@/lib/errors';
import {
  applyProblemFieldErrors,
  DEFAULT_RETRY_AFTER_MS,
  getProblemCode,
  getRetryAfterMs,
  handleBillingProblem,
  setProblemFieldError,
} from '../logic';

const apiError = (
  status: number,
  data: unknown,
  headers: Record<string, string> = {},
) =>
  new ApiError({
    data,
    response: new Response(null, { headers, status }),
    status,
  });

describe('getProblemCode', () => {
  it('reads the code of the problem an ApiError carries', () => {
    expect(
      getProblemCode(
        apiError(409, { code: 'SubscribeInstance.AlreadySubscribed', detail: 'x' }),
      ),
    ).toBe('SubscribeInstance.AlreadySubscribed');
  });

  it('reads the code of a bare problem document', () => {
    expect(getProblemCode({ code: 'Billing.Disabled', status: 403 })).toBe(
      'Billing.Disabled',
    );
  });

  it('has none for anything else', () => {
    expect(getProblemCode(new Error('boom'))).toBeUndefined();
    expect(getProblemCode(apiError(500, 'gateway timeout'))).toBeUndefined();
    expect(getProblemCode(undefined)).toBeUndefined();
  });
});

describe('getRetryAfterMs', () => {
  it('reads Retry-After as seconds', () => {
    expect(getRetryAfterMs(apiError(409, {}, { 'Retry-After': '30' }))).toBe(30_000);
  });

  it('reads Retry-After as an HTTP date', () => {
    const now = Date.parse('2027-03-01T10:00:00Z');

    expect(
      getRetryAfterMs(
        apiError(409, {}, { 'Retry-After': 'Mon, 01 Mar 2027 10:00:45 GMT' }),
        now,
      ),
    ).toBe(45_000);
  });

  it('waits a minute when the stack sends no header, as it does today', () => {
    expect(getRetryAfterMs(apiError(409, {}))).toBe(DEFAULT_RETRY_AFTER_MS);
    expect(DEFAULT_RETRY_AFTER_MS).toBe(60_000);
    expect(getRetryAfterMs(new Error('network'))).toBe(DEFAULT_RETRY_AFTER_MS);
    expect(getRetryAfterMs(apiError(409, {}, { 'Retry-After': 'soon' }))).toBe(
      DEFAULT_RETRY_AFTER_MS,
    );
  });

  it('does not park a screen for an hour on a wrong header', () => {
    expect(getRetryAfterMs(apiError(409, {}, { 'Retry-After': '3600' }))).toBe(
      300_000,
    );
  });
});

describe('handleBillingProblem', () => {
  it('shows the detail of a problem as the API wrote it', () => {
    const problem = handleBillingProblem(
      apiError(422, {
        code: 'SubscribeInstance.StartAtTooEarly',
        detail: 'startAt must be on or after 2027-02-01T10:00:00Z',
        errorId: 'trace-1',
        status: 422,
        title: 'Unprocessable Entity',
      }),
    );

    expect(problem).toMatchObject({
      code: 'SubscribeInstance.StartAtTooEarly',
      detail: 'startAt must be on or after 2027-02-01T10:00:00Z',
      kind: 'generic',
      status: 422,
      traceId: 'trace-1',
    });
  });

  it('keeps no detail for a problem that gave none, rather than its title', () => {
    expect(
      handleBillingProblem(
        apiError(422, { code: 'X.Y', status: 422, title: 'Unprocessable Entity' }),
      ).detail,
    ).toBeUndefined();
  });

  it('reads a failure that is not a problem document by its message', () => {
    expect(handleBillingProblem(new Error('boom'))).toMatchObject({
      detail: 'boom',
      kind: 'generic',
    });
    expect(
      handleBillingProblem(new ApiError({ data: new TypeError('Failed to fetch') }))
        .kind,
    ).toBe('generic');
  });

  it('never shows what a gateway answered with, only what its status says', () => {
    const page = '<html><body><h1>502 Bad Gateway</h1></body></html>';

    const problem = handleBillingProblem(apiError(502, page));

    expect(problem).toMatchObject({
      detail: 'Errors.api.SERVER_ERROR',
      kind: 'generic',
      status: 502,
    });
    expect(JSON.stringify(problem)).not.toContain('Bad Gateway');
  });

  it('reads a plain-text 503 as a refusal that changed nothing, without its text', () => {
    const problem = handleBillingProblem(
      apiError(503, 'upstream connect error or disconnect/reset before headers'),
    );

    expect(problem).toMatchObject({
      detail: 'Errors.api.SERVER_ERROR',
      kind: 'transient',
    });
  });

  it('says the network could not be reached when there was no response', () => {
    expect(
      handleBillingProblem(new ApiError({ data: new TypeError('Failed to fetch') })),
    ).toMatchObject({ detail: 'Errors.api.NETWORK', kind: 'generic' });
  });

  it('names the scope a 403 asks for', () => {
    expect(
      handleBillingProblem(
        apiError(403, {
          code: 'Auth.MissingScope',
          detail: 'missing required scope: write:billing',
          status: 403,
        }),
      ),
    ).toMatchObject({ kind: 'missing-scope', missingScope: 'write:billing' });
  });

  it.each([
    ['Billing.Disabled', 'DEPLOYMENT_DISABLED'],
    ['Billing.NotEntitled', 'NOT_ENTITLED'],
  ] as const)('reads %s as billing being off, not as an error', (code, reason) => {
    expect(
      handleBillingProblem(apiError(403, { code, detail: 'x', status: 403 })),
    ).toMatchObject({ kind: 'unavailable', unavailableReason: reason });
  });

  it('says nothing was changed on a 503, and which side is down', () => {
    expect(
      handleBillingProblem(
        apiError(503, { code: 'Billing.EntitlementCheckUnavailable', status: 503 }),
      ),
    ).toMatchObject({ kind: 'transient', providerUnavailable: false });
    expect(
      handleBillingProblem(
        apiError(503, { code: 'SyncInvoice.ProviderUnavailable', status: 503 }),
      ),
    ).toMatchObject({ kind: 'transient', providerUnavailable: true });
  });

  it('gives a boundary refusal the wait before its one retry', () => {
    expect(
      handleBillingProblem(
        apiError(
          409,
          { code: 'CancelSubscription.BoundaryPending', status: 409 },
          { 'Retry-After': '12' },
        ),
      ),
    ).toMatchObject({ kind: 'boundary-pending', retryAfterMs: 12_000 });
    expect(
      handleBillingProblem(
        apiError(409, { code: 'UpdateInstanceBilling.BoundaryPending', status: 409 }),
      ).retryAfterMs,
    ).toBe(60_000);
  });

  it('reads a limit on the requests as temporary, with the wait before asking again', () => {
    expect(
      handleBillingProblem(
        apiError(
          429,
          {
            code: 'ValidateVoucher.RateLimited',
            detail: 'too many voucher codes checked: try again later',
            status: 429,
          },
          { 'Retry-After': '20' },
        ),
      ),
    ).toMatchObject({
      code: 'ValidateVoucher.RateLimited',
      detail: 'too many voucher codes checked: try again later',
      kind: 'rate-limited',
      retryAfterMs: 20_000,
    });
    // The browser cannot read the header today (CORS does not expose it): a minute.
    expect(
      handleBillingProblem(
        apiError(429, { code: 'ValidateVoucher.RateLimited', status: 429 }),
      ).retryAfterMs,
    ).toBe(60_000);
  });

  it('reads a 429 as temporary whatever its code, and a code that ends in RateLimited whatever its status', () => {
    expect(handleBillingProblem(apiError(429, 'slow down')).kind).toBe('rate-limited');
    expect(
      handleBillingProblem(apiError(422, { code: 'Anything.RateLimited', status: 422 })).kind,
    ).toBe('rate-limited');
  });

  it('reads where the kept usage begins from a retention refusal', () => {
    expect(
      handleBillingProblem(
        apiError(422, {
          code: 'ListUsageReports.OutsideRetention',
          errors: [{ location: 'query.from', value: { retentionStart: '2026-11-01T00:00:00Z' } }],
          status: 422,
        }),
      ),
    ).toMatchObject({
      kind: 'outside-retention',
      retentionStart: '2026-11-01T00:00:00Z',
    });
  });

  it('reads where the kept usage begins as the API sends it: the bare value of its error', () => {
    // ListUsageReports.OutsideRetention names retentionStart as a date and nothing else.
    expect(
      handleBillingProblem(
        apiError(422, {
          code: 'ListUsageReports.OutsideRetention',
          errors: [
            {
              location: 'query.from',
              message: 'retentionStart',
              value: '2026-11-01T00:00:00Z',
            },
          ],
          status: 422,
        }),
      ),
    ).toMatchObject({
      kind: 'outside-retention',
      retentionStart: '2026-11-01T00:00:00Z',
    });
  });

  it('never reads a retention start from what is not a date', () => {
    for (const value of ['soon', 42, null, { metering: {} }, undefined]) {
      expect(
        handleBillingProblem(
          apiError(422, {
            code: 'GetUpcomingInvoice.OutsideRetention',
            errors: [{ location: 'metering', value }],
            status: 422,
          }),
        ).retentionStart,
      ).toBeUndefined();
    }
  });

  it('reads a string value as a retention start only for a retention refusal', () => {
    expect(
      handleBillingProblem(
        apiError(422, {
          code: 'ListUsageReports.InvalidRange',
          errors: [{ location: 'query.from', value: '2026-11-01T00:00:00Z' }],
          status: 422,
        }),
      ).retentionStart,
    ).toBeUndefined();
  });

  it('always has a list of errors, though the API may send null', () => {
    expect(
      handleBillingProblem(apiError(400, { detail: 'x', errors: null, status: 400 })).errors,
    ).toEqual([]);
  });
});

type Fields = { billingEmail: string; externalReference: string; note: string };

// The form of a dialog: its fields are on screen, which is what the API's field
// errors need, and the message the field shows is what a user would read.
function Dialog({ onForm }: { onForm: (form: AnyFormApi) => void }) {
  const form = useAppForm({
    defaultValues: { billingEmail: '', externalReference: '', note: '' } as Fields,
  });
  useEffect(() => {
    onForm(form as unknown as AnyFormApi);
  }, [form, onForm]);

  return (
    <>
      <form.AppField name="externalReference">
        {(field) => <field.TextField label="Reference" />}
      </form.AppField>
      <form.AppField name="note">
        {(field) => <field.TextField label="Note" />}
      </form.AppField>
    </>
  );
}

// The form reaches the test from an effect, which can run after its fields are
// on screen: wait for both, not for the fields alone.
async function mountDialog() {
  let form: AnyFormApi | undefined;
  render(<Dialog onForm={(mounted) => (form = mounted)} />);
  await screen.findByLabelText('Reference');
  return waitFor(() => {
    if (!form) {
      throw new Error('The dialog did not mount its form');
    }
    return form;
  });
}

describe('setProblemFieldError', () => {
  it('shows the message of the API under the field it is about, which reads as touched', async () => {
    const form = await mountDialog();

    act(() => {
      setProblemFieldError(form, 'note', 'a note is at most 50 characters');
    });

    expect(
      await screen.findByText('a note is at most 50 characters'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Note')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Reference')).toHaveAttribute(
      'aria-invalid',
      'false',
    );
  });

  it('carries what else the refusal says, next to its message, for what is shown beside the field', async () => {
    const form = await mountDialog();

    act(() => {
      setProblemFieldError(form, 'note', 'frozen', { code: 'X.Frozen' });
    });

    await screen.findByText('frozen');
    expect(form.getFieldMeta('note')?.errorMap.onServer).toEqual({
      code: 'X.Frozen',
      message: 'frozen',
    });
  });

  // The refusal is about what was typed. A form that stayed invalid after the person
  // fixed it would not let them send it again.
  it('goes when the field changes, and the form can be sent again', async () => {
    const form = await mountDialog();
    act(() => {
      setProblemFieldError(form, 'note', 'a note is at most 50 characters');
    });
    await screen.findByText('a note is at most 50 characters');
    expect(form.state.isValid).toBe(false);

    await userEvent.type(screen.getByLabelText('Note'), 'shorter');

    await waitFor(() =>
      expect(screen.queryByText('a note is at most 50 characters')).toBeNull(),
    );
    expect(form.state.isValid).toBe(true);
    expect(screen.getByLabelText('Note')).toHaveAttribute('aria-invalid', 'false');
  });

  it('stays while the field is as it was, and does not touch the others', async () => {
    const form = await mountDialog();
    act(() => {
      setProblemFieldError(form, 'note', 'a note is at most 50 characters');
    });
    await screen.findByText('a note is at most 50 characters');

    await userEvent.type(screen.getByLabelText('Reference'), 'ref-1');

    expect(screen.getByText('a note is at most 50 characters')).toBeInTheDocument();
  });

  it('is replaced by a newer refusal of the same field, which goes with the next change', async () => {
    const form = await mountDialog();
    act(() => {
      setProblemFieldError(form, 'note', 'first');
      setProblemFieldError(form, 'note', 'second');
    });
    expect(await screen.findByText('second')).toBeInTheDocument();
    expect(screen.queryByText('first')).toBeNull();

    await userEvent.type(screen.getByLabelText('Note'), 'x');

    await waitFor(() => expect(screen.queryByText('second')).toBeNull());
    expect(form.state.isValid).toBe(true);
  });
});

describe('applyProblemFieldErrors', () => {
  const invalid = handleBillingProblem(
    apiError(422, {
      code: 'MarkInvoicePaid.InvalidExternalReference',
      detail: 'validation failed',
      errors: [
        { location: 'body.externalReference', message: 'must be at most 255 characters' },
      ],
      status: 422,
    }),
  );

  it('shows a field error under the field its location maps to', async () => {
    const form = await mountDialog();

    let placed = false;
    act(() => {
      placed = applyProblemFieldErrors(form, invalid, {
        externalReference: 'externalReference',
      });
    });

    expect(placed).toBe(true);
    expect(
      await screen.findByText('must be at most 255 characters'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Reference')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByLabelText('Note')).toHaveAttribute('aria-invalid', 'false');
  });

  it('matches a location with its prefix, by the longest key', async () => {
    const form = await mountDialog();
    const nested = handleBillingProblem(
      apiError(422, {
        errors: [{ location: 'body.note[0].text', message: 'too long' }],
        status: 422,
      }),
    );

    act(() => {
      applyProblemFieldErrors(form, nested, {
        'body.note': 'externalReference',
        'body.note[0]': 'note',
      });
    });

    expect(await screen.findByText('too long')).toBeInTheDocument();
    expect(screen.getByLabelText('Note')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Reference')).toHaveAttribute(
      'aria-invalid',
      'false',
    );
  });

  it('says so when an error has no field, for the detail to be shown as a banner', async () => {
    const form = await mountDialog();

    let placed = true;
    act(() => {
      placed = applyProblemFieldErrors(form, invalid, { billingEmail: 'billingEmail' });
    });

    expect(placed).toBe(false);
    expect(screen.queryByText('must be at most 255 characters')).toBeNull();
  });

  it('says so when its field is not on screen', async () => {
    const form = await mountDialog();

    let placed = true;
    act(() => {
      placed = applyProblemFieldErrors(form, invalid, {
        externalReference: 'billingEmail',
      });
    });

    expect(placed).toBe(false);
  });

  it('places nothing for a problem with no field errors', async () => {
    const form = await mountDialog();

    expect(
      applyProblemFieldErrors(
        form,
        handleBillingProblem(apiError(409, { detail: 'x', status: 409 })),
        { billingEmail: 'billingEmail' },
      ),
    ).toBe(false);
    expect(applyProblemFieldErrors(form, null, {})).toBe(false);
  });
});
