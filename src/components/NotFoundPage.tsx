import { useNavigate, useRouter } from '@tanstack/react-router';
import { Home, Bookmark, ArrowLeft } from 'lucide-react';

export default function NotFoundPage() {
  const navigate = useNavigate();
  const router = useRouter();
  return (
    <div className="min-h-screen bg-theme-bg-primary flex items-center justify-center px-5 py-6">
      <div className="bg-theme-bg-primary rounded-2xl shadow-2xl max-w-md w-full p-8 border border-theme-border text-center">
        <div className="w-20 h-20 bg-[#e8935f] rounded-lg flex items-center justify-center mx-auto mb-6">
          <Bookmark className="w-10 h-10 text-white" />
        </div>

        <h1 className="text-6xl font-bold text-theme-text-primary mb-4">404</h1>

        <h2 className="text-2xl font-semibold text-theme-text-primary mb-4">Page Not Found</h2>

        <p className="text-base text-theme-text-secondary mb-8 leading-relaxed">
          The page you're looking for doesn't exist or has been moved. Let's get you back on track.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => navigate({ to: '/' })}
            className="px-6 py-3 text-sm font-medium bg-theme-accent hover:bg-theme-accent-hover text-white rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Home className="w-4 h-4" />
            <span>Go to Home</span>
          </button>

          <button
            onClick={() => router.history.back()}
            className="px-6 py-3 text-sm font-medium bg-theme-bg-secondary hover:bg-theme-bg-tertiary text-theme-text-primary border border-theme-border rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Go Back</span>
          </button>
        </div>
      </div>
    </div>
  );
}
