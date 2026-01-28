## 2026-01-28 - File System Access API Race Conditions
**Learning:** Rapid autosave operations using File System Access API can lead to race conditions where index reads return stale data, causing the app to assume a file doesn't exist and create duplicates (e.g., `Untitled`, `Untitled-1`).
**Action:** Implement an in-memory cache for file indices (`cachedNotesIndex`) to ensure immediate consistency for reads within the session, while still persisting to disk asynchronously.
