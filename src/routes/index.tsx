import { createFileRoute } from '@tanstack/react-router';
import HomePage from '../components/HomePage';

export const Route = createFileRoute('/')({
  component: HomePage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      search: (search.search as string) || undefined,
      sort: (search.sort === 'title' || search.sort === 'date' ? search.sort : undefined) as 'title' | 'date' | undefined,
      flowSort: (search.flowSort === 'title' || search.flowSort === 'date' ? search.flowSort : undefined) as 'title' | 'date' | undefined,
    };
  },
});

