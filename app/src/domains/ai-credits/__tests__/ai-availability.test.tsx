import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import i18n from 'i18next';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import en from '@/lib/i18n/locales/en';
import { grantedScopesQueryKey } from '@/lib/granted-scopes';
import { AiAvailability } from '../ai-availability';
import { useAiAccess } from '../use-ai-access';

const evaluate = vi.hoisted(() => vi.fn<() => Promise<boolean>>());
vi.mock('@/lib/feature-flags', () => ({ aiCreditsFlagQueryOptions: { queryKey: ['test-ai-availability'], queryFn: evaluate, retry: false } }));
beforeEach(async () => { evaluate.mockReset(); i18n.addResourceBundle('en', 'translation', en, true, true); await i18n.changeLanguage('en'); });
function renderAvailability() {
  const entered = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(grantedScopesQueryKey, null);
  function Content() { entered(); return <p>Configuration reads enabled</p>; }
  function Probe() { const access = useAiAccess(); return <AiAvailability access={access}><Content /></AiAvailability>; }
  render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>);
  return entered;
}
it('shows a scoped loading state without mounting configuration reads', () => {
  evaluate.mockImplementation(() => new Promise(() => {}));
  const entered = renderAvailability();
  expect(screen.getByRole('status')).toHaveTextContent(en.AI.Calculation.loadingAccess);
  expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  expect(entered).not.toHaveBeenCalled();
});
it.each(['false', 'failed evaluation'])('truthfully explains unavailable calculation and retries without a 404 (%s)', async (state) => {
  if (state === 'false') evaluate.mockResolvedValue(false);
  else evaluate.mockRejectedValue(new Error('Flag service unavailable'));
  const entered = renderAvailability();
  expect(await screen.findByText(en.AI.Calculation.unavailable)).toBeInTheDocument();
  expect(entered).not.toHaveBeenCalled();
  evaluate.mockResolvedValue(true);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(screen.getByText('Configuration reads enabled')).toBeInTheDocument());
});
