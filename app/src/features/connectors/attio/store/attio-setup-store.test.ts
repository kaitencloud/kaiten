import { describe, expect, it } from 'vite-plus/test';
import { createAttioSetupStore } from './attio-setup-store';

describe('createAttioSetupStore', () => {
  it('clears secrets and draft mappings when the wizard is cancelled', () => {
    const { actions, store } = createAttioSetupStore();

    actions.openWizard();
    actions.setApiToken('atk_live_secret');
    actions.setSyncPolicy('fail-and-retry');
    actions.updateMappingRow(store.state.mappingRows[0].id, {
      attioSlug: 'external_id',
      sourceField: 'customer.id',
    });
    actions.backToIndex();

    expect(store.state).toMatchObject({
      apiToken: '',
      syncPolicy: 'create-and-bind',
      view: 'index',
    });
    expect(store.state.mappingRows).toHaveLength(1);
    expect(store.state.mappingRows[0]).toMatchObject({
      attioSlug: null,
      sourceField: null,
    });
  });
});
