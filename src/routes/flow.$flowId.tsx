import { createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import LoadingScreen from '../components/LoadingScreen';

const FlowPage = lazy(() => import('../components/FlowPage'));

export const Route = createFileRoute('/flow/$flowId')({
  component: () => (
    <Suspense fallback={<LoadingScreen message="flows" subMessage="Loading flow..." />}>
      <FlowPage />
    </Suspense>
  ),
});
