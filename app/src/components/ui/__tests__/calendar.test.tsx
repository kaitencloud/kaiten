import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import { Calendar } from '../calendar';

const MARCH_2027 = new Date(2027, 2, 1, 12);

const firstWeekday = () =>
  document.querySelector('.rdp-weekday')?.getAttribute('aria-label');

afterEach(async () => {
  await testI18n.changeLanguage('en');
});

describe('the calendar', () => {
  it('speaks English, with the first day of the week on Sunday', () => {
    render(<Calendar mode="single" month={MARCH_2027} />);

    expect(screen.getByText('March 2027')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Go to the Previous Month/ }),
    ).toBeInTheDocument();
    expect(firstWeekday()).toBe('Sunday');
  });

  it('speaks the language of the app, not the one of the browser', async () => {
    await testI18n.changeLanguage('fr');
    render(<Calendar mode="single" month={MARCH_2027} />);

    expect(screen.getByText('mars 2027')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Aller au mois précédent/ }),
    ).toBeInTheDocument();
    expect(firstWeekday()).toBe('lundi');
  });

  it('marks each day with its day, whatever the language', () => {
    render(<Calendar mode="single" month={MARCH_2027} />);

    expect(
      document.querySelector('button[data-day="2027-03-01"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('button[data-day="2027-03-31"]'),
    ).not.toBeNull();
  });

  it('keeps its days in the page when it renders again, so a click that made it render still lands', () => {
    const { rerender } = render(<Calendar mode="single" month={MARCH_2027} />);
    const day = document.querySelector('button[data-day="2027-03-05"]');

    rerender(<Calendar mode="single" month={MARCH_2027} />);

    expect(document.querySelector('button[data-day="2027-03-05"]')).toBe(day);
  });
});
