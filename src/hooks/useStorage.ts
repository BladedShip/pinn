import { useEffect } from 'react';

/**
 * Hook to listen for storage refresh events
 * @param onRefresh - Callback function to execute when storage is refreshed
 */
export function useStorage(onRefresh: () => void): void {
  useEffect(() => {
    const handleStorageRefresh = () => {
      onRefresh();
    };

    window.addEventListener('storage-refresh', handleStorageRefresh);

    return () => {
      window.removeEventListener('storage-refresh', handleStorageRefresh);
    };
  }, [onRefresh]);
}

