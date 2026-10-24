import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  ActionAccordion,
  ActionAccordionContent,
  ActionAccordionItem,
  ActionAccordionTrigger,
} from '../action-accordion';

const groups = (ids: string[]) => (
  <>
    {ids.map((id) => (
      <ActionAccordionItem key={id} value={id}>
        <ActionAccordionTrigger>{`Group ${id}`}</ActionAccordionTrigger>
        <ActionAccordionContent>{`Content of ${id}`}</ActionAccordionContent>
      </ActionAccordionItem>
    ))}
  </>
);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ActionAccordion', () => {
  it('opens the group it was given when it first drew, and keeps it when a list that follows its data hands another', () => {
    // A list passes the first of its groups. When a refetch puts another one first, the
    // accordion has already drawn: Base UI ignores the new default and says so in the
    // console, which is noise the person who reads the console cannot tell from a real error.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(
      <ActionAccordion defaultValue={['b']} multiple>
        {groups(['b', 'c'])}
      </ActionAccordion>,
    );

    rerender(
      <ActionAccordion defaultValue={['a']} multiple>
        {groups(['a', 'b', 'c'])}
      </ActionAccordion>,
    );

    expect(
      screen.getByRole('button', { name: 'Group b' }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByRole('button', { name: 'Group a' }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(error).not.toHaveBeenCalled();
  });
});
