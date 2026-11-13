import { HttpResponse } from 'msw';
import { handleGetDashboardSummary } from '@/api-client/msw.gen';
import type { DashboardAppModel } from '../../../e2e/app/_support/model/dashboard-app-model';
import { withErrorHandling } from './handler-factory';

/**
 * `GET /dashboard/summary`, from the dashboard slot. The recent-changes card
 * reads the audit trail through its own slot and draws without it.
 */
export const dashboardHandlers = (model: DashboardAppModel) => [
  handleGetDashboardSummary(
    withErrorHandling('Dashboard unavailable', ({ request }) => {
      const range = new URL(request.url).searchParams.get('range') ?? undefined;
      return HttpResponse.json(model.getSummary(range));
    }),
  ),
];
