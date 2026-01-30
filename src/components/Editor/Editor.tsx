import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import EditorJS, { OutputData } from '@editorjs/editorjs';
import { EDITOR_TOOLS } from './tools';

interface EditorProps {
  data: OutputData;
  onChange?: () => void;
  readOnly?: boolean;
}

export interface EditorHandle {
  save: () => Promise<OutputData>;
  getInstance: () => EditorJS | null;
}

const Editor = forwardRef<EditorHandle, EditorProps>(({ data, onChange, readOnly }, ref) => {
  const editorRef = useRef<EditorJS | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isReadyRef = useRef<boolean>(false);

  useImperativeHandle(ref, () => ({
    save: async () => {
      if (editorRef.current && isReadyRef.current) {
        return editorRef.current.save();
      }
      return Promise.resolve(data);
    },
    getInstance: () => editorRef.current,
  }));

  useEffect(() => {
    if (!containerRef.current) return;

    if (editorRef.current) return;

    const editor = new EditorJS({
      holder: containerRef.current,
      tools: EDITOR_TOOLS as any, // Cast to any to avoid strict type issues with plugins
      data: data,
      readOnly: readOnly,
      placeholder: 'Start writing your note...',
      inlineToolbar: true,
      onReady: () => {
        isReadyRef.current = true;
      },
      onChange: () => {
        if (onChange) {
          onChange();
        }
      },
      autofocus: true,
      minHeight: 0,
    });

    editorRef.current = editor;

    return () => {
      if (editorRef.current && typeof editorRef.current.destroy === 'function') {
        editorRef.current.destroy();
        editorRef.current = null;
        isReadyRef.current = false;
      }
    };
  }, []); // Empty dependency array - we only initialize once per mount

  // Handle readOnly updates
  useEffect(() => {
    if (
      editorRef.current &&
      isReadyRef.current &&
      typeof editorRef.current.readOnly !== 'undefined'
    ) {
      editorRef.current.readOnly.toggle(readOnly);
    }
  }, [readOnly]);

  return (
    <div className="editor-container prose max-w-none w-full pb-20">
      <div ref={containerRef} className="min-h-[calc(100vh-200px)]" />
    </div>
  );
});

Editor.displayName = 'Editor';

export default Editor;
