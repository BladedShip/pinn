import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { getNotes } from '../lib/storage';
import { getFlows, createFlow } from '../lib/flowStorage';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Plus, Book, GitBranch, Clock, ArrowRight } from 'lucide-react';
import { formatDate } from '../utils/date';

export const Route = createFileRoute('/')({
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const [recentNotes, setRecentNotes] = useState<any[]>([]);
  const [recentFlows, setRecentFlows] = useState<any[]>([]);
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    // Set greeting based on time
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning');
    else if (hour < 18) setGreeting('Good afternoon');
    else setGreeting('Good evening');

    // Load data
    const notes = getNotes() || [];
    const flows = getFlows() || [];

    // Sort by updated_at and take top 5
    const sortedNotes = [...notes].sort((a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    ).slice(0, 5);

    const sortedFlows = [...flows].sort((a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    ).slice(0, 5);

    setRecentNotes(sortedNotes);
    setRecentFlows(sortedFlows);
  }, []);

  const handleCreateFlow = () => {
    const newFlow = createFlow('Untitled Flow');
    navigate({ to: '/flow/$flowId', params: { flowId: newFlow.id } });
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-light text-foreground">{greeting}, User</h1>
          <p className="text-muted-foreground mt-1">Welcome back to your workspace.</p>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => navigate({ to: '/note/new' })} className="gap-2">
            <Plus className="h-4 w-4" /> New Note
          </Button>
          <Button onClick={handleCreateFlow} variant="secondary" className="gap-2">
            <Plus className="h-4 w-4" /> New Flow
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recent Notes */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Book className="h-5 w-5 text-muted-foreground" /> Recent Notes
            </h2>
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: '/notes' })} className="text-muted-foreground hover:text-foreground">
              View All <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>

          {recentNotes.length > 0 ? (
            <div className="grid gap-3">
              {recentNotes.map((note) => (
                <Card
                  key={note.id}
                  className="hover:bg-accent/50 transition-colors cursor-pointer border-border"
                  onClick={() => navigate({ to: '/note/$noteId', params: { noteId: note.id } })}
                >
                  <CardContent className="p-4 flex justify-between items-center">
                    <div className="truncate pr-4">
                      <h3 className="font-medium truncate">{note.title || 'Untitled'}</h3>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                        {note.content?.slice(0, 100).replace(/[#*`]/g, '') || 'No content'}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {formatDate(note.updated_at)}
                    </span>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="border-dashed bg-transparent shadow-none">
              <CardContent className="p-8 text-center text-muted-foreground flex flex-col items-center gap-2">
                <Book className="h-8 w-8 opacity-50" />
                <p>No notes yet. Start capturing your thoughts.</p>
                <Button variant="outline" size="sm" onClick={() => navigate({ to: '/note/new' })} className="mt-2">
                  Create First Note
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Recent Flows */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-muted-foreground" /> Recent Flows
            </h2>
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: '/flows' })} className="text-muted-foreground hover:text-foreground">
              View All <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>

          {recentFlows.length > 0 ? (
            <div className="grid gap-3">
              {recentFlows.map((flow) => (
                <Card
                  key={flow.id}
                  className="hover:bg-accent/50 transition-colors cursor-pointer border-border"
                  onClick={() => navigate({ to: '/flow/$flowId', params: { flowId: flow.id } })}
                >
                  <CardContent className="p-4 flex justify-between items-center">
                    <div className="truncate pr-4">
                      <h3 className="font-medium truncate">{flow.title || 'Untitled Flow'}</h3>
                      <div className="flex gap-2 mt-1">
                        {flow.tags?.slice(0, 3).map((tag: string) => (
                          <span key={tag} className="text-[10px] bg-secondary px-1.5 py-0.5 rounded text-secondary-foreground">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {formatDate(flow.updated_at)}
                    </span>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="border-dashed bg-transparent shadow-none">
              <CardContent className="p-8 text-center text-muted-foreground flex flex-col items-center gap-2">
                <GitBranch className="h-8 w-8 opacity-50" />
                <p>No flows yet. Visualize your ideas.</p>
                <Button variant="outline" size="sm" onClick={handleCreateFlow} className="mt-2">
                  Create First Flow
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
