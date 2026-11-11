import { DashboardAppModel } from '../_support/model/dashboard-app-model';
import {
  buildCalmDashboardSummary,
  buildDashboardSummary,
  buildEmptyDashboardSummary,
} from '../_support/model/dashboard-summary';

/** The Kaiten Sushi Shop on a busy day: every check has something to say. */
export function createDashboardReadModel() {
  return new DashboardAppModel(buildDashboardSummary());
}

/** The same organization on a quiet day: every check ran and found nothing. */
export function createCalmDashboardModel() {
  return new DashboardAppModel(buildCalmDashboardSummary());
}

/**
 * The busy day, read over 30 days by an organization whose retention keeps a
 * week of activity: the API reads the activity from where it starts.
 */
export function createRetentionCutDashboardModel() {
  return new DashboardAppModel(buildDashboardSummary(), { auditTrailDays: 7 });
}

/** A brand-new organization: nothing recorded yet. */
export function createEmptyDashboardModel() {
  return new DashboardAppModel(buildEmptyDashboardSummary());
}
