export type CelContextSchema = Record<string, unknown>;

export type CelValidationError = {
  message: string;
  line?: number;
  column?: number;
};

export type CelValidationResult = {
  isValid: boolean;
  errors: CelValidationError[] | null;
};

export type CelValidateFunction = (
  expression: string,
  contextSchema?: CelContextSchema,
) => CelValidationResult;

export type CelEngineInstance = {
  validate: CelValidateFunction;
};
