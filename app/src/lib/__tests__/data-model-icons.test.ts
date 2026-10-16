import { Receipt, ReceiptText, SquareLibrary } from 'lucide-react';
import { describe, expect, it } from 'vite-plus/test';
import { dataModelIcons } from '../data-model-icons';

describe('dataModelIcons', () => {
  it('draws an invoice as a receipt with its lines of text', () => {
    expect(dataModelIcons.invoice).toBe(ReceiptText);
  });

  it('keeps the receipt with the dollar sign for the Billing area, apart from the invoice', () => {
    expect(dataModelIcons.billing).toBe(Receipt);
    expect(dataModelIcons.billing).not.toBe(dataModelIcons.invoice);
  });

  it('draws the Catalog section as a library, apart from the license it holds', () => {
    expect(dataModelIcons.catalog).toBe(SquareLibrary);
    expect(dataModelIcons.catalog).not.toBe(dataModelIcons.license);
  });

  it('gives every entry a glyph of its own, so that none stands for another', () => {
    const glyphs = Object.values(dataModelIcons);

    expect(new Set(glyphs).size).toBe(glyphs.length);
  });
});
