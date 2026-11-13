// AI.Access (en): what the AI screens say while access is checked or refused.
export default {
  loading: 'Checking AI availability…',
  denied:
    'Your session cannot read AI pricing. Contact an administrator for license read access.',
  modelsReadDenied:
    'Your session cannot read the model catalogue. Contact an administrator for model read access.',
  modelDenied:
    'Your session cannot edit models. Contact an administrator for model write access.',
  backToEntitlement: 'Back to entitlement',
} as const;
