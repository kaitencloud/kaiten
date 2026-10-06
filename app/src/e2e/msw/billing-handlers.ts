import { type DefaultBodyType, delay, type PathParams } from 'msw';
import { HttpResponse, type HttpResponseResolver } from 'msw/http';
import { handleGetBillingCapabilities } from '@/api-client/msw.gen';
import {
  type BillingAppModel,
  BillingProblem,
} from '../../../e2e/app/_support/model/billing-app-model';
import {
  messageForError,
  problemJson,
  statusForError,
} from './handler-factory';
import { noop, type PersistMswState } from './persistence';

const withProblems =
  <Params extends PathParams<keyof Params>, Body extends DefaultBodyType>(
    handler: HttpResponseResolver<Params, Body>,
  ): HttpResponseResolver<Params, Body> =>
  async (info) => {
    try {
      return await handler(info);
    } catch (error) {
      if (error instanceof BillingProblem) {
        return problemJson(error.httpStatus, error.message, error.code, {
          errors: error.errors,
          headers:
            error.retryAfterSeconds === undefined
              ? undefined
              : { 'Retry-After': String(error.retryAfterSeconds) },
        });
      }
      return problemJson(
        statusForError(error),
        messageForError(error, 'Unexpected billing mock error'),
      );
    }
  };

/**
 * The billing screens' API. The capabilities every billing screen gates on are
 * served here; the model can be set to refuse them, or never to answer.
 */
export const billingHandlers = (
  model: BillingAppModel,
  // Nothing of billing changes from the console yet; the later screens write
  // to the model and persist it, as the other slots do.
  persist: PersistMswState = noop,
) => {
  void persist;

  return [
    handleGetBillingCapabilities(
      withProblems(async () => {
        if (model.capabilitiesNeverAnswer()) {
          await delay('infinite');
        }
        return HttpResponse.json(model.getCapabilities());
      }),
    ),
  ];
};
