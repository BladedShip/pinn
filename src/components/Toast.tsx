import { useEffect } from 'react';
import { CheckCircle, XCircle, X } from 'lucide-react';

interface ToastProps {
  isOpen: boolean;
  onClose: () => void;
  message: string;
  type?: 'success' | 'error';
  duration?: number;
}

export default function Toast({
  isOpen,
  onClose,
  message,
  type = 'success',
  duration = 3000,
}: ToastProps) {
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [isOpen, duration, onClose]);

  if (!isOpen) return null;

  const isSuccess = type === 'success';
  const iconBgColor = isSuccess ? 'bg-green-500/20' : 'bg-red-500/20';
  const iconColor = isSuccess ? 'text-green-400' : 'text-red-400';
  const borderColor = isSuccess ? 'border-green-500/30' : 'border-red-500/30';
  const Icon = isSuccess ? CheckCircle : XCircle;

  return (
    <div className="fixed top-4 right-4 z-[100] animate-slide-in">
      <div
        className={`bg-theme-bg-primary border ${borderColor} rounded-lg shadow-2xl min-w-[300px] max-w-[500px] overflow-hidden`}
      >
        <div className="px-4 py-3 flex items-center gap-3">
          <div className={`${iconBgColor} rounded-lg p-2 flex-shrink-0`}>
            <Icon className={`w-5 h-5 ${iconColor}`} />
          </div>
          <p className="flex-1 text-theme-text-primary text-sm">{message}</p>
          <button
            onClick={onClose}
            className="text-theme-text-secondary hover:text-white hover:bg-theme-bg-secondary rounded p-1 transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <style>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
