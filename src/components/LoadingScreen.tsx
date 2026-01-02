import LoadingSpinner from './shared/LoadingSpinner';

interface LoadingScreenProps {
  message: string;
  subMessage?: string;
}

const QUIRKY_MESSAGES: { [key: string]: string } = {
  'theme': 'Setting the mood...',
  'folder-check': 'Knocking on the folder\'s door...',
  'notes-index': 'Reading the index...',
  'notes-validate': 'Double-checking everything...',
  'flows': 'Loading the flows...',
  'ready': 'Almost there...',
};

export default function LoadingScreen({ message, subMessage }: LoadingScreenProps) {
  const quirkyMessage = QUIRKY_MESSAGES[message] || message;

  return (
    <div className="min-h-screen bg-theme-bg-primary flex items-center justify-center">
      <div className="text-center space-y-4">
        <LoadingSpinner size="lg" />
        <div className="space-y-2">
          <p className="text-lg font-medium text-theme-text-primary">
            {quirkyMessage}
          </p>
          {subMessage && (
            <p className="text-sm text-theme-text-secondary">
              {subMessage}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

