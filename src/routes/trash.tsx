import { createFileRoute } from '@tanstack/react-router';
import TrashPage from '../components/TrashPage';

export const Route = createFileRoute('/trash')({
  component: TrashPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      search: (search.search as string) || undefined,
      filter: (search.filter === 'all' ||
      search.filter === 'notes' ||
      search.filter === 'flows' ||
      search.filter === 'folders' ||
      search.filter === 'categories'
        ? search.filter
        : undefined) as 'all' | 'notes' | 'flows' | 'folders' | 'categories' | undefined,
    };
  },
});
