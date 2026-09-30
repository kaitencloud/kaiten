import { renderHook } from '@testing-library/react';
import { vi } from 'vite-plus/test';
import useField from '../use-field';

// Mock simple de useFieldContext
const mockUseFieldContext = vi.fn();

vi.mock('../../form-context', () => ({
  useFieldContext: () => mockUseFieldContext(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('useField', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return field data without errors', () => {
    mockUseFieldContext.mockReturnValue({
      state: {
        value: 'test value',
        meta: {
          errors: [],
          isTouched: false,
        },
      },
      form: {
        state: {
          isTouched: false,
        },
      },
      handleChange: vi.fn(),
      handleBlur: vi.fn(),
    });

    const { result } = renderHook(() => useField());

    expect(result.current.value).toBe('test value');
    expect(typeof result.current.handleChange).toBe('function');
    expect(typeof result.current.handleBlur).toBe('function');
    expect(result.current.hasError).toBe(false);
  });

  it('should show error when field has errors and form is touched', () => {
    mockUseFieldContext.mockReturnValue({
      state: {
        value: '',
        meta: {
          errors: [{ message: 'validation.required' }],
          isTouched: true,
        },
      },
      form: {
        state: {
          isTouched: true,
        },
      },
      handleChange: vi.fn(),
      handleBlur: vi.fn(),
    });

    const { result } = renderHook(() => useField());

    expect(result.current.hasError).toBe(true);
    expect(result.current.errorMessage).toBe('validation.required');
  });
});
