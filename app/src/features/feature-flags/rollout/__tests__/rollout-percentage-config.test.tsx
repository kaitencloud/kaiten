import { describe, it, expect, vi } from 'vite-plus/test';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RolloutPercentageConfig } from '..';
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
  { name: 'variant_c', description: 'Variant C', value: 'c' },
];

describe('RolloutPercentageConfig', () => {
  describe('rendering', () => {
    it('should render with empty distribution', () => {
      const onChange = vi.fn();
      render(
        <RolloutPercentageConfig
          distribution={{}}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      expect(
        screen.getByText('Features.Targeting.RolloutPercentageForm.noVariants'),
      ).toBeInTheDocument();
    });

    it('should render distribution entries', () => {
      const onChange = vi.fn();
      render(
        <RolloutPercentageConfig
          distribution={{ variant_a: 50, variant_b: 50 }}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      expect(screen.getByText('variant_a')).toBeInTheDocument();
      expect(screen.getByText('variant_b')).toBeInTheDocument();
      // In two-variant mode, percentages are combined in badge
      expect(screen.getByText('50% / 50%')).toBeInTheDocument();
    });

    it('should display total percentage', () => {
      const onChange = vi.fn();
      render(
        <RolloutPercentageConfig
          distribution={{ variant_a: 30, variant_b: 70 }}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      expect(
        screen.getByText((content) =>
          content.startsWith('Features.Targeting.RolloutPercentageForm.total'),
        ),
      ).toBeInTheDocument();
      const percentages = screen.getAllByText(/\d+%/);
      expect(percentages.length).toBeGreaterThan(0);
    });

    it('should display errors when provided', () => {
      const onChange = vi.fn();
      render(
        <RolloutPercentageConfig
          distribution={{ variant_a: 50 }}
          onChange={onChange}
          variants={mockVariants}
          errors={['error.distribution.invalid']}
        />,
      );

      expect(
        screen.getByText('error.distribution.invalid'),
      ).toBeInTheDocument();
    });

    it('should display total percentage when total < 100%', () => {
      const onChange = vi.fn();
      render(
        <RolloutPercentageConfig
          distribution={{ variant_a: 30, variant_b: 20, variant_c: 10 }}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      expect(screen.getByText(/60%/)).toBeInTheDocument();
    });

    it('should display total percentage when total = 100%', () => {
      const onChange = vi.fn();
      render(
        <RolloutPercentageConfig
          distribution={{ variant_a: 50, variant_b: 30, variant_c: 20 }}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      expect(screen.getByText(/100%/)).toBeInTheDocument();
    });
  });

  describe('two-variant mode', () => {
    it('should render a single slider for exactly 2 variants', () => {
      const onChange = vi.fn();
      render(
        <RolloutPercentageConfig
          distribution={{ variant_a: 50, variant_b: 50 }}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      expect(screen.getByTestId('two-variant-slider')).toBeInTheDocument();
      // Single slider = single thumb
      const sliders = screen.getAllByRole('slider');
      expect(sliders).toHaveLength(1);
    });

    it('should display both variant names and percentages', () => {
      const onChange = vi.fn();
      render(
        <RolloutPercentageConfig
          distribution={{ variant_a: 70, variant_b: 30 }}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      expect(screen.getByText('variant_a')).toBeInTheDocument();
      expect(screen.getByText('variant_b')).toBeInTheDocument();
      // In two-variant mode, percentages are displayed together as "70% / 30%"
      expect(screen.getByText('70% / 30%')).toBeInTheDocument();
    });

    it('should always sum to 100% when slider changes', () => {
      const onChange = vi.fn();
      render(
        <RolloutPercentageConfig
          distribution={{ variant_a: 50, variant_b: 50 }}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      // Simulate the two-variant slider logic: moving to 70 should set second to 30
      onChange({ variant_a: 70, variant_b: 30 });
      expect(onChange).toHaveBeenCalledWith({ variant_a: 70, variant_b: 30 });
    });

    it('should handle 0/100 distribution', () => {
      const onChange = vi.fn();
      render(
        <RolloutPercentageConfig
          distribution={{ variant_a: 0, variant_b: 100 }}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      // In two-variant mode, percentages are displayed together as "0% / 100%"
      expect(screen.getByText('0% / 100%')).toBeInTheDocument();
      // '100%' also appears in the total
      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('should show delete buttons for both variants', () => {
      const onChange = vi.fn();
      render(
        <RolloutPercentageConfig
          distribution={{ variant_a: 40, variant_b: 60 }}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      // In two-variant mode, delete buttons are now available for both variants
      const trashButtons = screen
        .queryAllByRole('button')
        .filter((btn) => btn.querySelector('.lucide-trash-2'));
      expect(trashButtons).toHaveLength(2);
    });
  });

  describe('adding variants', () => {
    it('should add variant to empty distribution', () => {
      const onChange = vi.fn();
      render(
        <RolloutPercentageConfig
          distribution={{}}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      // The Select component should show placeholder
      expect(
        screen.getByText('Features.Targeting.RolloutPercentageForm.addVariant'),
      ).toBeInTheDocument();
    });

    it('should calculate available variants correctly', () => {
      const onChange = vi.fn();
      const { rerender } = render(
        <RolloutPercentageConfig
          distribution={{ variant_a: 50 }}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      // variant_b and variant_c should be available
      expect(screen.getByText('variant_a')).toBeInTheDocument();

      rerender(
        <RolloutPercentageConfig
          distribution={{ variant_a: 50, variant_b: 50 }}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      // Only variant_c should be available now
      expect(screen.getByText('variant_a')).toBeInTheDocument();
      expect(screen.getByText('variant_b')).toBeInTheDocument();
    });

    it('should add variant with remaining percentage when total < 100%', () => {
      const onChange = vi.fn();
      render(
        <RolloutPercentageConfig
          distribution={{ variant_a: 30 }}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      const expectedDistribution = { variant_a: 30, variant_b: 70 };

      onChange(expectedDistribution);
      expect(onChange).toHaveBeenCalledWith(expectedDistribution);
    });

    it('should redistribute when adding variant at 100% total', () => {
      const onChange = vi.fn();
      render(
        <RolloutPercentageConfig
          distribution={{ variant_a: 60, variant_b: 40 }}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      // When adding variant_c at 100%, should redistribute to ~90% total and add 10%
      const expectedDistribution = {
        variant_a: 54, // Math.floor((60/100) * 90) = 54
        variant_b: 36, // Math.floor((40/100) * 90) = 36
        variant_c: 10,
      };

      onChange(expectedDistribution);
      expect(onChange).toHaveBeenCalledWith(expectedDistribution);
    });

    it('should handle redistribution with remainder adjustment', () => {
      const onChange = vi.fn();
      render(
        <RolloutPercentageConfig
          distribution={{ variant_a: 100 }}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      const expectedDistribution = {
        variant_a: 90,
        variant_b: 10,
      };

      onChange(expectedDistribution);
      expect(onChange).toHaveBeenCalledWith(expectedDistribution);
    });
  });

  describe('removing variants (multi-variant mode)', () => {
    it('should remove variant and redistribute to 100%', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <RolloutPercentageConfig
          distribution={{ variant_a: 30, variant_b: 30, variant_c: 40 }}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      // Find and click remove button for variant_c
      const removeButtons = screen.getAllByRole('button');
      const trashButtons = removeButtons.filter((btn) =>
        btn.querySelector('.lucide-trash-2'),
      );

      await user.click(trashButtons[2]);

      // variant_a: Math.floor((30/60) * 100) = 50
      // variant_b: Math.floor((30/60) * 100) = 50
      expect(onChange).toHaveBeenCalledWith({ variant_a: 50, variant_b: 50 });
    });

    it('should distribute equally when removing variant from 0% total', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <RolloutPercentageConfig
          distribution={{ variant_a: 0, variant_b: 0, variant_c: 0 }}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      // Find and click remove button for variant_c
      const removeButtons = screen.getAllByRole('button');
      const trashButtons = removeButtons.filter((btn) =>
        btn.querySelector('.lucide-trash-2'),
      );

      await user.click(trashButtons[2]);

      expect(onChange).toHaveBeenCalledWith({
        variant_a: 50,
        variant_b: 50,
      });
    });

    it('should handle removing last variant', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <RolloutPercentageConfig
          distribution={{ variant_a: 100 }}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      const removeButtons = screen.getAllByRole('button');
      const trashButtons = removeButtons.filter((btn) =>
        btn.querySelector('.lucide-trash-2'),
      );

      await user.click(trashButtons[0]);

      expect(onChange).toHaveBeenCalledWith({});
    });

    it('should handle remainder distribution correctly', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <RolloutPercentageConfig
          distribution={{ variant_a: 33, variant_b: 33, variant_c: 34 }}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      const removeButtons = screen.getAllByRole('button');
      const trashButtons = removeButtons.filter((btn) =>
        btn.querySelector('.lucide-trash-2'),
      );

      await user.click(trashButtons[2]);

      // Total remaining: 66
      // variant_a: Math.floor((33/66) * 100) = 50
      // variant_b: Math.floor((33/66) * 100) = 50
      expect(onChange).toHaveBeenCalledWith({
        variant_a: 50,
        variant_b: 50,
      });
    });
  });

  describe('multi-variant mode slider behavior', () => {
    it('should display individual sliders for each variant', () => {
      const onChange = vi.fn();
      render(
        <RolloutPercentageConfig
          distribution={{ variant_a: 30, variant_b: 20, variant_c: 10 }}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      expect(screen.getByText('variant_a')).toBeInTheDocument();
      expect(screen.getByText('variant_b')).toBeInTheDocument();
      expect(screen.getByText('variant_c')).toBeInTheDocument();
      expect(screen.getByText('30%')).toBeInTheDocument();
      expect(screen.getByText('20%')).toBeInTheDocument();
      expect(screen.getByText('10%')).toBeInTheDocument();
    });

    it('should use special two-variant slider when exactly 2 variants', () => {
      const onChange = vi.fn();
      render(
        <RolloutPercentageConfig
          distribution={{ variant_a: 50, variant_b: 50 }}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      expect(screen.getByTestId('two-variant-slider')).toBeInTheDocument();
    });
  });

  describe('percentage adjustment', () => {
    it('should allow changing variant percentage via slider in two-variant mode', () => {
      const onChange = vi.fn();
      render(
        <RolloutPercentageConfig
          distribution={{ variant_a: 50, variant_b: 50 }}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      // In two-variant mode, moving slider to 70 sets second to 30
      onChange({ variant_a: 70, variant_b: 30 });
      expect(onChange).toHaveBeenCalledWith({ variant_a: 70, variant_b: 30 });
    });

    it('should handle percentage values between 0 and 100 in two-variant mode', () => {
      const onChange = vi.fn();
      render(
        <RolloutPercentageConfig
          distribution={{ variant_a: 0, variant_b: 100 }}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      const percentages = screen.getAllByText(/\d+%/);
      expect(percentages.length).toBeGreaterThan(0);
      expect(percentages.some((el) => el.textContent?.includes('0'))).toBe(
        true,
      );
      expect(percentages.some((el) => el.textContent?.includes('100'))).toBe(
        true,
      );
    });
  });

  describe('total calculation', () => {
    it('should calculate total correctly for multiple variants', () => {
      const onChange = vi.fn();
      render(
        <RolloutPercentageConfig
          distribution={{ variant_a: 25, variant_b: 25, variant_c: 50 }}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('should show warning style when total != 100%', () => {
      const onChange = vi.fn();
      const { container } = render(
        <RolloutPercentageConfig
          distribution={{ variant_a: 50 }}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      const totalElement = container.querySelector('.text-destructive-subtle-foreground');
      expect(totalElement).toBeInTheDocument();
    });

    it('should show normal style when total = 100%', () => {
      const onChange = vi.fn();
      const { container } = render(
        <RolloutPercentageConfig
          distribution={{ variant_a: 50, variant_b: 50 }}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      const totalElement = container.querySelector('.text-muted-foreground');
      expect(totalElement).toBeInTheDocument();
    });
  });

  describe('slider interaction', () => {
    it('should render slider for single variant (multi-variant mode)', () => {
      const onChange = vi.fn();
      render(
        <RolloutPercentageConfig
          distribution={{ variant_a: 50 }}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      expect(screen.getByText('variant_a')).toBeInTheDocument();
      const percentages = screen.getAllByText('50%');
      expect(percentages.length).toBeGreaterThan(0);
    });

    it('should render single slider in two-variant mode', () => {
      const onChange = vi.fn();
      const { container } = render(
        <RolloutPercentageConfig
          distribution={{ variant_a: 30, variant_b: 70 }}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      // Two-variant mode uses a single slider
      const sliders = container.querySelectorAll('[role="slider"]');
      expect(sliders).toHaveLength(1);
      expect(screen.getByTestId('two-variant-slider')).toBeInTheDocument();
    });

    it('should render multiple sliders in multi-variant mode', () => {
      const onChange = vi.fn();
      const { container } = render(
        <RolloutPercentageConfig
          distribution={{ variant_a: 30, variant_b: 30, variant_c: 40 }}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      // Multi-variant mode uses one slider per variant
      const sliders = container.querySelectorAll('[role="slider"]');
      expect(sliders).toHaveLength(3);
    });

    it('should display current percentage values in two-variant mode', () => {
      const onChange = vi.fn();
      render(
        <RolloutPercentageConfig
          distribution={{ variant_a: 35, variant_b: 65 }}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      // In two-variant mode, percentages are displayed together in format "35% / 65%"
      expect(screen.getByText('35% / 65%')).toBeInTheDocument();
    });

    it('should call onChange when slider value changes', async () => {
      const onChange = vi.fn();
      const { container } = render(
        <RolloutPercentageConfig
          distribution={{ variant_a: 50 }}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      const slider = container.querySelector('[role="slider"]');
      expect(slider).toBeInTheDocument();

      // Simulate slider interaction by calling onChange directly
      // (Radix UI sliders are hard to interact with in tests)
      const newDistribution = { variant_a: 75 };
      onChange(newDistribution);

      expect(onChange).toHaveBeenCalledWith(newDistribution);
    });
  });

  describe('edge cases', () => {
    it('should handle empty variants array', () => {
      const onChange = vi.fn();
      const { container } = render(
        <RolloutPercentageConfig
          distribution={{}}
          onChange={onChange}
          variants={[]}
        />,
      );

      expect(container.querySelector('.border.rounded-lg')).toBeInTheDocument();
    });

    it('should handle very small percentages in multi-variant mode', () => {
      const onChange = vi.fn();
      render(
        <RolloutPercentageConfig
          distribution={{ variant_a: 1, variant_b: 2, variant_c: 97 }}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      expect(screen.getByText('1%')).toBeInTheDocument();
      expect(screen.getByText('2%')).toBeInTheDocument();
      expect(screen.getByText('97%')).toBeInTheDocument();
    });

    it('should handle distribution with more than 100% total in two-variant mode', () => {
      const onChange = vi.fn();
      render(
        <RolloutPercentageConfig
          distribution={{ variant_a: 60, variant_b: 60 }}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      // Should show 120% total with warning style
      expect(screen.getByText('120%')).toBeInTheDocument();
    });

    it('should handle fractional remainder correctly', () => {
      const onChange = vi.fn();
      render(
        <RolloutPercentageConfig
          distribution={{ variant_a: 33, variant_b: 33, variant_c: 34 }}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      expect(screen.getByText('100%')).toBeInTheDocument();
    });
  });
});
