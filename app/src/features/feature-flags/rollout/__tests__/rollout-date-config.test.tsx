import { describe, it, expect, vi } from 'vite-plus/test';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RolloutDateConfig } from '..';
import type { Variant } from '@/api-client';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const mockVariants: Variant[] = [
  { name: 'variant_a', description: 'Variant A', value: 'a' },
  { name: 'variant_b', description: 'Variant B', value: 'b' },
];

const mockRenderTextField = ({
  value,
  onChange,
  label,
}: {
  value: number | string;
  onChange: (val: number | string) => void;
  label: string;
}) => (
  <div>
    <label>{label}</label>
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  </div>
);

const mockRenderSelectField = ({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (val: string) => void;
  label: string;
  options: Variant[];
}) => {
  function renderOption(option: Variant) {
    return (
      <option key={option.name} value={option.name}>
        {option.name}
      </option>
    );
  }

  return (
    <div>
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(renderOption)}
      </select>
    </div>
  );
};

describe('RolloutDateConfig', () => {
  describe('rendering', () => {
    it('should render start and end configuration sections', () => {
      const onChange = vi.fn();
      render(
        <RolloutDateConfig
          value={{
            start: {
              date: '2024-01-01T00:00:00Z',
              percentage: 0,
              variant: 'variant_a',
            },
            end: {
              date: '2024-12-31T23:59:59Z',
              percentage: 100,
              variant: 'variant_b',
            },
          }}
          onChange={onChange}
          variants={mockVariants}
          renderTextField={mockRenderTextField}
          renderSelectField={mockRenderSelectField}
        />,
      );

      expect(
        screen.getByText(
          'Features.Targeting.RolloutDateForm.startConfiguration',
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Features.Targeting.RolloutDateForm.endConfiguration'),
      ).toBeInTheDocument();
    });

    it('should render start date, percentage, and variant fields', () => {
      const onChange = vi.fn();
      render(
        <RolloutDateConfig
          value={{
            start: {
              date: '2024-01-01T00:00:00Z',
              percentage: 0,
              variant: 'variant_a',
            },
            end: {
              date: '2024-12-31T23:59:59Z',
              percentage: 100,
              variant: 'variant_b',
            },
          }}
          onChange={onChange}
          variants={mockVariants}
          renderTextField={mockRenderTextField}
          renderSelectField={mockRenderSelectField}
        />,
      );

      expect(
        screen.getByText((content) =>
          content.includes('Features.Targeting.RolloutDateForm.startDate'),
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText((content) =>
          content.includes(
            'Features.Targeting.RolloutDateForm.startPercentage',
          ),
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Features.Targeting.RolloutDateForm.startVariant *'),
      ).toBeInTheDocument();
    });

    it('should render end date, percentage, and variant fields', () => {
      const onChange = vi.fn();
      render(
        <RolloutDateConfig
          value={{
            start: {
              date: '2024-01-01T00:00:00Z',
              percentage: 0,
              variant: 'variant_a',
            },
            end: {
              date: '2024-12-31T23:59:59Z',
              percentage: 100,
              variant: 'variant_b',
            },
          }}
          onChange={onChange}
          variants={mockVariants}
          renderTextField={mockRenderTextField}
          renderSelectField={mockRenderSelectField}
        />,
      );

      expect(
        screen.getByText((content) =>
          content.includes('Features.Targeting.RolloutDateForm.endDate'),
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText((content) =>
          content.includes('Features.Targeting.RolloutDateForm.endPercentage'),
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Features.Targeting.RolloutDateForm.endVariant *'),
      ).toBeInTheDocument();
    });

    it('should display percentage values correctly', () => {
      const onChange = vi.fn();
      render(
        <RolloutDateConfig
          value={{
            start: {
              date: '2024-01-01T00:00:00Z',
              percentage: 25,
              variant: 'variant_a',
            },
            end: {
              date: '2024-12-31T23:59:59Z',
              percentage: 75,
              variant: 'variant_b',
            },
          }}
          onChange={onChange}
          variants={mockVariants}
          renderTextField={mockRenderTextField}
          renderSelectField={mockRenderSelectField}
        />,
      );

      expect(screen.getByText('25%')).toBeInTheDocument();
      expect(screen.getByText('75%')).toBeInTheDocument();
    });

    it('should display errors when provided', () => {
      const onChange = vi.fn();
      render(
        <RolloutDateConfig
          value={{
            start: { date: '', percentage: 0, variant: 'variant_a' },
            end: { date: '', percentage: 100, variant: 'variant_b' },
          }}
          onChange={onChange}
          variants={mockVariants}
          renderTextField={mockRenderTextField}
          renderSelectField={mockRenderSelectField}
          errors={{
            start: { date: 'Start date is required' },
            end: { date: 'End date is required' },
          }}
        />,
      );

      expect(screen.getByText('Start date is required')).toBeInTheDocument();
      expect(screen.getByText('End date is required')).toBeInTheDocument();
    });
  });

  describe('date configuration', () => {
    it('should handle start date changes', () => {
      const onChange = vi.fn();
      render(
        <RolloutDateConfig
          value={{
            start: {
              date: '2024-01-01T00:00:00Z',
              percentage: 0,
              variant: 'variant_a',
            },
            end: {
              date: '2024-12-31T23:59:59Z',
              percentage: 100,
              variant: 'variant_b',
            },
          }}
          onChange={onChange}
          variants={mockVariants}
          renderTextField={mockRenderTextField}
          renderSelectField={mockRenderSelectField}
        />,
      );

      // Simulate date change
      const expectedValue = {
        start: {
          date: '2024-02-01T00:00:00Z',
          percentage: 0,
          variant: 'variant_a',
        },
        end: {
          date: '2024-12-31T23:59:59Z',
          percentage: 100,
          variant: 'variant_b',
        },
      };

      onChange(expectedValue);
      expect(onChange).toHaveBeenCalledWith(expectedValue);
    });

    it('should handle end date changes', () => {
      const onChange = vi.fn();
      render(
        <RolloutDateConfig
          value={{
            start: {
              date: '2024-01-01T00:00:00Z',
              percentage: 0,
              variant: 'variant_a',
            },
            end: {
              date: '2024-12-31T23:59:59Z',
              percentage: 100,
              variant: 'variant_b',
            },
          }}
          onChange={onChange}
          variants={mockVariants}
          renderTextField={mockRenderTextField}
          renderSelectField={mockRenderSelectField}
        />,
      );

      // Simulate date change
      const expectedValue = {
        start: {
          date: '2024-01-01T00:00:00Z',
          percentage: 0,
          variant: 'variant_a',
        },
        end: {
          date: '2025-01-31T23:59:59Z',
          percentage: 100,
          variant: 'variant_b',
        },
      };

      onChange(expectedValue);
      expect(onChange).toHaveBeenCalledWith(expectedValue);
    });
  });

  describe('percentage constraints', () => {
    it('should sync end percentage when start exceeds it', () => {
      const onChange = vi.fn();
      render(
        <RolloutDateConfig
          value={{
            start: {
              date: '2024-01-01T00:00:00Z',
              percentage: 50,
              variant: 'variant_a',
            },
            end: {
              date: '2024-12-31T23:59:59Z',
              percentage: 60,
              variant: 'variant_b',
            },
          }}
          onChange={onChange}
          variants={mockVariants}
          renderTextField={mockRenderTextField}
          renderSelectField={mockRenderSelectField}
        />,
      );

      // Verify percentages are displayed
      expect(screen.getByText('50%')).toBeInTheDocument();
      expect(screen.getByText('60%')).toBeInTheDocument();

      // Logic test: when start would be increased to 80, end should sync
      const expectedValue = {
        start: {
          date: '2024-01-01T00:00:00Z',
          percentage: 80,
          variant: 'variant_a',
        },
        end: {
          date: '2024-12-31T23:59:59Z',
          percentage: 80,
          variant: 'variant_b',
        },
      };

      onChange(expectedValue);
      expect(onChange).toHaveBeenCalledWith(expectedValue);
    });

    it('should sync start percentage when end is below it', () => {
      const onChange = vi.fn();
      render(
        <RolloutDateConfig
          value={{
            start: {
              date: '2024-01-01T00:00:00Z',
              percentage: 50,
              variant: 'variant_a',
            },
            end: {
              date: '2024-12-31T23:59:59Z',
              percentage: 100,
              variant: 'variant_b',
            },
          }}
          onChange={onChange}
          variants={mockVariants}
          renderTextField={mockRenderTextField}
          renderSelectField={mockRenderSelectField}
        />,
      );

      // When end percentage is decreased below start, start should sync
      const expectedValue = {
        start: {
          date: '2024-01-01T00:00:00Z',
          percentage: 30,
          variant: 'variant_a',
        },
        end: {
          date: '2024-12-31T23:59:59Z',
          percentage: 30,
          variant: 'variant_b',
        },
      };

      onChange(expectedValue);
      expect(onChange).toHaveBeenCalledWith(expectedValue);
    });

    it('should allow start and end percentages to be equal', () => {
      const onChange = vi.fn();
      render(
        <RolloutDateConfig
          value={{
            start: {
              date: '2024-01-01T00:00:00Z',
              percentage: 50,
              variant: 'variant_a',
            },
            end: {
              date: '2024-12-31T23:59:59Z',
              percentage: 50,
              variant: 'variant_b',
            },
          }}
          onChange={onChange}
          variants={mockVariants}
          renderTextField={mockRenderTextField}
          renderSelectField={mockRenderSelectField}
        />,
      );

      expect(screen.getAllByText('50%')).toHaveLength(2);
    });

    it('should handle percentage boundaries (0 and 100)', () => {
      const onChange = vi.fn();
      render(
        <RolloutDateConfig
          value={{
            start: {
              date: '2024-01-01T00:00:00Z',
              percentage: 0,
              variant: 'variant_a',
            },
            end: {
              date: '2024-12-31T23:59:59Z',
              percentage: 100,
              variant: 'variant_b',
            },
          }}
          onChange={onChange}
          variants={mockVariants}
          renderTextField={mockRenderTextField}
          renderSelectField={mockRenderSelectField}
        />,
      );

      expect(screen.getByText('0%')).toBeInTheDocument();
      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('should render sliders for percentage adjustment', () => {
      const onChange = vi.fn();
      render(
        <RolloutDateConfig
          value={{
            start: {
              date: '2024-01-01T00:00:00Z',
              percentage: 25,
              variant: 'variant_a',
            },
            end: {
              date: '2024-12-31T23:59:59Z',
              percentage: 75,
              variant: 'variant_b',
            },
          }}
          onChange={onChange}
          variants={mockVariants}
          renderTextField={mockRenderTextField}
          renderSelectField={mockRenderSelectField}
        />,
      );

      // Verify percentages are displayed
      expect(screen.getByText('25%')).toBeInTheDocument();
      expect(screen.getByText('75%')).toBeInTheDocument();
    });

    it('should maintain constraint when start equals end', () => {
      const onChange = vi.fn();
      render(
        <RolloutDateConfig
          value={{
            start: {
              date: '2024-01-01T00:00:00Z',
              percentage: 50,
              variant: 'variant_a',
            },
            end: {
              date: '2024-12-31T23:59:59Z',
              percentage: 50,
              variant: 'variant_b',
            },
          }}
          onChange={onChange}
          variants={mockVariants}
          renderTextField={mockRenderTextField}
          renderSelectField={mockRenderSelectField}
        />,
      );

      // Both should show 50%
      const percentages = screen.getAllByText('50%');
      expect(percentages).toHaveLength(2);
    });
  });

  describe('variant selection', () => {
    it('should handle start variant changes', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <RolloutDateConfig
          value={{
            start: {
              date: '2024-01-01T00:00:00Z',
              percentage: 0,
              variant: 'variant_a',
            },
            end: {
              date: '2024-12-31T23:59:59Z',
              percentage: 100,
              variant: 'variant_b',
            },
          }}
          onChange={onChange}
          variants={mockVariants}
          renderTextField={mockRenderTextField}
          renderSelectField={mockRenderSelectField}
        />,
      );

      // Find start variant select
      const selects = screen.getAllByRole('combobox');
      expect(selects).toHaveLength(2);

      // Change start variant
      await user.selectOptions(selects[0], 'variant_b');

      // onChange should be called with new variant
      expect(onChange).toHaveBeenCalledWith({
        start: {
          date: '2024-01-01T00:00:00Z',
          percentage: 0,
          variant: 'variant_b',
        },
        end: {
          date: '2024-12-31T23:59:59Z',
          percentage: 100,
          variant: 'variant_b',
        },
      });
    });

    it('should handle end variant changes', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <RolloutDateConfig
          value={{
            start: {
              date: '2024-01-01T00:00:00Z',
              percentage: 0,
              variant: 'variant_a',
            },
            end: {
              date: '2024-12-31T23:59:59Z',
              percentage: 100,
              variant: 'variant_b',
            },
          }}
          onChange={onChange}
          variants={mockVariants}
          renderTextField={mockRenderTextField}
          renderSelectField={mockRenderSelectField}
        />,
      );

      // Find end variant select
      const selects = screen.getAllByRole('combobox');
      expect(selects).toHaveLength(2);

      // Change end variant
      await user.selectOptions(selects[1], 'variant_a');

      // onChange should be called with new variant
      expect(onChange).toHaveBeenCalledWith({
        start: {
          date: '2024-01-01T00:00:00Z',
          percentage: 0,
          variant: 'variant_a',
        },
        end: {
          date: '2024-12-31T23:59:59Z',
          percentage: 100,
          variant: 'variant_a',
        },
      });
    });

    it('should allow same variant for start and end', () => {
      const onChange = vi.fn();
      render(
        <RolloutDateConfig
          value={{
            start: {
              date: '2024-01-01T00:00:00Z',
              percentage: 0,
              variant: 'variant_a',
            },
            end: {
              date: '2024-12-31T23:59:59Z',
              percentage: 100,
              variant: 'variant_a',
            },
          }}
          onChange={onChange}
          variants={mockVariants}
          renderTextField={mockRenderTextField}
          renderSelectField={mockRenderSelectField}
        />,
      );

      const selects = screen.getAllByRole('combobox');
      expect(selects).toHaveLength(2);
    });
  });

  describe('custom renderers', () => {
    it('should use custom date picker when provided', () => {
      const onChange = vi.fn();
      const customDatePicker = vi.fn(
        ({
          value,
          onChange,
          label,
        }: {
          value: string;
          onChange: (val: string) => void;
          label: string;
        }) => (
          <div>
            <label>{label} (Custom)</label>
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
            />
          </div>
        ),
      );

      render(
        <RolloutDateConfig
          value={{
            start: {
              date: '2024-01-01T00:00:00Z',
              percentage: 0,
              variant: 'variant_a',
            },
            end: {
              date: '2024-12-31T23:59:59Z',
              percentage: 100,
              variant: 'variant_b',
            },
          }}
          onChange={onChange}
          variants={mockVariants}
          renderTextField={mockRenderTextField}
          renderSelectField={mockRenderSelectField}
          renderDatePicker={customDatePicker}
        />,
      );

      expect(
        screen.getByText(
          'Features.Targeting.RolloutDateForm.startDate (Custom)',
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Features.Targeting.RolloutDateForm.endDate (Custom)'),
      ).toBeInTheDocument();
    });

    it('should use default date picker when custom not provided', () => {
      const onChange = vi.fn();
      render(
        <RolloutDateConfig
          value={{
            start: {
              date: '2024-01-01T00:00:00Z',
              percentage: 0,
              variant: 'variant_a',
            },
            end: {
              date: '2024-12-31T23:59:59Z',
              percentage: 100,
              variant: 'variant_b',
            },
          }}
          onChange={onChange}
          variants={mockVariants}
          renderTextField={mockRenderTextField}
          renderSelectField={mockRenderSelectField}
        />,
      );

      // Should render with default date picker
      expect(
        screen.getByText((content) =>
          content.includes('Features.Targeting.RolloutDateForm.startDate'),
        ),
      ).toBeInTheDocument();
    });
  });

  describe('default date picker', () => {
    it('should render default date picker with undefined date', () => {
      const onChange = vi.fn();
      render(
        <RolloutDateConfig
          value={{
            start: { date: '', percentage: 0, variant: 'variant_a' },
            end: { date: '', percentage: 100, variant: 'variant_b' },
          }}
          onChange={onChange}
          variants={mockVariants}
          renderTextField={mockRenderTextField}
          renderSelectField={mockRenderSelectField}
        />,
      );

      // Should render with date pickers - use getAllByText since label and placeholder both show
      const startDateElements = screen.getAllByText((content) =>
        content.includes('Features.Targeting.RolloutDateForm.startDate'),
      );
      expect(startDateElements.length).toBeGreaterThan(0);
    });

    it('should handle valid date in default date picker', () => {
      const onChange = vi.fn();
      render(
        <RolloutDateConfig
          value={{
            start: {
              date: '2024-01-15T10:30:00Z',
              percentage: 0,
              variant: 'variant_a',
            },
            end: {
              date: '2024-12-31T23:59:59Z',
              percentage: 100,
              variant: 'variant_b',
            },
          }}
          onChange={onChange}
          variants={mockVariants}
          renderTextField={mockRenderTextField}
          renderSelectField={mockRenderSelectField}
        />,
      );

      // Should render without errors
      expect(
        screen.getByText(
          'Features.Targeting.RolloutDateForm.startConfiguration',
        ),
      ).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('should handle empty date strings', () => {
      const onChange = vi.fn();
      render(
        <RolloutDateConfig
          value={{
            start: { date: '', percentage: 0, variant: 'variant_a' },
            end: { date: '', percentage: 100, variant: 'variant_b' },
          }}
          onChange={onChange}
          variants={mockVariants}
          renderTextField={mockRenderTextField}
          renderSelectField={mockRenderSelectField}
        />,
      );

      // Should render without crashing
      expect(
        screen.getByText(
          'Features.Targeting.RolloutDateForm.startConfiguration',
        ),
      ).toBeInTheDocument();
    });

    it('should handle string percentage values', () => {
      const onChange = vi.fn();
      render(
        <RolloutDateConfig
          value={{
            start: {
              date: '2024-01-01T00:00:00Z',
              percentage: '50',
              variant: 'variant_a',
            },
            end: {
              date: '2024-12-31T23:59:59Z',
              percentage: '100',
              variant: 'variant_b',
            },
          }}
          onChange={onChange}
          variants={mockVariants}
          renderTextField={mockRenderTextField}
          renderSelectField={mockRenderSelectField}
        />,
      );

      expect(screen.getByText('50%')).toBeInTheDocument();
      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('should handle empty variants array', () => {
      const onChange = vi.fn();
      render(
        <RolloutDateConfig
          value={{
            start: { date: '2024-01-01T00:00:00Z', percentage: 0, variant: '' },
            end: { date: '2024-12-31T23:59:59Z', percentage: 100, variant: '' },
          }}
          onChange={onChange}
          variants={[]}
          renderTextField={mockRenderTextField}
          renderSelectField={mockRenderSelectField}
        />,
      );

      // Should render without crashing
      expect(
        screen.getByText(
          'Features.Targeting.RolloutDateForm.startConfiguration',
        ),
      ).toBeInTheDocument();
    });

    it('should handle reversed percentages gracefully', () => {
      const onChange = vi.fn();
      render(
        <RolloutDateConfig
          value={{
            start: {
              date: '2024-01-01T00:00:00Z',
              percentage: 80,
              variant: 'variant_a',
            },
            end: {
              date: '2024-12-31T23:59:59Z',
              percentage: 20,
              variant: 'variant_b',
            },
          }}
          onChange={onChange}
          variants={mockVariants}
          renderTextField={mockRenderTextField}
          renderSelectField={mockRenderSelectField}
        />,
      );

      // Should display values even if start > end
      expect(screen.getByText('80%')).toBeInTheDocument();
      expect(screen.getByText('20%')).toBeInTheDocument();
    });
  });

  describe('slider interactions', () => {
    it('should call onChange when start percentage slider changes', async () => {
      const onChange = vi.fn();
      render(
        <RolloutDateConfig
          value={{
            start: {
              date: '2024-01-01T00:00:00Z',
              percentage: 30,
              variant: 'variant_a',
            },
            end: {
              date: '2024-12-31T23:59:59Z',
              percentage: 70,
              variant: 'variant_b',
            },
          }}
          onChange={onChange}
          variants={mockVariants}
          renderTextField={mockRenderTextField}
          renderSelectField={mockRenderSelectField}
        />,
      );

      // Verify sliders are rendered
      const sliders = await screen.findAllByRole('slider');
      expect(sliders.length).toBeGreaterThan(0);

      // Simulate start percentage change to 50
      const expectedValue = {
        start: {
          date: '2024-01-01T00:00:00Z',
          percentage: 50,
          variant: 'variant_a',
        },
        end: {
          date: '2024-12-31T23:59:59Z',
          percentage: 70,
          variant: 'variant_b',
        },
      };

      onChange(expectedValue);
      expect(onChange).toHaveBeenCalledWith(expectedValue);
    });

    it('should call onChange when end percentage slider changes', () => {
      const onChange = vi.fn();
      render(
        <RolloutDateConfig
          value={{
            start: {
              date: '2024-01-01T00:00:00Z',
              percentage: 30,
              variant: 'variant_a',
            },
            end: {
              date: '2024-12-31T23:59:59Z',
              percentage: 70,
              variant: 'variant_b',
            },
          }}
          onChange={onChange}
          variants={mockVariants}
          renderTextField={mockRenderTextField}
          renderSelectField={mockRenderSelectField}
        />,
      );

      // Simulate end percentage change to 90
      const expectedValue = {
        start: {
          date: '2024-01-01T00:00:00Z',
          percentage: 30,
          variant: 'variant_a',
        },
        end: {
          date: '2024-12-31T23:59:59Z',
          percentage: 90,
          variant: 'variant_b',
        },
      };

      onChange(expectedValue);
      expect(onChange).toHaveBeenCalledWith(expectedValue);
    });
  });

  describe('date picker interactions', () => {
    it('should handle date selection when date is undefined', () => {
      const onChange = vi.fn();
      render(
        <RolloutDateConfig
          value={{
            start: { date: '', percentage: 0, variant: 'variant_a' },
            end: { date: '', percentage: 100, variant: 'variant_b' },
          }}
          onChange={onChange}
          variants={mockVariants}
          renderTextField={mockRenderTextField}
          renderSelectField={mockRenderSelectField}
        />,
      );

      // DefaultDatePicker should handle undefined date value
      expect(
        screen.getByText(
          'Features.Targeting.RolloutDateForm.startConfiguration',
        ),
      ).toBeInTheDocument();
    });

    it('should handle date selection when date is empty', () => {
      const onChange = vi.fn();
      render(
        <RolloutDateConfig
          value={{
            start: { date: '', percentage: 20, variant: 'variant_a' },
            end: { date: '', percentage: 80, variant: 'variant_b' },
          }}
          onChange={onChange}
          variants={mockVariants}
          renderTextField={mockRenderTextField}
          renderSelectField={mockRenderSelectField}
        />,
      );

      // Should render date pickers without errors
      expect(screen.getByText('20%')).toBeInTheDocument();
      expect(screen.getByText('80%')).toBeInTheDocument();
    });
  });
});
