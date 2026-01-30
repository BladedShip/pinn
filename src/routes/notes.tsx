import { createFileRoute } from '@tanstack/react-router';
import NotesPage from '../components/NotesPage';

export const Route = createFileRoute('/notes')({
  component: NotesPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      search: (search.search as string) || undefined,
      sort: (search.sort === 'title' || search.sort === 'date' ? search.sort : undefined) as
        | 'title'
        | 'date'
        | undefined,
      dateFilter: (search.dateFilter === 'all' ||
      search.dateFilter === 'today' ||
      search.dateFilter === 'week' ||
      search.dateFilter === 'month'
        ? search.dateFilter
        : undefined) as 'all' | 'today' | 'week' | 'month' | undefined,
      tagFilter: (search.tagFilter as string) || undefined,
      folder: (search.folder as string) || undefined,
    };
  },
});
