import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import {
  Search,
  Plus,
  Download,
  Trash2,
  Settings,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Edit2,
  GitBranch,
  LayoutGrid,
  List as ListIcon,
  MoreVertical,
  Calendar,
  MoreHorizontal,
} from 'lucide-react';
import {
  getFlows,
  Flow,
  deleteFlow,
  getAllCategories,
  setFlowCategory,
  addCategory,
  renameCategory as storageRenameCategory,
  deleteCategory as storageDeleteCategory,
  createFlow,
} from '../lib/flowStorage';
import ConfirmDialog from './ConfirmDialog';
import SettingsDialog from './SettingsDialog';
import { logger } from '../utils/logger';
import { useDebounce } from '../hooks/useDebounce';
import { formatDate } from '../utils/date';
import { Button } from './ui/button';
import { Toggle } from './ui/toggle';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

export default function FlowsPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: '/flows' });

  const [flows, setFlows] = useState<Flow[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [searchQuery, setSearchQuery] = useState((search as { search?: string })?.search || '');
  const [sortBy, setSortBy] = useState<'title' | 'date'>(
    (search as { sort?: 'title' | 'date' })?.sort || 'date'
  );
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>(
    (search as { category?: string })?.category || 'All'
  );
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [assignAfterCreateFlowId, setAssignAfterCreateFlowId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [flowToDelete, setFlowToDelete] = useState<string | null>(null);
  const [categoryToRename, setCategoryToRename] = useState<string | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);
  const [categoryDeleteCount, setCategoryDeleteCount] = useState<number>(0);
  const [showCategoryDeleteDialog, setShowCategoryDeleteDialog] = useState(false);

  const loadFlows = useCallback(() => {
    try {
      const data = getFlows();
      setFlows(data || []);
      const allCategories = getAllCategories();
      setCategories(['All', 'Unfiled', ...allCategories]);
      // Auto-expand categories that have flows in the current filter
      setExpandedCategories(prev => {
        if (allCategories.length > 0 && prev.size === 0) {
          return new Set(allCategories);
        }
        return prev;
      });
    } catch (error) {
      logger.error('Error loading flows:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFlows();

    // Listen for storage refresh events (e.g., after folder restore)
    const handleStorageRefresh = () => {
      loadFlows();
    };

    window.addEventListener('storage-refresh', handleStorageRefresh);

    return () => {
      window.removeEventListener('storage-refresh', handleStorageRefresh);
    };
  }, [loadFlows]);

  const debouncedSearchQuery = useDebounce(searchQuery);

  // Sync state with URL query params
  useEffect(() => {
    const urlSearch = (search as { search?: string })?.search || '';
    const urlSort = (search as { sort?: 'title' | 'date' })?.sort || 'date';
    const urlCategory = (search as { category?: string })?.category || 'All';

    if (urlSearch !== searchQuery) setSearchQuery(urlSearch);
    if (urlSort !== sortBy) setSortBy(urlSort);
    if (urlCategory !== selectedCategory) setSelectedCategory(urlCategory);
  }, [search]);

  // Update URL when state changes
  useEffect(() => {
    const params: Record<string, string> = {};
    if (debouncedSearchQuery) params.search = debouncedSearchQuery;
    if (sortBy !== 'date') params.sort = sortBy;
    if (selectedCategory !== 'All') params.category = selectedCategory;

    navigate({
      to: '/flows',
      search: params,
      replace: true,
    });
  }, [debouncedSearchQuery, sortBy, selectedCategory, navigate]);

  const toggleCategory = (categoryName: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryName)) {
        next.delete(categoryName);
      } else {
        next.add(categoryName);
      }
      return next;
    });
  };

  const handleCategoryClick = (categoryName: string) => {
    setSelectedCategory(categoryName);
  };

  const organizeFlowsByCategory = useMemo(() => {
    const organized: Record<string, Flow[]> = {};
    const unfiled: Flow[] = [];

    flows.forEach(flow => {
      const category = flow.category?.trim();
      if (category) {
        if (!organized[category]) {
          organized[category] = [];
        }
        organized[category].push(flow);
      } else {
        unfiled.push(flow);
      }
    });

    // Sort flows within each category by updated_at
    Object.keys(organized).forEach(category => {
      organized[category].sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    });

    unfiled.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    return { organized, unfiled };
  }, [flows]);

  const filteredFlows = useMemo(() => {
    let filtered = flows;

    if (debouncedSearchQuery) {
      const query = debouncedSearchQuery.toLowerCase();
      filtered = flows.filter(
        flow =>
          flow.title.toLowerCase().includes(query) ||
          flow.tags?.some(tag => tag.toLowerCase().includes(query)) ||
          flow.nodes?.some(node => node.data.label.toLowerCase().includes(query))
      );
    }

    if (selectedCategory && selectedCategory !== 'All') {
      if (selectedCategory === 'Unfiled') {
        filtered = filtered.filter(f => !f.category || !f.category.trim());
      } else {
        filtered = filtered.filter(f => (f.category || '').trim() === selectedCategory);
      }
    }

    return [...filtered].sort((a, b) => {
      if (sortBy === 'title') {
        return a.title.localeCompare(b.title);
      }
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [flows, debouncedSearchQuery, selectedCategory, sortBy]);

  const handleNewFlow = useCallback(() => {
    const newFlow = createFlow('Untitled Flow');

    // Assign to selected category if active
    if (selectedCategory && selectedCategory !== 'All' && selectedCategory !== 'Unfiled') {
      setFlowCategory(newFlow.id, selectedCategory);
    }

    navigate({ to: '/flow/$flowId', params: { flowId: newFlow.id } });
  }, [selectedCategory, navigate]);

  const handleCreateCategory = () => {
    setAssignAfterCreateFlowId(null);
    setNewCategoryName('');
    setShowCategoryDialog(true);
  };

  const handleRenameCategory = (name: string) => {
    setCategoryToRename(name);
    setNewCategoryName(name);
    setShowCategoryDialog(true);
  };

  const handleDeleteCategoryClick = (name: string) => {
    setCategoryToDelete(name);
    // Count how many flows are in this category to decide dialog variant
    try {
      const count = flows.reduce((acc, f) => acc + ((f.category || '').trim() === name ? 1 : 0), 0);
      setCategoryDeleteCount(count);
    } catch {
      setCategoryDeleteCount(0);
    }
    setShowCategoryDeleteDialog(true);
  };

  const handleAssignCategory = (flowId: string, value: string) => {
    if (value === '__new__') {
      setAssignAfterCreateFlowId(flowId);
      setNewCategoryName('');
      setShowCategoryDialog(true);
      return;
    }
    const category = value === 'Unfiled' ? undefined : value || undefined;
    const updated = setFlowCategory(flowId, category);
    if (updated) {
      loadFlows();
    }
  };

  const confirmCreateCategory = () => {
    const normalized = (newCategoryName || '').trim();
    if (!normalized) {
      setShowCategoryDialog(false);
      return;
    }
    if (categoryToRename && categoryToRename !== normalized) {
      storageRenameCategory(categoryToRename, normalized);
      loadFlows();
      setSelectedCategory(normalized);
    } else {
      // Persist new category and refresh
      addCategory(normalized);
      setCategories(['All', 'Unfiled', ...getAllCategories()]);
      if (!assignAfterCreateFlowId) setSelectedCategory(normalized);
    }

    if (assignAfterCreateFlowId) {
      const updated = setFlowCategory(assignAfterCreateFlowId, normalized);
      if (updated) {
        loadFlows();
      }
    }

    setAssignAfterCreateFlowId(null);
    setNewCategoryName('');
    setCategoryToRename(null);
    setShowCategoryDialog(false);
  };

  const confirmDeleteCategory = (mode: 'delete-flows' | 'move-to-unfiled') => {
    if (!categoryToDelete) return;
    storageDeleteCategory(categoryToDelete, mode);
    setShowCategoryDeleteDialog(false);
    setCategoryToDelete(null);
    setCategoryDeleteCount(0);
    if (selectedCategory === categoryToDelete) setSelectedCategory('All');
    loadFlows();
  };

  const handleDeleteFlow = (flowId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFlowToDelete(flowId);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteFlow = () => {
    if (flowToDelete) {
      deleteFlow(flowToDelete);
      loadFlows();
      setFlowToDelete(null);
    }
  };

  const handleExportAll = () => {
    const allFlows = getFlows();
    const blob = new Blob([JSON.stringify(allFlows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pinn-flows-export.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClearAll = () => {
    setShowClearAllConfirm(true);
  };

  const confirmClearAll = useCallback(() => {
    flows.forEach(flow => deleteFlow(flow.id));
    setFlows([]);
  }, [flows]);

  const { organized, unfiled } = organizeFlowsByCategory;
  // Include empty categories from the persisted list so they show in the sidebar
  const categorySet = new Set<string>([
    ...Object.keys(organized),
    ...categories.filter(c => c !== 'All' && c !== 'Unfiled'),
  ]);
  const sortedCategories = Array.from(categorySet).sort((a, b) => a.localeCompare(b));

  return (
    <div className="h-full bg-theme-bg-primary flex flex-col overflow-hidden">
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Sidebar */}
        <aside className="bg-theme-bg-primary border-r border-theme-border w-[280px] min-w-[200px] flex-shrink-0 h-full flex flex-col">
          {/* Fixed Header Section */}
          <div className="flex-shrink-0 p-4 space-y-2 bg-theme-bg-primary">
            {/* Search in sidebar */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search flows..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-theme-bg-secondary border border-theme-border rounded-lg pl-9 pr-3 py-2 text-sm text-theme-text-primary placeholder-gray-500 focus:outline-none focus:border-gray-600 transition-colors"
              />
            </div>

            {/* All Flows */}
            <div className="mb-2">
              <button
                onClick={() => handleCategoryClick('All')}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  selectedCategory === 'All'
                    ? 'bg-theme-bg-secondary text-theme-text-primary'
                    : 'text-theme-text-secondary hover:bg-theme-bg-secondary hover:text-theme-text-primary'
                }`}
              >
                <GitBranch className="w-4 h-4" />
                <span className="flex-1 text-left">All Flows</span>
                <span className="text-xs text-gray-600">{flows.length}</span>
              </button>
            </div>

            {/* Unfiled Flows */}
            {unfiled.length > 0 && (
              <div className="mb-2">
                <button
                  onClick={() => handleCategoryClick('Unfiled')}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedCategory === 'Unfiled'
                      ? 'bg-theme-bg-secondary text-white'
                      : 'text-theme-text-secondary hover:bg-theme-bg-secondary hover:text-theme-text-primary'
                  }`}
                >
                  <GitBranch className="w-4 h-4" />
                  <span className="flex-1 text-left">Unfiled</span>
                  <span className="text-xs text-gray-600">{unfiled.length}</span>
                </button>
              </div>
            )}

            {/* Categories Header */}
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Categories
              </span>
              <button
                onClick={handleCreateCategory}
                className="text-xs text-gray-500 hover:text-theme-text-primary p-1"
                title="New Category"
                aria-label="Create new category"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Scrollable Categories List */}
          <div
            className="flex-1 overflow-y-auto sidebar-scroll-container px-4 pb-4"
            style={{
              scrollbarWidth: 'none' /* Firefox */,
              msOverflowStyle: 'none' /* IE and Edge */,
            }}
          >
            <div className="space-y-1">
              {sortedCategories.length === 0 && (
                <div className="px-3 pb-2 text-xs text-gray-500 flex items-center gap-2">
                  <span>No categories yet</span>
                  <button
                    onClick={handleCreateCategory}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border border-theme-border text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-bg-secondary"
                  >
                    <Plus className="w-3 h-3" />
                    <span>New category</span>
                  </button>
                </div>
              )}
              {sortedCategories.map(categoryName => {
                const categoryFlows = organized[categoryName] || [];
                const isExpanded = expandedCategories.has(categoryName);
                const filteredCategoryFlows = debouncedSearchQuery
                  ? categoryFlows.filter(
                      flow =>
                        flow.title.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
                        flow.tags?.some(tag =>
                          tag.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
                        ) ||
                        flow.nodes?.some(node =>
                          node.data.label.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
                        )
                    )
                  : categoryFlows;

                return (
                  <div key={categoryName} className="mb-1">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleCategory(categoryName)}
                        className="p-1 text-gray-500 hover:text-theme-text-primary transition-colors"
                        title={isExpanded ? 'Collapse' : 'Expand'}
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>
                      <div
                        className={`group flex-1 flex items-center gap-2 px-1 rounded-lg text-sm min-w-0`}
                      >
                        <button
                          onClick={() => handleCategoryClick(categoryName)}
                          className={`flex-1 flex items-center gap-2 px-2 py-2 rounded-lg transition-colors min-w-0 ${
                            selectedCategory === categoryName
                              ? 'bg-theme-bg-secondary text-white'
                              : 'text-theme-text-secondary hover:bg-theme-bg-secondary hover:text-theme-text-primary'
                          }`}
                        >
                          {isExpanded ? (
                            <FolderOpen className="w-4 h-4 flex-shrink-0" />
                          ) : (
                            <Folder className="w-4 h-4 flex-shrink-0" />
                          )}
                          <span className="flex-1 text-left truncate">{categoryName}</span>
                        </button>
                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 pr-2">
                          <button
                            title="Rename category"
                            onClick={() => handleRenameCategory(categoryName)}
                            className="p-1 text-gray-500 hover:text-theme-text-primary rounded"
                            aria-label="Rename category"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            title="Delete category"
                            onClick={() => handleDeleteCategoryClick(categoryName)}
                            className="p-1 text-gray-500 hover:text-red-400 rounded"
                            aria-label="Delete category"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                    {isExpanded && filteredCategoryFlows.length > 0 && (
                      <div className="ml-7 mt-1 space-y-0.5">
                        {filteredCategoryFlows.map(flow => (
                          <div
                            key={flow.id}
                            className="group flex items-center gap-2 px-3 py-1.5 rounded text-sm text-theme-text-secondary hover:bg-theme-bg-secondary hover:text-theme-text-primary transition-colors truncate min-w-0"
                          >
                            <GitBranch className="w-3 h-3 flex-shrink-0" />
                            <button
                              onClick={() =>
                                navigate({ to: '/flow/$flowId', params: { flowId: flow.id } })
                              }
                              className="flex-1 text-left truncate"
                              title={flow.title}
                            >
                              {flow.title}
                            </button>
                            <button
                              title="Edit flow"
                              onClick={() =>
                                navigate({ to: '/flow/$flowId', params: { flowId: flow.id } })
                              }
                              className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-theme-text-primary rounded"
                              aria-label="Edit flow"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              title="Delete flow"
                              onClick={() => {
                                setFlowToDelete(flow.id);

                                setShowDeleteConfirm(true);
                              }}
                              aria-label="Delete flow"
                              className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-red-400 rounded"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {sortedCategories.length === 0 && unfiled.length === 0 && !loading && null}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 h-full flex flex-col">
          {/* Header / Toolbar */}
          <div className="flex-shrink-0 bg-theme-bg-primary border-b border-theme-border px-6 py-6">
            <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center max-w-7xl mx-auto w-full">
              <h3 className="text-sm uppercase tracking-wider text-gray-500">
                {selectedCategory === 'All'
                  ? 'All Flows'
                  : selectedCategory === 'Unfiled'
                    ? 'Unfiled Flows'
                    : `Flows in "${selectedCategory}"`}
              </h3>

              {!loading && (
                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                  {filteredFlows.length > 0 && (
                    <button
                      onClick={() => setSortBy(sortBy === 'title' ? 'date' : 'title')}
                      className="text-sm text-gray-500 hover:text-theme-text-secondary transition-colors mr-2"
                    >
                      Sort By: {sortBy === 'title' ? 'Title' : 'Date'}
                    </button>
                  )}

                  <div className="flex items-center border rounded-md bg-background border-theme-border">
                    <Toggle
                      pressed={viewMode === 'grid'}
                      onPressedChange={() => setViewMode('grid')}
                      className="rounded-r-none border-r border-theme-border text-gray-400 data-[state=on]:bg-theme-bg-secondary data-[state=on]:text-theme-text-primary"
                      aria-label="Grid view"
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </Toggle>
                    <Toggle
                      pressed={viewMode === 'list'}
                      onPressedChange={() => setViewMode('list')}
                      className="rounded-l-none text-gray-400 data-[state=on]:bg-theme-bg-secondary data-[state=on]:text-theme-text-primary"
                      aria-label="List view"
                    >
                      <ListIcon className="h-4 w-4" />
                    </Toggle>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className="border-theme-border bg-transparent hover:bg-theme-bg-secondary"
                      >
                        <MoreHorizontal className="h-4 w-4 text-theme-text-secondary" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="bg-theme-bg-secondary border-theme-border"
                    >
                      <DropdownMenuItem
                        onClick={handleExportAll}
                        className="focus:bg-theme-bg-tertiary focus:text-theme-text-primary"
                      >
                        <Download className="mr-2 h-4 w-4" /> Export All Flows
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={handleClearAll}
                        className="focus:bg-theme-bg-tertiary focus:text-red-400 text-red-400"
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Clear All Flows
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setShowSettingsDialog(true)}
                        className="focus:bg-theme-bg-tertiary focus:text-theme-text-primary"
                      >
                        <Settings className="mr-2 h-4 w-4" /> Settings
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Button onClick={handleNewFlow}>
                    <Plus className="mr-2 h-4 w-4" /> New Flow
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Scrollable Flows List */}
          <div
            className="flex-1 overflow-y-auto content-scroll-container"
            style={{
              scrollbarWidth: 'none' /* Firefox */,
              msOverflowStyle: 'none' /* IE and Edge */,
            }}
          >
            <div className="max-w-7xl mx-auto px-6 py-12">
              {loading ? (
                <div className="text-center text-gray-500 py-12">Loading flows...</div>
              ) : filteredFlows.length > 0 ? (
                viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-20">
                    {filteredFlows.map(flow => (
                      <Card
                        key={flow.id}
                        className="group cursor-pointer hover:shadow-md transition-all border-theme-border bg-theme-bg-secondary hover:border-theme-accent/50"
                        onClick={() =>
                          navigate({ to: '/flow/$flowId', params: { flowId: flow.id } })
                        }
                      >
                        <CardHeader className="p-4 pb-2">
                          <div className="flex justify-between items-start gap-2">
                            <CardTitle className="text-base font-semibold leading-tight line-clamp-2 text-theme-text-primary">
                              {flow.title}
                            </CardTitle>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 -mr-2 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-theme-bg-tertiary"
                                >
                                  <MoreVertical className="h-3 w-3 text-theme-text-secondary" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                className="bg-theme-bg-secondary border-theme-border"
                              >
                                <DropdownMenuItem
                                  className="text-red-400 focus:text-red-400 focus:bg-theme-bg-tertiary"
                                  onClick={e => handleDeleteFlow(flow.id, e)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-2">
                          <div className="flex items-center gap-4 text-xs text-gray-500 mb-2">
                            <span>
                              {flow.nodes?.length || 0} node
                              {(flow.nodes?.length || 0) !== 1 ? 's' : ''}
                            </span>
                            <span>
                              {flow.edges?.length || 0} link
                              {(flow.edges?.length || 0) !== 1 ? 's' : ''}
                            </span>
                          </div>
                          {flow.tags && flow.tags.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {flow.tags.slice(0, 3).map(tag => (
                                <span
                                  key={tag}
                                  className="px-2 py-0.5 bg-theme-bg-primary text-theme-text-secondary text-[10px] rounded border border-theme-border"
                                >
                                  {tag}
                                </span>
                              ))}
                              {flow.tags.length > 3 && (
                                <span className="text-[10px] text-gray-500">
                                  +{flow.tags.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </CardContent>
                        <CardFooter className="p-4 pt-0 text-xs text-muted-foreground flex justify-between items-center">
                          <span className="flex items-center">
                            <Calendar className="mr-1 h-3 w-3" />
                            {formatDate(flow.updated_at)}
                          </span>
                          {flow.category && (
                            <span className="bg-theme-bg-primary px-2 py-0.5 rounded text-[10px] font-medium border border-theme-border">
                              {flow.category}
                            </span>
                          )}
                        </CardFooter>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 pb-20">
                    {filteredFlows.map(flow => (
                      <div
                        key={flow.id}
                        className="group flex items-center justify-between p-3 rounded-lg border border-theme-border bg-theme-bg-secondary hover:bg-theme-bg-tertiary transition-colors cursor-pointer"
                        onClick={() =>
                          navigate({ to: '/flow/$flowId', params: { flowId: flow.id } })
                        }
                      >
                        <div className="flex-1 min-w-0 grid gap-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold truncate text-theme-text-primary">
                              {flow.title}
                            </h3>
                            {flow.category && (
                              <span className="bg-theme-bg-primary px-2 py-0.5 rounded text-[10px] text-muted-foreground border border-theme-border">
                                {flow.category}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span>{formatDate(flow.updated_at)}</span>
                            <span>{flow.nodes?.length || 0} nodes</span>
                            <span>{flow.edges?.length || 0} links</span>
                            {flow.tags && flow.tags.length > 0 && (
                              <div className="flex gap-1 ml-2">
                                {flow.tags.slice(0, 3).map(tag => (
                                  <span
                                    key={tag}
                                    className="px-1.5 py-0.5 bg-theme-bg-primary rounded text-[10px] border border-theme-border"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                              <button
                                className="text-xs bg-theme-bg-primary/50 border border-theme-border rounded px-2 py-1 text-theme-text-secondary hover:text-theme-text-primary max-w-[150px] focus:outline-none focus:border-theme-accent transition-colors truncate text-left"
                                title={flow.category || 'Unfiled'}
                              >
                                {flow.category || 'Unfiled'}
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="bg-theme-bg-secondary border-theme-border max-h-[300px] overflow-y-auto"
                            >
                              <DropdownMenuItem
                                onClick={e => {
                                  e.stopPropagation();
                                  handleAssignCategory(flow.id, 'Unfiled');
                                }}
                                className="focus:bg-theme-bg-tertiary focus:text-theme-text-primary text-xs"
                              >
                                Unfiled
                              </DropdownMenuItem>
                              {categories
                                .filter(c => c !== 'All' && c !== 'Unfiled')
                                .map(c => (
                                  <DropdownMenuItem
                                    key={c}
                                    onClick={e => {
                                      e.stopPropagation();
                                      handleAssignCategory(flow.id, c);
                                    }}
                                    className="focus:bg-theme-bg-tertiary focus:text-theme-text-primary text-xs"
                                  >
                                    {c}
                                  </DropdownMenuItem>
                                ))}
                              <DropdownMenuItem
                                onClick={e => {
                                  e.stopPropagation();
                                  handleAssignCategory(flow.id, '__new__');
                                }}
                                className="focus:bg-theme-bg-tertiary focus:text-theme-text-primary text-xs text-theme-accent"
                              >
                                + New category…
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="opacity-0 group-hover:opacity-100 transition-opacity hover:bg-theme-bg-primary hover:text-red-400"
                            onClick={e => handleDeleteFlow(flow.id, e)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <div className="text-center text-gray-500 py-12">
                  {debouncedSearchQuery
                    ? 'No flows found'
                    : selectedCategory === 'All'
                      ? 'No flows yet. Create your first flow!'
                      : `No flows in "${selectedCategory}"`}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      <button
        onClick={handleNewFlow}
        className="fixed bottom-8 right-8 w-14 h-14 bg-blue-500 hover:bg-blue-600 rounded-full flex items-center justify-center shadow-lg transition-colors z-20"
      >
        <Plus className="w-6 h-6 text-white" />
      </button>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setFlowToDelete(null);
        }}
        onConfirm={confirmDeleteFlow}
        title="Delete Flow"
        message="Are you sure you want to delete this flow? This cannot be undone."
        confirmText="Delete"
      />

      <ConfirmDialog
        isOpen={showClearAllConfirm}
        onClose={() => setShowClearAllConfirm(false)}
        onConfirm={confirmClearAll}
        title="Delete All Flows"
        message="Are you sure you want to delete all flows? This cannot be undone."
        confirmText="Delete All"
      />

      <SettingsDialog isOpen={showSettingsDialog} onClose={() => setShowSettingsDialog(false)} />

      {showCategoryDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-theme-bg-primary rounded-xl shadow-2xl w-full max-w-md border border-theme-border overflow-hidden">
            <div className="px-6 py-5 border-b border-theme-border">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-light text-theme-text-primary">
                  {categoryToRename ? 'Rename Category' : 'New Category'}
                </h2>
                <button
                  onClick={() => {
                    setShowCategoryDialog(false);
                    setAssignAfterCreateFlowId(null);
                    setNewCategoryName('');
                    setCategoryToRename(null);
                  }}
                  className="text-theme-text-secondary hover:text-white hover:bg-theme-bg-secondary rounded-lg p-1.5 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="px-6 py-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-theme-text-primary mb-3">
                  Category name
                </label>
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  placeholder="Enter category name..."
                  className="w-full bg-theme-bg-darkest border border-theme-border rounded-lg px-4 py-3 text-theme-text-primary placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#e8935f] focus:border-transparent transition-all"
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-theme-border">
                <button
                  onClick={() => {
                    setShowCategoryDialog(false);
                    setAssignAfterCreateFlowId(null);
                    setNewCategoryName('');
                    setCategoryToRename(null);
                  }}
                  className="px-5 py-2.5 text-sm font-medium text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-bg-secondary rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmCreateCategory}
                  disabled={!newCategoryName.trim()}
                  className="px-5 py-2.5 text-sm font-medium bg-[#e8935f] hover:bg-[#d8834f] text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#e8935f] shadow-lg hover:shadow-xl"
                >
                  {categoryToRename ? 'Rename' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCategoryDeleteDialog && categoryToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-theme-bg-primary rounded-xl shadow-2xl w-full max-w-md border border-theme-border overflow-hidden">
            <div className="px-6 py-5 border-b border-theme-border">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-light text-theme-text-primary">Delete Category</h2>
                <button
                  onClick={() => {
                    setShowCategoryDeleteDialog(false);
                    setCategoryToDelete(null);
                  }}
                  className="text-theme-text-secondary hover:text-white hover:bg-theme-bg-secondary rounded-lg p-1.5 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="px-6 py-6 space-y-6">
              {categoryDeleteCount > 0 ? (
                <>
                  <div className="text-theme-text-primary">
                    <div className="mb-2">The category</div>
                    <div
                      className="inline-block max-w-full px-2 py-1 rounded border border-theme-border bg-theme-bg-darkest text-[#e8935f] font-medium overflow-hidden text-ellipsis whitespace-nowrap"
                      title={categoryToDelete}
                    >
                      {categoryToDelete}
                    </div>
                    <div className="mt-3">contains flows. What would you like to do?</div>
                  </div>
                  <div className="flex flex-col gap-3">
                    <button
                      onClick={() => confirmDeleteCategory('move-to-unfiled')}
                      className="px-5 py-2.5 text-sm font-medium bg-theme-bg-secondary hover:bg-theme-bg-tertiary text-gray-100 rounded-lg transition-all text-left"
                    >
                      Move flows to Unfiled and delete category
                    </button>
                    <button
                      onClick={() => confirmDeleteCategory('delete-flows')}
                      className="px-5 py-2.5 text-sm font-medium bg-red-600 hover:bg-red-500 text-white rounded-lg transition-all text-left"
                    >
                      Delete category and all flows inside
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-theme-text-primary">
                    <div className="mb-2">Delete empty category</div>
                    <div
                      className="inline-block max-w-full px-2 py-1 rounded border border-theme-border bg-theme-bg-darkest text-[#e8935f] font-medium overflow-hidden text-ellipsis whitespace-nowrap"
                      title={categoryToDelete}
                    >
                      {categoryToDelete}
                    </div>
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => {
                        setShowCategoryDeleteDialog(false);
                        setCategoryToDelete(null);
                        setCategoryDeleteCount(0);
                      }}
                      className="px-5 py-2.5 text-sm font-medium text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-bg-secondary rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => confirmDeleteCategory('move-to-unfiled')}
                      className="px-5 py-2.5 text-sm font-medium bg-red-600 hover:bg-red-500 text-white rounded-lg transition-all"
                    >
                      Delete category
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      <style>{`
        .sidebar-scroll-container::-webkit-scrollbar,
        .content-scroll-container::-webkit-scrollbar {
          display: none; /* Chrome, Safari, Opera */
        }
      `}</style>
    </div>
  );
}
