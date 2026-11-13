import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw/http';
import { describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { refusal, renderWithClient } from '@/test-fixtures/billing-test-support';
import { PlanPageContent } from '../components';

const page = () =>
  renderWithClient(<PlanPageContent onSelectPlan={vi.fn()} />);

// The page draws saas-api's refusal of its session as a state of its own, and
// offers to ask again only where an answer can change by itself.
describe('PlanPageContent', () => {
  it('says the page is not for an organization without plan-billing', async () => {
    server.use(
      http.post('*/plan/session', () =>
        refusal(403, { code: 'CreatePlanSession.NotEnabled', detail: 'off' }),
      ),
    );
    page();

    const problem = await screen.findByTestId('plan-session-problem');
    expect(problem.dataset.problem).toBe('not-enabled');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('tells an editor that only administrators see the plan', async () => {
    server.use(
      http.post('*/plan/session', () =>
        refusal(403, { code: 'Auth.InsufficientScope', detail: 'write:*' }),
      ),
    );
    page();

    expect(
      (await screen.findByTestId('plan-session-problem')).dataset.problem,
    ).toBe('forbidden');
  });

  it('asks again when Kaiten Cloud did not answer, and then shows nothing wrong', async () => {
    let calls = 0;
    server.use(
      http.post('*/plan/session', () => {
        calls += 1;
        return calls === 1
          ? refusal(503, { code: 'CreatePlanSession.Unavailable', detail: 'down' })
          : refusal(404, {
              code: 'CreatePlanSession.NotProvisioned',
              detail: 'no instance',
            });
      }),
    );
    page();

    const first = await screen.findByTestId('plan-session-problem');
    expect(first.dataset.problem).toBe('unavailable');
    await userEvent.click(screen.getByRole('button'));

    await vi.waitFor(() =>
      expect(screen.getByTestId('plan-session-problem').dataset.problem).toBe(
        'not-provisioned',
      ),
    );
    expect(calls).toBe(2);
  });

  it('mints no session it does not use: one request while the page is open', async () => {
    let calls = 0;
    server.use(
      http.post('*/plan/session', () => {
        calls += 1;
        return HttpResponse.json(
          { code: 'CreatePlanSession.NotEnabled', status: 403 },
          { status: 403 },
        );
      }),
    );
    page();

    await screen.findByTestId('plan-session-problem');
    expect(calls).toBe(1);
  });
});
