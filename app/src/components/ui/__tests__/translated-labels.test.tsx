import { render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';
import { NumberInput } from '../number-input';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '../sheet';

// The names these primitives give their controls come from the locale files, so a
// French session must read French ones. `check:i18n-keys` proves the keys exist; only a
// test in French can tell a label that went back to a literal.
beforeAll(async () => {
  testI18n.addResourceBundle('en', 'translation', en, true, true);
  testI18n.addResourceBundle('fr', 'translation', fr, true, true);
  await testI18n.changeLanguage('fr');
});

afterAll(async () => {
  await testI18n.changeLanguage('en');
});

describe('the labels of the UI primitives, in French', () => {
  it('names the steppers of a number input', () => {
    render(<NumberInput aria-label="Quantité" />);

    expect(
      screen.getByRole('button', { name: 'Augmenter la valeur' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Diminuer la valeur' }),
    ).toBeInTheDocument();
  });

  it('names the close button of a sheet', async () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Historique</SheetTitle>
          <SheetDescription>Détail</SheetDescription>
        </SheetContent>
      </Sheet>,
    );

    expect(
      await screen.findByRole('button', { name: 'Fermer' }),
    ).toBeInTheDocument();
  });
});
