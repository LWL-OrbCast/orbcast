import { I18nextProvider } from 'react-i18next';
import i18n from './lib/i18n';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { WebAuthRoot } from './lib/auth';
import { BuilderFeeSync } from './lib/builderFee';
import { Shell } from './ui/Shell';
import { HomePage, MarketsPage } from './ui/catalog';
import { MarketPage } from './ui/MarketPage';
import { PositionsPage } from './ui/PositionsPage';
import { RewardsPage } from './ui/RewardsPage';
import { WalletPage } from './ui/WalletPage';
import { FeesPage } from './ui/FeesPage';
import { LoginPage } from './ui/LoginPage';
import { PrivacyPage, TermsPage } from './ui/LegalPages';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

export function App() {
  return (
    <ErrorBoundary>
      <I18nextProvider i18n={i18n}>
      <WebAuthRoot>
        <QueryClientProvider client={queryClient}>
          <BuilderFeeSync />
          <BrowserRouter>
            <Routes>
              <Route element={<Shell />}>
                <Route index element={<HomePage />} />
                <Route path="markets" element={<MarketsPage />} />
                <Route path="market/:id" element={<MarketPage />} />
                <Route path="positions" element={<PositionsPage />} />
                <Route path="rewards" element={<RewardsPage />} />
                <Route path="wallet" element={<WalletPage />} />
                <Route path="fees" element={<FeesPage />} />
                <Route path="login" element={<LoginPage />} />
                <Route path="terms" element={<TermsPage />} />
                <Route path="privacy" element={<PrivacyPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </QueryClientProvider>
      </WebAuthRoot>
      </I18nextProvider>
    </ErrorBoundary>
  );
}
