import { useEffect, useRef } from 'react';

/**
 * Hook to listen for storage refresh events
 * @param onRefresh - Callback function to execute when storage is refreshed
 */
export function useStorage(onRefresh: () => void): void {
  const onRefreshRef = useRef(onRefresh);

  // Keep ref up to date
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    const handleStorageRefresh = () => {
      onRefreshRef.current();
    };

    window.addEventListener('storage-refresh', handleStorageRefresh);

    return () => {
      window.removeEventListener('storage-refresh', handleStorageRefresh);
    };
  }, []); // Empty deps - ref is always current
}
