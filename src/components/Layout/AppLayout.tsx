import { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { useLocation, Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(() => {
    const stored = localStorage.getItem('pinn-sidebar-collapsed');
    return stored === 'true';
  });
  const location = useLocation();

  useEffect(() => {
    localStorage.setItem('pinn-sidebar-collapsed', String(collapsed));
  }, [collapsed]);

  // Generate breadcrumbs based on path
  const getBreadcrumbs = () => {
    const path = location.pathname;
    const parts = path.split('/').filter(Boolean);
    const crumbs = [{ label: 'Home', path: '/' }];

    if (parts.length > 0) {
      if (parts[0] === 'notes') {
        crumbs.push({ label: 'Notes', path: '/notes' });
      } else if (parts[0] === 'flows') {
        crumbs.push({ label: 'Flows', path: '/flows' });
      } else if (parts[0] === 'note') {
        crumbs.push({ label: 'Notes', path: '/notes' });
        if (parts[1]) {
          // If we are editing/viewing a note, add it as the leaf
          crumbs.push({ label: parts[1] === 'new' ? 'New Note' : 'Edit Note', path: path });
        }
      } else if (parts[0] === 'flow') {
        crumbs.push({ label: 'Flows', path: '/flows' });
        if (parts[1]) {
          crumbs.push({ label: 'Edit Flow', path: path });
        }
      } else {
        // Fallback generic generator
        let currentPath = '';
        parts.forEach(part => {
          currentPath += `/${part}`;
          crumbs.push({
            label: part.charAt(0).toUpperCase() + part.slice(1),
            path: currentPath,
          });
        });
      }
    }

    return crumbs;
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Breadcrumb Header */}
        <header className="flex items-center h-14 border-b px-4 shrink-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <nav className="flex items-center text-sm text-muted-foreground">
            {breadcrumbs.map((crumb, index) => (
              <div key={crumb.path} className="flex items-center">
                {index > 0 && <ChevronRight className="h-4 w-4 mx-1" />}
                {index === breadcrumbs.length - 1 ? (
                  <span className="text-foreground font-medium">{crumb.label}</span>
                ) : (
                  <Link to={crumb.path} className="hover:text-foreground transition-colors">
                    {crumb.label}
                  </Link>
                )}
              </div>
            ))}
          </nav>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
