import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vite-plus/test';
import { Slider } from '../slider';

function ControlledSlider() {
  const [value, setValue] = useState(0);

  return (
    <Slider
      aria-label="Allowance"
      value={[value]}
      min={0}
      max={100}
      step={1}
      onValueChange={([next]) => setValue(next)}
    />
  );
}

describe('Slider', () => {
  // A thumb keyed by its own value remounts on every change, so the second
  // arrow press lands on nothing.
  it('keeps the focused thumb across repeated keystrokes', async () => {
    const user = userEvent.setup();

    render(<ControlledSlider />);

    const thumb = await screen.findByRole('slider');
    thumb.focus();

    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');

    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '3');
    expect(screen.getByRole('slider')).toHaveFocus();
  });

  it('names the thumb of a single-value slider', async () => {
    render(<ControlledSlider />);

    expect(await screen.findByRole('slider', { name: 'Allowance' })).toBeVisible();
  });
});
