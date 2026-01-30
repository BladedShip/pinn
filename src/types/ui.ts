/**
 * UI component prop types
 */

export interface ToastState {
  isOpen: boolean;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

export type EditorMode = 'markdown' | 'preview';
