import { Suspense } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router';
import { useAuthStore } from '../store/auth';
import { saveReturnUrl } from '../utils/token';
import Layout from '../components/layout/Layout';
import PageLoader from '../components/common/PageLoader';
import { ErrorBoundary } from '../components/ErrorBoundary';
import DeepLinkRedirect from './DeepLinkRedirect';
import ConnectPage from './ConnectPage';

/**
 * Dispatcher for `/connect`.
 *
 * `/connect` is BOTH the Подключить tab (IA §1.3) AND a public deep-link landing
 * the bot links to (e.g. `/connect?url=happ://...`). We branch on the presence of
 * a deep-link query param:
 *  - with `?url`/`?deeplink` → the PUBLIC `DeepLinkRedirect` (no auth, no shell),
 *    so existing bot links keep redirecting to the app exactly as before;
 *  - bare `/connect` → the new connect flow, gated by auth and wrapped in the
 *    app shell (so the bottom nav / header render around it).
 */
export default function ConnectRoute() {
  const [params] = useSearchParams();
  const location = useLocation();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);

  const hasDeepLink = params.has('url') || params.has('deeplink');
  if (hasDeepLink) {
    return <DeepLinkRedirect />;
  }

  if (isLoading) {
    return <PageLoader variant="dark" />;
  }
  if (!isAuthenticated) {
    saveReturnUrl();
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return (
    <Layout>
      <ErrorBoundary level="page">
        <Suspense fallback={<PageLoader variant="dark" />}>
          <ConnectPage />
        </Suspense>
      </ErrorBoundary>
    </Layout>
  );
}
