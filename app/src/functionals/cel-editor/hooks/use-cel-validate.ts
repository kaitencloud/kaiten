import { useCallback } from 'react';
import type {
  CelContextSchema,
  CelValidationResult,
} from '../types/cel-engine.types';
import { useCelEngineQuery } from './use-cel-engine-query';

const ENGINE_NOT_READY_RESULT: CelValidationResult = {
  isValid: false,
  errors: [{ message: 'Engine not ready' }],
};

type UseCelValidateOptions = {
  enabled?: boolean;
};

export function useCelValidate(options?: UseCelValidateOptions) {
  const query = useCelEngineQuery({ enabled: options?.enabled });
  const engine = query.data;

  const validate = useCallback(
    (
      expression: string,
      contextSchema?: CelContextSchema,
    ): CelValidationResult => {
      if (!engine) {
        return ENGINE_NOT_READY_RESULT;
      }
      return engine.validate(expression, contextSchema);
    },
    [engine],
  );

  return {
    validate,
    isReady: Boolean(engine),
    isLoading: query.isPending,
    isError: query.isError,
    error: query.error,
  };
}
