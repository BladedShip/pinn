import { forwardRef } from 'react';

interface MarkdownEditorProps {
  content: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

const MarkdownEditor = forwardRef<HTMLTextAreaElement, MarkdownEditorProps>(
  ({ content, onChange, readOnly = false }, ref) => {
    return (
      <>
        <textarea
          ref={ref}
          value={content}
          onChange={(e) => onChange(e.target.value)}
          readOnly={readOnly}
          placeholder="Start writing your note..."
          className="w-full bg-transparent text-theme-text-primary placeholder-gray-600 focus:outline-none resize-none font-mono text-sm leading-relaxed markdown-editor-textarea"
          style={{ 
            lineHeight: '1.8',
            minHeight: 'calc(100vh - 300px)',
            scrollbarWidth: 'none', /* Firefox */
            msOverflowStyle: 'none', /* IE and Edge */
          }}
        />
        <style>{`
          .markdown-editor-textarea::-webkit-scrollbar {
            display: none; /* Chrome, Safari, Opera */
          }
        `}</style>
      </>
    );
  }
);

export default MarkdownEditor;
