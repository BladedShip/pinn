import { createFileRoute } from '@tanstack/react-router';
import FlowsPage from '../components/FlowsPage';

export const Route = createFileRoute('/flows')({
  component: FlowsPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      search: (search.search as string) || undefined,
      sort: (search.sort === 'title' || search.sort === 'date' ? search.sort : undefined) as
        | 'title'
        | 'date'
        | undefined,
      category: (search.category as string) || undefined,
    };
  },
});
