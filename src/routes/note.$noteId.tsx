import { createFileRoute } from '@tanstack/react-router';
import EditorPage from '../components/EditorPage';

export const Route = createFileRoute('/note/$noteId')({
  component: EditorPage,
});
