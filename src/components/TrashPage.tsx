import { useState, useEffect } from 'react';
import { Trash2, RotateCcw, X, Search, ChevronLeft, FileText, GitBranch, Folder, Tag, AlertCircle } from 'lucide-react';
import {
  getTrashedNotes,
  getTrashedFlows,
  getTrashedFolders,
  getTrashedCategories,
  restoreNoteFromTrash,
  restoreFlowFromTrash,
  restoreFolderFromTrash,
  restoreCategoryFromTrash,
  permanentlyDeleteNote,
  permanentlyDeleteFlow,
  permanentlyDeleteFolder,
  permanentlyDeleteCategory,
  emptyTrash,
  type TrashedItem,
} from '../lib/trashStorage';
import ConfirmationModal, { type ConfirmationVariant } from './shared/ConfirmationModal';
import { logger } from '../utils/logger';

interface TrashPageProps {
  onNavigateToHome: () => void;
  onNavigateToNotes: () => void;
  onNavigateToFlows: () => void;
}

type TrashFilter = 'all' | 'notes' | 'flows' | 'folders' | 'categories';

export default function TrashPage({ onNavigateToHome, onNavigateToNotes, onNavigateToFlows }: TrashPageProps) {
  const [trashedNotes, setTrashedNotes] = useState<TrashedItem[]>([]);
  const [trashedFlows, setTrashedFlows] = useState<TrashedItem[]>([]);
  const [trashedFolders, setTrashedFolders] = useState<TrashedItem[]>([]);
  const [trashedCategories, setTrashedCategories] = useState<TrashedItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<TrashFilter>('all');
  const [loading, setLoading] = useState(true);
  
  // Confirmation modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'delete' | 'empty';
    item?: TrashedItem;
    variant: ConfirmationVariant;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    loadTrash();
  }, []);

  const loadTrash = async () => {
    try {
      setLoading(true);
      const [notes, flows, folders, categories] = await Promise.all([
        getTrashedNotes(),
        getTrashedFlows(),
        getTrashedFolders(),
        getTrashedCategories(),
      ]);
      setTrashedNotes(notes);
      setTrashedFlows(flows);
      setTrashedFolders(folders);
      setTrashedCategories(categories);
    } catch (error) {
      logger.error('Error loading trash:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreNote = async (item: TrashedItem) => {
    try {
      await restoreNoteFromTrash(item.id);
      await loadTrash();
      // Trigger refresh in other pages
      window.dispatchEvent(new Event('storage-refresh'));
      onNavigateToNotes();
    } catch (error) {
      logger.error('Error restoring note:', error);
    }
  };

  const handleRestoreFlow = async (item: TrashedItem) => {
    try {
      await restoreFlowFromTrash(item.id);
      await loadTrash();
      window.dispatchEvent(new Event('storage-refresh'));
      onNavigateToFlows();
    } catch (error) {
      logger.error('Error restoring flow:', error);
    }
  };

  const handleRestoreFolder = async (item: TrashedItem) => {
    try {
      await restoreFolderFromTrash(item.title);
      await loadTrash();
      window.dispatchEvent(new Event('storage-refresh'));
      onNavigateToNotes();
    } catch (error) {
      logger.error('Error restoring folder:', error);
    }
  };

  const handleRestoreCategory = async (item: TrashedItem) => {
    try {
      await restoreCategoryFromTrash(item.title);
      await loadTrash();
      window.dispatchEvent(new Event('storage-refresh'));
      onNavigateToFlows();
    } catch (error) {
      logger.error('Error restoring category:', error);
    }
  };

  const showDeleteConfirm = (item: TrashedItem) => {
    const itemType = item.type === 'note' ? 'note' : item.type === 'flow' ? 'flow' : item.type === 'folder' ? 'folder' : 'category';
    const itemName = item.title;
    
    setConfirmAction({
      type: 'delete',
      item,
      variant: 'danger',
      title: `Permanently Delete ${itemType.charAt(0).toUpperCase() + itemType.slice(1)}?`,
      message: `Are you sure you want to permanently delete "${itemName}"? This action cannot be undone.`,
      onConfirm: async () => {
        try {
          switch (item.type) {
            case 'note':
              await permanentlyDeleteNote(item.id);
              break;
            case 'flow':
              await permanentlyDeleteFlow(item.id);
              break;
            case 'folder':
              await permanentlyDeleteFolder(item.title);
              break;
            case 'category':
              await permanentlyDeleteCategory(item.title);
              break;
          }
          await loadTrash();
          setShowConfirmModal(false);
          setConfirmAction(null);
        } catch (error) {
          logger.error('Error permanently deleting item:', error);
        }
      },
    });
    setShowConfirmModal(true);
  };

  const showEmptyTrashConfirm = () => {
    const totalItems = trashedNotes.length + trashedFlows.length + trashedFolders.length + trashedCategories.length;
    
    setConfirmAction({
      type: 'empty',
      variant: 'danger',
      title: 'Empty Trash?',
      message: `Are you sure you want to permanently delete all ${totalItems} item${totalItems !== 1 ? 's' : ''} in trash? This action cannot be undone.`,
      onConfirm: async () => {
        try {
          await emptyTrash();
          await loadTrash();
          setShowConfirmModal(false);
          setConfirmAction(null);
        } catch (error) {
          logger.error('Error emptying trash:', error);
        }
      },
    });
    setShowConfirmModal(true);
  };

  const filteredItems = () => {
    let items: TrashedItem[] = [];
    
    switch (filter) {
      case 'notes':
        items = trashedNotes;
        break;
      case 'flows':
        items = trashedFlows;
        break;
      case 'folders':
        items = trashedFolders;
        break;
      case 'categories':
        items = trashedCategories;
        break;
      default:
        items = [...trashedNotes, ...trashedFlows, ...trashedFolders, ...trashedCategories];
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      items = items.filter(item => 
        item.title.toLowerCase().includes(query) ||
        item.originalPath.toLowerCase().includes(query)
      );
    }
    
    return items.sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
  };

  const getItemIcon = (type: TrashedItem['type']) => {
    switch (type) {
      case 'note':
        return <FileText className="w-4 h-4" />;
      case 'flow':
        return <GitBranch className="w-4 h-4" />;
      case 'folder':
        return <Folder className="w-4 h-4" />;
      case 'category':
        return <Tag className="w-4 h-4" />;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
  };

  const totalItems = trashedNotes.length + trashedFlows.length + trashedFolders.length + trashedCategories.length;
  const filtered = filteredItems();

  return (
    <div className="min-h-screen bg-theme-bg-primary">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-theme-bg-primary border-b border-theme-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={onNavigateToHome}
                className="p-2 rounded-lg hover:bg-theme-bg-secondary transition-colors"
                aria-label="Back to home"
              >
                <ChevronLeft className="w-5 h-5 text-theme-text-secondary" />
              </button>
              <div className="flex items-center gap-3">
                <Trash2 className="w-6 h-6 text-theme-text-primary" />
                <h1 className="text-2xl font-semibold text-theme-text-primary">Trash</h1>
                {totalItems > 0 && (
                  <span className="px-2 py-1 text-sm bg-theme-bg-secondary text-theme-text-secondary rounded">
                    {totalItems}
                  </span>
                )}
              </div>
            </div>
            
            {totalItems > 0 && (
              <button
                onClick={showEmptyTrashConfirm}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center gap-2 font-medium"
              >
                <X className="w-4 h-4" />
                Empty Trash
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search and Filters */}
        <div className="mb-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-theme-text-secondary" />
            <input
              type="text"
              placeholder="Search trash..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-theme-bg-secondary border border-theme-border rounded-lg text-theme-text-primary placeholder-theme-text-secondary focus:outline-none focus:ring-2 focus:ring-theme-accent"
            />
          </div>
          
          <div className="flex gap-2 flex-wrap">
            {(['all', 'notes', 'flows', 'folders', 'categories'] as TrashFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filter === f
                    ? 'bg-theme-accent text-white'
                    : 'bg-theme-bg-secondary text-theme-text-secondary hover:bg-theme-bg-tertiary'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
                {f !== 'all' && (
                  <span className="ml-2 text-xs opacity-75">
                    {f === 'notes' ? trashedNotes.length :
                     f === 'flows' ? trashedFlows.length :
                     f === 'folders' ? trashedFolders.length :
                     trashedCategories.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Trash Items */}
        {loading ? (
          <div className="text-center py-12 text-theme-text-secondary">Loading trash...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Trash2 className="w-16 h-16 mx-auto text-theme-text-secondary mb-4 opacity-50" />
            <p className="text-theme-text-secondary text-lg">
              {totalItems === 0 ? 'Trash is empty' : 'No items match your search'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((item) => (
              <div
                key={`${item.type}-${item.id}`}
                className="bg-theme-bg-secondary border border-theme-border rounded-lg p-4 hover:bg-theme-bg-tertiary transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="text-theme-text-secondary flex-shrink-0">
                      {getItemIcon(item.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-theme-text-primary font-medium truncate">{item.title}</h3>
                      <div className="flex items-center gap-4 mt-1 text-sm text-theme-text-secondary">
                        <span className="capitalize">{item.type}</span>
                        {item.originalFolder && (
                          <span className="flex items-center gap-1">
                            <Folder className="w-3 h-3" />
                            {item.originalFolder}
                          </span>
                        )}
                        {item.originalCategory && (
                          <span className="flex items-center gap-1">
                            <Tag className="w-3 h-3" />
                            {item.originalCategory}
                          </span>
                        )}
                        <span>{formatDate(item.deletedAt)}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                    <button
                      onClick={() => {
                        switch (item.type) {
                          case 'note':
                            handleRestoreNote(item);
                            break;
                          case 'flow':
                            handleRestoreFlow(item);
                            break;
                          case 'folder':
                            handleRestoreFolder(item);
                            break;
                          case 'category':
                            handleRestoreCategory(item);
                            break;
                        }
                      }}
                      className="p-2 text-theme-text-secondary hover:text-theme-accent transition-colors rounded hover:bg-theme-bg-primary"
                      title="Restore"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => showDeleteConfirm(item)}
                      className="p-2 text-theme-text-secondary hover:text-red-500 transition-colors rounded hover:bg-theme-bg-primary"
                      title="Permanently delete"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {confirmAction && (
        <ConfirmationModal
          isOpen={showConfirmModal}
          title={confirmAction.title}
          message={confirmAction.message}
          confirmText="Delete"
          cancelText="Cancel"
          variant={confirmAction.variant}
          onConfirm={confirmAction.onConfirm}
          onCancel={() => {
            setShowConfirmModal(false);
            setConfirmAction(null);
          }}
        />
      )}
    </div>
  );
}

