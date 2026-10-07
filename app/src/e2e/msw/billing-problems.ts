import type { DefaultBodyType, PathParams } from 'msw';
import type { HttpResponseResolver } from 'msw/http';
import { BillingProblem } from '../../../e2e/app/_support/model/billing-problem';
import {
  billingProblemResponse,
  messageForError,
  problemJson,
  statusForError,
} from './handler-factory';

/**
 * Renders a refusal of the billing model as the problem document the Core API
 * answers with: its code, its detail, its field errors, the trace id a 500
 * carries and the `Retry-After` of a boundary being closed. Any other failure
 * is a plain error of the mock.
 */
export const withProblems =
  <Params extends PathParams<keyof Params>, Body extends DefaultBodyType>(
    handler: HttpResponseResolver<Params, Body>,
  ): HttpResponseResolver<Params, Body> =>
  async (info) => {
    try {
      return await handler(info);
    } catch (error) {
      if (error instanceof BillingProblem) {
        return billingProblemResponse(error);
      }
      return problemJson(
        statusForError(error),
        messageForError(error, 'Unexpected billing mock error'),
      );
    }
  };
