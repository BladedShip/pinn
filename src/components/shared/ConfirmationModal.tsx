import { X, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { useEffect } from 'react';

export type ConfirmationVariant = 'danger' | 'warning' | 'info';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmationVariant;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmationModal({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmationModalProps) {
  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      } else if (e.key === 'Enter') {
        onConfirm();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onConfirm, onCancel]);

  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      icon: AlertTriangle,
      iconColor: 'text-red-500',
      buttonBg: 'bg-red-600 hover:bg-red-700',
      buttonFocus: 'focus:ring-red-500',
    },
    warning: {
      icon: AlertCircle,
      iconColor: 'text-yellow-500',
      buttonBg: 'bg-yellow-600 hover:bg-yellow-700',
      buttonFocus: 'focus:ring-yellow-500',
    },
    info: {
      icon: Info,
      iconColor: 'text-blue-500',
      buttonBg: 'bg-blue-600 hover:bg-blue-700',
      buttonFocus: 'focus:ring-blue-500',
    },
  };

  const style = variantStyles[variant];
  const Icon = style.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative bg-theme-bg-primary rounded-lg shadow-xl max-w-md w-full border border-theme-border">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-theme-border">
          <div className="flex items-center gap-3">
            <Icon className={`w-6 h-6 ${style.iconColor}`} />
            <h2 className="text-xl font-semibold text-theme-text-primary">{title}</h2>
          </div>
          <button
            onClick={onCancel}
            className="text-theme-text-secondary hover:text-theme-text-primary transition-colors p-1 rounded hover:bg-theme-bg-secondary"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-theme-text-secondary leading-relaxed">{message}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-theme-border">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-theme-text-secondary hover:text-theme-text-primary transition-colors rounded-lg hover:bg-theme-bg-secondary font-medium"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-white rounded-lg font-medium transition-colors ${style.buttonBg} ${style.buttonFocus} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-theme-bg-primary`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
