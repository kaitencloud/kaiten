import type {
  CelContextSchema,
  CelEngineInstance,
  CelValidationResult,
} from '../types/cel-engine.types';

type WasmInitInput =
  | RequestInfo
  | URL
  | Response
  | BufferSource
  | WebAssembly.Module
  | string;

type CelWasmModule = {
  default?: (input?: WasmInitInput) => Promise<unknown> | unknown;
  validateCEL?: (
    expression: string,
    contextSchema?: CelContextSchema,
  ) => CelValidationResult;
};

const CEL_ENGINE_MODULE_PATH = '/wasm/cel-engine.js';

let moduleLoadPromise: Promise<CelWasmModule> | null = null;
let enginePromise: Promise<CelEngineInstance> | null = null;

async function loadWasmModule(): Promise<CelWasmModule> {
  if (!moduleLoadPromise) {
    moduleLoadPromise = import(/* @vite-ignore */ CEL_ENGINE_MODULE_PATH).catch(
      (error: unknown) => {
        moduleLoadPromise = null;
        throw error;
      },
    ) as Promise<CelWasmModule>;
  }

  return moduleLoadPromise;
}

async function initializeCelEngine(): Promise<CelEngineInstance> {
  const wasmModule = await loadWasmModule();
  const init = wasmModule.default;

  if (typeof init === 'function') {
    await init();
  }

  const validate = wasmModule.validateCEL;
  if (typeof validate !== 'function') {
    throw new Error('WASM export "validateCEL" is unavailable');
  }

  return {
    validate: (expression, contextSchema) =>
      validate(expression, contextSchema),
  };
}

export async function loadCelEngine(): Promise<CelEngineInstance> {
  if (!enginePromise) {
    enginePromise = initializeCelEngine().catch((error: unknown) => {
      enginePromise = null;
      throw error;
    });
  }

  return enginePromise;
}
