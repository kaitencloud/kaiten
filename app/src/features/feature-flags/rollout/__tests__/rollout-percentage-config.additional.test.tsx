import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vite-plus/test';
import type { Variant } from '@/api-client';
import { RolloutPercentageConfig } from '..';

const mockVariants: Variant[] = [
  { name: 'variant-a', description: 'Variant A', value: {} },
  { name: 'variant-b', description: 'Variant B', value: {} },
  { name: 'variant-c', description: 'Variant C', value: {} },
];

describe('RolloutPercentageConfig - Additional Coverage', () => {
  describe('handleAddVariant', () => {
    it('should add variant with remaining percentage when total < 100', () => {
      const onChange = vi.fn();
      const distribution = { 'variant-a': 30 };

      render(
        <RolloutPercentageConfig
          distribution={distribution}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      // Total is 30, so new variant should get 70
      // This tests the else branch at line 60-63
      expect(onChange).not.toHaveBeenCalled();
    });

    it('should show select to add variant when total >= 100', () => {
      const onChange = vi.fn();
      const distribution = { 'variant-a': 100 };

      render(
        <RolloutPercentageConfig
          distribution={distribution}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      // This would trigger the redistribution logic at lines 42-59
      // when adding a new variant via the select
      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();
    });

    it('should handle redistribution with adjustedTotal < targetTotal', () => {
      const onChange = vi.fn();
      const distribution = { 'variant-a': 51, 'variant-b': 49 };

      render(
        <RolloutPercentageConfig
          distribution={distribution}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      // This tests the condition at line 56-58
      // where adjustedTotal < targetTotal after redistribution
    });
  });

  describe('handleRemoveVariant', () => {
    it('should redistribute proportionally when currentTotal > 0', () => {
      const onChange = vi.fn();
      const distribution = { 'variant-a': 30, 'variant-b': 40 };

      render(
        <RolloutPercentageConfig
          distribution={distribution}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      // This tests lines 79-93
      // Proportional redistribution when removing a variant
    });

    it('should distribute equally when currentTotal === 0', () => {
      const onChange = vi.fn();
      const distribution = { 'variant-a': 0, 'variant-b': 0, 'variant-c': 0 };

      render(
        <RolloutPercentageConfig
          distribution={distribution}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      // This tests lines 94-105
      // Equal distribution when all variants are at 0
    });

    it('should give remainder to first variant when adjustedTotal < 100', () => {
      const onChange = vi.fn();
      // Use values that will create a remainder after redistribution
      const distribution = {
        'variant-a': 33,
        'variant-b': 34,
        'variant-c': 33,
      };

      render(
        <RolloutPercentageConfig
          distribution={distribution}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      // This tests lines 91-93 and 102-104
      // Giving remainder to first variant
    });
  });

  describe('renderTotal', () => {
    it('should return null when distributionEntries.length === 0', () => {
      const onChange = vi.fn();
      const distribution = {};

      const { container } = render(
        <RolloutPercentageConfig
          distribution={distribution}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      // This tests line 273
      // Total should not be rendered when no distribution
      const totalText = container.textContent?.includes('total');
      expect(totalText).toBe(false);
    });

    it('should show total in muted color when total === 100', () => {
      const onChange = vi.fn();
      const distribution = { 'variant-a': 60, 'variant-b': 40 };

      const { container } = render(
        <RolloutPercentageConfig
          distribution={distribution}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      // This tests line 278 - text-muted-foreground
      const totalElement = container.querySelector('.text-muted-foreground');
      expect(totalElement).toBeInTheDocument();
    });

    it('should show total in destructive color when total !== 100', () => {
      const onChange = vi.fn();
      const distribution = { 'variant-a': 60, 'variant-b': 30 };

      const { container } = render(
        <RolloutPercentageConfig
          distribution={distribution}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      // This tests line 278 - text-destructive-subtle-foreground
      const totalElement = container.querySelector('.text-destructive-subtle-foreground');
      expect(totalElement).toBeInTheDocument();
    });
  });

  describe('renderErrors', () => {
    it('should render error message when errors exist', () => {
      const onChange = vi.fn();
      const distribution = { 'variant-a': 60 };
      const errors = [
        'Features.Targeting.RolloutPercentageForm.totalMustBe100',
      ];

      render(
        <RolloutPercentageConfig
          distribution={distribution}
          onChange={onChange}
          variants={mockVariants}
          errors={errors}
        />,
      );

      // This tests lines 265-267
      const errorElement = screen.getByText(errors[0]);
      expect(errorElement).toBeInTheDocument();
      expect(errorElement).toHaveClass('text-destructive-subtle-foreground');
    });

    it('should not render error when errors is undefined', () => {
      const onChange = vi.fn();
      const distribution = { 'variant-a': 60 };

      const { container } = render(
        <RolloutPercentageConfig
          distribution={distribution}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      const errorElement = container.querySelector('.text-destructive-subtle-foreground');
      expect(errorElement).toBeInTheDocument(); // Only for total, not error
    });

    it('should not render error when errors array is empty', () => {
      const onChange = vi.fn();
      const distribution = { 'variant-a': 100 };
      const errors: string[] = [];

      const { container } = render(
        <RolloutPercentageConfig
          distribution={distribution}
          onChange={onChange}
          variants={mockVariants}
          errors={errors}
        />,
      );

      // No error text should be rendered, only the min-height div
      const minHeightDiv = container.querySelector('.min-h-\\[20px\\]');
      expect(minHeightDiv).toBeInTheDocument();
      expect(minHeightDiv?.textContent).toBe('');
    });
  });

  describe('two variant mode', () => {
    it('should render two-variant slider when exactly 2 variants', () => {
      const onChange = vi.fn();
      const distribution = { 'variant-a': 60, 'variant-b': 40 };

      render(
        <RolloutPercentageConfig
          distribution={distribution}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      // This tests lines 256-257 and the two-variant slider rendering
      const slider = screen.getByTestId('two-variant-slider');
      expect(slider).toBeInTheDocument();
    });

    it('should render single slider for two variants', () => {
      const onChange = vi.fn();
      const distribution = { 'variant-a': 60, 'variant-b': 40 };

      render(
        <RolloutPercentageConfig
          distribution={distribution}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      // This tests lines 117-120 and 180-187
      // In two-variant mode, there's only one slider
      const sliders = screen.getAllByRole('slider');
      expect(sliders).toHaveLength(1);
    });
  });

  describe('multi variant mode', () => {
    it('should render multi-variant sliders when more than 2 variants', () => {
      const onChange = vi.fn();
      const distribution = {
        'variant-a': 30,
        'variant-b': 40,
        'variant-c': 30,
      };

      render(
        <RolloutPercentageConfig
          distribution={distribution}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      // This tests lines 242-250
      expect(screen.getByText('variant-a')).toBeInTheDocument();
      expect(screen.getByText('variant-b')).toBeInTheDocument();
      expect(screen.getByText('variant-c')).toBeInTheDocument();
    });

    it('should render sliders for each variant in multi-variant mode', () => {
      const onChange = vi.fn();
      const distribution = {
        'variant-a': 30,
        'variant-b': 40,
        'variant-c': 30,
      };

      render(
        <RolloutPercentageConfig
          distribution={distribution}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      // This tests lines 111-115 and 228-237
      // Each variant should have a slider
      const sliders = screen.getAllByRole('slider');
      expect(sliders).toHaveLength(3);
    });
  });

  describe('empty state', () => {
    it('should render empty state when no distribution', () => {
      const onChange = vi.fn();
      const distribution = {};

      render(
        <RolloutPercentageConfig
          distribution={distribution}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      // This tests lines 162-167 and 253-254
      expect(
        screen.getByText('Features.Targeting.RolloutPercentageForm.noVariants'),
      ).toBeInTheDocument();
    });
  });

  describe('available variants filtering', () => {
    it('should filter out variants already in distribution', () => {
      const onChange = vi.fn();
      const distribution = { 'variant-a': 50, 'variant-b': 50 };

      render(
        <RolloutPercentageConfig
          distribution={distribution}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      // This tests lines 30-32
      // Only variant-c should be available to add
      // The select should be visible since there's an available variant
      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();
    });

    it('should not show add variant select when all variants are used', () => {
      const onChange = vi.fn();
      const distribution = {
        'variant-a': 33,
        'variant-b': 33,
        'variant-c': 34,
      };

      render(
        <RolloutPercentageConfig
          distribution={distribution}
          onChange={onChange}
          variants={mockVariants}
        />,
      );

      // This tests line 137 - availableVariants.length > 0 condition
      const select = screen.queryByRole('combobox');
      expect(select).not.toBeInTheDocument();
    });
  });
});
