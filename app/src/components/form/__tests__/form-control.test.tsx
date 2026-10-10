import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';
import FormControl from '../form-control';
import FormItem from '../form-item';

describe('FormControl', () => {
  it('marks the control of a required field as required', () => {
    render(
      <FormItem required>
        <FormControl>
          <input aria-label="Name" />
        </FormControl>
      </FormItem>,
    );

    expect(screen.getByLabelText('Name')).toHaveAttribute(
      'aria-required',
      'true',
    );
  });

  it('leaves aria-required off a control whose role refuses it', () => {
    render(
      <FormItem required>
        <FormControl announceRequired={false}>
          <button type="button">Pick a date</button>
        </FormControl>
      </FormItem>,
    );

    expect(
      screen.getByRole('button', { name: 'Pick a date' }),
    ).not.toHaveAttribute('aria-required');
  });

  it('adds nothing to the control of an optional field', () => {
    render(
      <FormItem>
        <FormControl>
          <input aria-label="Note" />
        </FormControl>
      </FormItem>,
    );

    expect(screen.getByLabelText('Note')).not.toHaveAttribute('aria-required');
  });
});
