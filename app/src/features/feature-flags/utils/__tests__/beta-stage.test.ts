import { describe, expect, it } from 'vite-plus/test';
import {
  betaCopyOf,
  betaStageOf,
  isListedBetaStage,
  withBetaCopy,
  withBetaStage,
} from '../beta-stage';

describe('betaStageOf', () => {
  it('reads a stage the convention names', () => {
    expect(betaStageOf({ stage: 'public_beta' })).toBe('public_beta');
  });

  it.each([{}, { stage: 'ga' }, { stage: 3 }, null, undefined])(
    'reads no stage from %o',
    (metadata) => {
      expect(betaStageOf(metadata)).toBeNull();
    },
  );
});

describe('isListedBetaStage', () => {
  it('lists the stages a customer may see, not a private beta', () => {
    expect(isListedBetaStage('public_beta')).toBe(true);
    expect(isListedBetaStage('open_beta')).toBe(true);
    expect(isListedBetaStage('private_beta')).toBe(false);
    expect(isListedBetaStage(null)).toBe(false);
  });
});

describe('withBetaStage', () => {
  const metadata = {
    fallback_value: false,
    owner: 'growth',
    stage: 'private_beta',
    title: 'Order Forecast',
  };

  it('sets the stage and keeps every other key', () => {
    expect(withBetaStage(metadata, 'public_beta')).toEqual({
      ...metadata,
      stage: 'public_beta',
    });
  });

  it('removes the key for a flag that is not a beta, and keeps the copy', () => {
    expect(withBetaStage(metadata, null)).toEqual({
      fallback_value: false,
      owner: 'growth',
      title: 'Order Forecast',
    });
  });

  it('does not change the metadata it was given', () => {
    withBetaStage(metadata, null);
    expect(metadata.stage).toBe('private_beta');
  });
});

describe('the copy shown to customers', () => {
  it('reads a key that is not a string as empty', () => {
    expect(betaCopyOf({ title: 12 }, 'title')).toBe('');
    expect(betaCopyOf({ title: 'Order Forecast' }, 'title')).toBe(
      'Order Forecast',
    );
  });

  it('sets one key and keeps the others', () => {
    expect(
      withBetaCopy({ stage: 'open_beta' }, 'description', 'Forecast orders.'),
    ).toEqual({ stage: 'open_beta', description: 'Forecast orders.' });
  });

  it('removes the key when the copy is emptied', () => {
    expect(
      withBetaCopy({ stage: 'open_beta', title: 'Order Forecast' }, 'title', ' '),
    ).toEqual({ stage: 'open_beta' });
  });
});
