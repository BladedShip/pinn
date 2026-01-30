import { useState, useEffect } from 'react';
import { SEARCH_CONFIG } from '../constants';

/**
 * Hook to debounce a value
 * @param value - Value to debounce
 * @param delay - Delay in milliseconds (defaults to SEARCH_CONFIG.DEBOUNCE_MS)
 * @returns Debounced value
 */
export function useDebounce<T>(value: T, delay: number = SEARCH_CONFIG.DEBOUNCE_MS): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Set up the timeout
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Clean up the timeout if value changes before delay
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
