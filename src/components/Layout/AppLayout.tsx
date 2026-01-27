import { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { useLocation } from '@tanstack/react-router';
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

    let currentPath = '';
    parts.forEach((part, index) => {
      currentPath += `/${part}`;
      // Basic mapping, could be more sophisticated with route meta
      let label = part.charAt(0).toUpperCase() + part.slice(1);
      if (part === 'note' && parts[index+1]) return; // Skip 'note' segment if ID follows
      if (part === 'flow' && parts[index+1]) return;
      if (index > 0 && (parts[index-1] === 'note' || parts[index-1] === 'flow')) {
          label = 'Details'; // Placeholder, ideally we fetch title
      }

      crumbs.push({ label, path: currentPath });
    });

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
                <span className={index === breadcrumbs.length - 1 ? "text-foreground font-medium" : ""}>
                  {crumb.label}
                </span>
              </div>
            ))}
          </nav>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
