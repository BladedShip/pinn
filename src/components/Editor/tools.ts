import Header from '@editorjs/header';
import List from '@editorjs/list';
import Checklist from '@editorjs/checklist';
import Quote from '@editorjs/quote';
import Code from '@editorjs/code';
import Delimiter from '@editorjs/delimiter';
import InlineCode from '@editorjs/inline-code';
import Table from '@editorjs/table';
import Marker from '@editorjs/marker';
import LinkTool from '@editorjs/link';
import ImageTool from '@editorjs/image';

export const EDITOR_TOOLS = {
  header: {
    class: Header,
    config: {
      placeholder: 'Heading',
      levels: [1, 2, 3, 4, 5, 6],
      defaultLevel: 1,
    },
    inlineToolbar: true,
  },
  list: {
    class: List,
    inlineToolbar: true,
    config: {
      defaultStyle: 'unordered',
    },
  },
  checklist: {
    class: Checklist,
    inlineToolbar: true,
  },
  quote: {
    class: Quote,
    inlineToolbar: true,
    config: {
      quotePlaceholder: 'Enter a quote',
      captionPlaceholder: "Quote's author",
    },
  },
  code: Code,
  delimiter: Delimiter,
  inlineCode: {
    class: InlineCode,
  },
  table: {
    class: Table,
    inlineToolbar: true,
  },
  marker: {
    class: Marker,
    shortcut: 'CMD+SHIFT+M',
  },
  linkTool: {
    class: LinkTool,
    config: {
      // No backend for now, so link previews might not work fully without custom fetcher
      // but adding it prevents crash if block exists
    },
  },
  image: {
    class: ImageTool,
    config: {
      // We configure it to accept URLs.
      // Real file upload needs backend or custom uploader (to base64).
      // For now we rely on external URLs or pasting images (which defaults to byFile upload attempt).
      // Since we are offline-first/local, maybe we should implement a base64 uploader?
      // But for this task, ensuring the tool exists is priority.
      uploader: {
        uploadByFile(file: File) {
          return new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = e => {
              resolve({
                success: 1,
                file: {
                  url: e.target?.result,
                },
              });
            };
            reader.readAsDataURL(file);
          });
        },
        uploadByUrl(url: string) {
          return new Promise(resolve => {
            resolve({
              success: 1,
              file: {
                url: url,
              },
            });
          });
        },
      },
    },
  },
};
