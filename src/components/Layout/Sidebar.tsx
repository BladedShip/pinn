import { useState } from 'react';
import { useNavigate, useLocation } from '@tanstack/react-router';
import {
  Book,
  GitBranch,
  Settings,
  ChevronLeft,
  ChevronRight,
  Plus,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { Separator } from '../ui/separator';
import SettingsDialog from '../SettingsDialog';

interface SidebarProps {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

export function Sidebar({ collapsed, setCollapsed }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [showSettings, setShowSettings] = useState(false);

  const isActive = (path: string) => {
    if (path === '/' && location.pathname === '/') return true;
    if (path !== '/' && location.pathname.startsWith(path)) return true;
    return false;
  };

  const navItems = [
    { icon: Book, label: 'Notes', path: '/notes' },
    { icon: GitBranch, label: 'Flows', path: '/flows' },
  ];

  return (
    <>
      <div
        className={cn(
          "group relative flex flex-col border-r bg-card transition-all duration-300 ease-in-out",
          collapsed ? "w-[60px]" : "w-[240px]"
        )}
      >
        <div className="flex h-14 items-center justify-between px-3 border-b">
          {!collapsed && (
            <span className="font-semibold text-lg px-2">Pinn</span>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className="ml-auto h-8 w-8"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        <ScrollArea className="flex-1 py-4">
          <div className="px-2 space-y-1">
            {navItems.map((item) => (
              <Button
                key={item.path}
                variant={isActive(item.path) ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start",
                  collapsed ? "px-2" : "px-3"
                )}
                onClick={() => navigate({ to: item.path })}
                title={collapsed ? item.label : undefined}
              >
                <item.icon className={cn("h-4 w-4", collapsed ? "mr-0" : "mr-2")} />
                {!collapsed && <span>{item.label}</span>}
              </Button>
            ))}
          </div>

          <Separator className="my-4 mx-2" />

          <div className="px-2 space-y-1">
             <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start",
                  collapsed ? "px-2" : "px-3"
                )}
                onClick={() => navigate({ to: '/note/new' })}
                title={collapsed ? "New Note" : undefined}
              >
                <Plus className={cn("h-4 w-4", collapsed ? "mr-0" : "mr-2")} />
                {!collapsed && <span>New Note</span>}
              </Button>
          </div>
        </ScrollArea>

        <div className="p-2 border-t mt-auto">
          <Button
            variant="ghost"
            className={cn(
              "w-full justify-start",
              collapsed ? "px-2" : "px-3"
            )}
            onClick={() => setShowSettings(true)}
            title={collapsed ? "Settings" : undefined}
          >
            <Settings className={cn("h-4 w-4", collapsed ? "mr-0" : "mr-2")} />
            {!collapsed && <span>Settings</span>}
          </Button>
        </div>
      </div>

      <SettingsDialog
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </>
  );
}
