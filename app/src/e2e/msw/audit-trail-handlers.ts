import { HttpResponse } from 'msw/http';
import { handleGetAuditTrails } from '@/api-client/msw.gen';
import type { AuditTrailAppModel } from '../../../e2e/app/_support/model/audit-trail-app-model';
import { auditTrailOperations } from '../../../e2e/app/_support/model/graphql-operations';
import { graphqlOperationHandler } from './handler-factory';

export const auditTrailHandlers = (model: AuditTrailAppModel) => [
  graphqlOperationHandler(auditTrailOperations(model)),
  handleGetAuditTrails(({ params, request }) => {
    const query = new URL(request.url).searchParams;
    const limit = query.get('limit');
    return HttpResponse.json(
      model.getInstanceAuditTrail(params.instanceSlug, {
        eventName: query.get('event_name') ?? undefined,
        limit: limit ? Number(limit) : undefined,
      }),
    );
  }),
];
