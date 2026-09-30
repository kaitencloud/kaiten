// Shown only to organizations the `demo-sandbox` platform flag marks as
// sandboxes (instance metadata demo=true). Import sites load it lazily behind that flag
// (see routes/__root.tsx, routes/settings/index.tsx), so other tenants never
// download it.
export { DemoBanner, DemoSettingsCard } from './components';
