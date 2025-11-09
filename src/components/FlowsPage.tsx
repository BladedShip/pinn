import { useState, useEffect, useRef } from 'react';
import { Search, Plus, Menu as MenuIcon, Download, Trash2, ChevronLeft, Book, Settings, Folder, FolderOpen, ChevronRight, ChevronDown, Edit2, GitBranch } from 'lucide-react';
import { getFlows, Flow, deleteFlow, getAllCategories, setFlowCategory, addCategory, renameCategory as storageRenameCategory, deleteCategory as storageDeleteCategory } from '../lib/flowStorage';
import ConfirmDialog from './ConfirmDialog';
import SettingsDialog from './SettingsDialog';

interface FlowsPageProps {
  onNavigateToFlow: (flowId?: string) => void;
  onNavigateToHome: () => void;
  onNavigateToNotes: () => void;
}

export default function FlowsPage({ onNavigateToFlow, onNavigateToHome, onNavigateToNotes }: FlowsPageProps) {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [filteredFlows, setFilteredFlows] = useState<Flow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'title' | 'date'>('date');
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [assignAfterCreateFlowId, setAssignAfterCreateFlowId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [flowToDelete, setFlowToDelete] = useState<string | null>(null);
  const [categoryToRename, setCategoryToRename] = useState<string | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);
  const [categoryDeleteCount, setCategoryDeleteCount] = useState<number>(0);
  const [showCategoryDeleteDialog, setShowCategoryDeleteDialog] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

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
  }, []);

  useEffect(() => {
    filterAndSortFlows();
  }, [flows, searchQuery, sortBy, selectedCategory]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpen]);

  const loadFlows = () => {
    try {
      const data = getFlows();
      setFlows(data || []);
      const allCategories = getAllCategories();
      setCategories(['All', 'Unfiled', ...allCategories]);
      // Auto-expand categories that have flows in the current filter
      if (allCategories.length > 0 && expandedCategories.size === 0) {
        setExpandedCategories(new Set(allCategories));
      }
    } catch (error) {
      console.error('Error loading flows:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (categoryName: string) => {
    setExpandedCategories((prev) => {
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

  const organizeFlowsByCategory = () => {
    const organized: Record<string, Flow[]> = {};
    const unfiled: Flow[] = [];

    flows.forEach((flow) => {
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
    Object.keys(organized).forEach((category) => {
      organized[category].sort((a, b) => 
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    });

    unfiled.sort((a, b) => 
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );

    return { organized, unfiled };
  };

  const filterAndSortFlows = () => {
    let filtered = flows;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = flows.filter(
        (flow) =>
          flow.title.toLowerCase().includes(query) ||
          flow.tags?.some((tag) => tag.toLowerCase().includes(query)) ||
          flow.nodes?.some((node) => node.data.label.toLowerCase().includes(query))
      );
    }

    if (selectedCategory && selectedCategory !== 'All') {
      if (selectedCategory === 'Unfiled') {
        filtered = filtered.filter((f) => !f.category || !f.category.trim());
      } else {
        filtered = filtered.filter((f) => (f.category || '').trim() === selectedCategory);
      }
    }

    filtered = [...filtered].sort((a, b) => {
      if (sortBy === 'title') {
        return a.title.localeCompare(b.title);
      }
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

    setFilteredFlows(filtered);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const handleNewFlow = () => {
    // Store selected category for auto-assignment when flow is created
    if (selectedCategory && selectedCategory !== 'All' && selectedCategory !== 'Unfiled') {
      localStorage.setItem('pinn.pendingFlowCategory', selectedCategory);
    } else {
      localStorage.removeItem('pinn.pendingFlowCategory');
    }
    onNavigateToFlow();
  };

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
      const count = flows.reduce((acc, f) => acc + (((f.category || '').trim() === name) ? 1 : 0), 0);
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
    const category = value === 'Unfiled' ? undefined : (value || undefined);
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
    setMenuOpen(false);
  };

  const handleClearAll = () => {
    setShowClearAllConfirm(true);
    setMenuOpen(false);
  };

  const confirmClearAll = () => {
    flows.forEach((flow) => deleteFlow(flow.id));
    setFlows([]);
    setFilteredFlows([]);
  };

  const { organized, unfiled } = organizeFlowsByCategory();
  // Include empty categories from the persisted list so they show in the sidebar
  const categorySet = new Set<string>([
    ...Object.keys(organized),
    ...categories.filter((c) => c !== 'All' && c !== 'Unfiled'),
  ]);
  const sortedCategories = Array.from(categorySet).sort((a, b) => a.localeCompare(b));

  return (
    <div className="h-screen bg-theme-bg-primary flex flex-col overflow-hidden">
      <header className="sticky top-0 z-50 bg-theme-bg-primary flex items-center justify-between px-6 py-4 border-b border-theme-border flex-shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={onNavigateToHome}
            className="flex items-center gap-2 text-theme-text-secondary hover:text-white transition-colors"
            title="Back to Home"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm">Back</span>
          </button>
          <h1 className="text-xl font-light text-theme-text-primary">Flows</h1>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleNewFlow}
            className="flex items-center gap-2 px-4 py-2 text-theme-text-primary hover:text-white transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>New Flow</span>
          </button>
          <button
            onClick={onNavigateToNotes}
            className="flex items-center gap-2 px-4 py-2 text-theme-text-primary hover:text-white transition-colors"
          >
            <Book className="w-5 h-5" />
            <span>Notes</span>
          </button>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 px-4 py-2 text-theme-text-primary hover:text-white transition-colors"
            >
              <MenuIcon className="w-5 h-5" />
              <span>Menu</span>
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-theme-bg-secondary border border-gray-600 rounded-lg shadow-lg z-50">
                <div className="py-1">
                  <button
                    onClick={handleExportAll}
                    className="w-full flex items-center gap-2 px-4 py-2 text-left text-theme-text-primary hover:bg-theme-bg-primary hover:text-white transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export All Flows</span>
                  </button>
                  <div className="border-t border-gray-600 my-1" />
                  <button
                    onClick={handleClearAll}
                    className="w-full flex items-center gap-2 px-4 py-2 text-left text-red-400 hover:bg-theme-bg-primary hover:text-red-300 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Clear All Flows</span>
                  </button>
                  <div className="border-t border-gray-600 my-1" />
                  <button
                    onClick={() => {
                      setShowSettingsDialog(true);
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-left text-theme-text-primary hover:bg-theme-bg-primary hover:text-white transition-colors"
                  >
                    <Settings className="w-4 h-4" />
                    <span>Settings</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Sidebar */}
        <aside 
          className="bg-theme-bg-primary border-r border-theme-border w-[280px] min-w-[200px] flex-shrink-0 h-full flex flex-col"
        >
          {/* Fixed Header Section */}
          <div className="flex-shrink-0 p-4 space-y-2 bg-theme-bg-primary">
            {/* Search in sidebar */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search flows..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
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
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Categories</span>
              <button
                onClick={handleCreateCategory}
                className="text-xs text-gray-500 hover:text-theme-text-primary p-1"
                title="New Category"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Scrollable Categories List */}
          <div 
            className="flex-1 overflow-y-auto sidebar-scroll-container px-4 pb-4"
            style={{ 
              scrollbarWidth: 'none', /* Firefox */
              msOverflowStyle: 'none', /* IE and Edge */
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
              {sortedCategories.map((categoryName) => {
                  const categoryFlows = organized[categoryName] || [];
                  const isExpanded = expandedCategories.has(categoryName);
                  const filteredCategoryFlows = searchQuery
                    ? categoryFlows.filter(
                        (flow) =>
                          flow.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          flow.tags?.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase())) ||
                          flow.nodes?.some((node) => node.data.label.toLowerCase().includes(searchQuery.toLowerCase()))
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
                        <div className={`group flex-1 flex items-center gap-2 px-1 rounded-lg text-sm min-w-0`}>
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
                          <span className="flex-1 text-left truncate">
                            {categoryName}
                          </span>
                          </button>
                          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 pr-2">
                            <button
                              title="Rename category"
                              onClick={() => handleRenameCategory(categoryName)}
                              className="p-1 text-gray-500 hover:text-theme-text-primary rounded"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              title="Delete category"
                              onClick={() => handleDeleteCategoryClick(categoryName)}
                              className="p-1 text-gray-500 hover:text-red-400 rounded"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                      {isExpanded && filteredCategoryFlows.length > 0 && (
                        <div className="ml-7 mt-1 space-y-0.5">
                          {filteredCategoryFlows.map((flow) => (
                            <div key={flow.id} className="group flex items-center gap-2 px-3 py-1.5 rounded text-sm text-theme-text-secondary hover:bg-theme-bg-secondary hover:text-theme-text-primary transition-colors truncate min-w-0">
                              <GitBranch className="w-3 h-3 flex-shrink-0" />
                              <button
                                onClick={() => onNavigateToFlow(flow.id)}
                                className="flex-1 text-left truncate"
                                title={flow.title}
                              >
                                {flow.title}
                              </button>
                              <button
                                title="Edit flow"
                                onClick={() => onNavigateToFlow(flow.id)}
                                className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-theme-text-primary rounded"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                              <button
                                title="Delete flow"
                                onClick={() => {
                                  setFlowToDelete(flow.id);
                                  setShowDeleteConfirm(true);
                                }}
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

              {/* Empty state intentionally minimal - no extra call-to-action here */}
              {sortedCategories.length === 0 && unfiled.length === 0 && !loading && null}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 h-full flex flex-col">
          {/* Fixed Header Section */}
          <div className="flex-shrink-0 bg-theme-bg-primary border-b border-theme-border">
            <div className="max-w-5xl mx-auto px-6 py-6">
              {!loading && (
                <div className="flex items-center justify-between">
                  <h3 className="text-sm uppercase tracking-wider text-gray-500">
                    {selectedCategory === 'All' ? 'All Flows' : selectedCategory === 'Unfiled' ? 'Unfiled Flows' : `Flows in "${selectedCategory}"`}
                  </h3>
                  {filteredFlows.length > 0 && (
                    <button
                      onClick={() => setSortBy(sortBy === 'title' ? 'date' : 'title')}
                      className="text-sm text-gray-500 hover:text-theme-text-secondary transition-colors"
                    >
                      Sort By: {sortBy === 'title' ? 'Title' : 'Date'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Scrollable Flows List */}
          <div 
            className="flex-1 overflow-y-auto content-scroll-container"
            style={{ 
              scrollbarWidth: 'none', /* Firefox */
              msOverflowStyle: 'none', /* IE and Edge */
            }}
          >
            <div className="max-w-5xl mx-auto px-6 py-12">
              {loading ? (
                <div className="text-center text-gray-500 py-12">Loading flows...</div>
              ) : filteredFlows.length > 0 ? (
                <div className="space-y-6">
                  {filteredFlows.map((flow) => (
                    <div
                      key={flow.id}
                      className="group relative bg-theme-bg-secondary rounded-lg p-4 hover:bg-theme-bg-tertiary transition-colors cursor-pointer"
                      onClick={() => onNavigateToFlow(flow.id)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="text-lg text-theme-text-primary group-hover:text-white transition-colors mb-2">
                            {flow.title}
                          </h4>
                          <div className="flex items-center gap-4 text-sm text-gray-500 mb-2">
                            <span>{formatDate(flow.updated_at)}</span>
                            <span>{flow.nodes?.length || 0} node{(flow.nodes?.length || 0) !== 1 ? 's' : ''}</span>
                            <span>{flow.edges?.length || 0} connection{(flow.edges?.length || 0) !== 1 ? 's' : ''}</span>
                          </div>
                          {flow.tags && flow.tags.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2 mb-2">
                              {flow.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="px-2 py-1 bg-theme-bg-primary text-theme-text-secondary text-xs rounded"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                          {selectedCategory === 'All' && (
                            <span className="px-2 py-0.5 rounded bg-theme-bg-primary border border-theme-border text-theme-text-secondary text-xs">
                              {flow.category && flow.category.trim() ? flow.category : 'Unfiled'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            onClick={(e) => e.stopPropagation()}
                            value={flow.category && flow.category.trim() ? flow.category : 'Unfiled'}
                            onChange={(e) => handleAssignCategory(flow.id, e.target.value)}
                            title={flow.category || 'Unfiled'}
                            className="text-xs bg-[#2a3038]/30 border border-[#3a4048]/50 hover:border-[#3a4048] rounded px-2 py-1 text-theme-text-secondary hover:text-theme-text-primary max-w-[200px] transition-all hover:bg-[#2a3038]/50 focus:bg-[#2a3038]/50 focus:border-[#3a4048] focus:outline-none"
                          >
                            <option value="Unfiled">Unfiled</option>
                            {categories.filter((c) => c !== 'All' && c !== 'Unfiled').map((c) => (
                              <option key={c} value={c}>{c.length > 40 ? `${c.slice(0, 37)}...` : c}</option>
                            ))}
                            <option value="__new__">+ New category…</option>
                          </select>
                          <button
                            onClick={(e) => handleDeleteFlow(flow.id, e)}
                            className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-500 hover:text-red-400 hover:bg-theme-bg-primary rounded transition-all"
                            title="Delete flow"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-500 py-12">
                  {searchQuery ? 'No flows found' : selectedCategory === 'All' ? 'No flows yet. Create your first flow!' : `No flows in "${selectedCategory}"`}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      <button
        onClick={handleNewFlow}
        className="fixed bottom-8 right-8 w-14 h-14 bg-blue-500 hover:bg-blue-600 rounded-full flex items-center justify-center shadow-lg transition-colors"
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

      <SettingsDialog
        isOpen={showSettingsDialog}
        onClose={() => setShowSettingsDialog(false)}
      />

      {showCategoryDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-theme-bg-primary rounded-xl shadow-2xl w-full max-w-md border border-theme-border overflow-hidden">
            <div className="px-6 py-5 border-b border-theme-border">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-light text-theme-text-primary">{categoryToRename ? 'Rename Category' : 'New Category'}</h2>
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
                <label className="block text-sm font-medium text-theme-text-primary mb-3">Category name</label>
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
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
                    <div className="inline-block max-w-full px-2 py-1 rounded border border-theme-border bg-theme-bg-darkest text-[#e8935f] font-medium overflow-hidden text-ellipsis whitespace-nowrap" title={categoryToDelete}>{categoryToDelete}</div>
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
                    <div className="inline-block max-w-full px-2 py-1 rounded border border-theme-border bg-theme-bg-darkest text-[#e8935f] font-medium overflow-hidden text-ellipsis whitespace-nowrap" title={categoryToDelete}>{categoryToDelete}</div>
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
