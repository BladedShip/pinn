import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check, Book } from 'lucide-react';

interface MarkdownPreviewProps {
  content: string;
  onNavigateToNote?: (noteId: string) => void;
}

export default function MarkdownPreview({ content, onNavigateToNote }: MarkdownPreviewProps) {
  const [copiedCodeBlocks, setCopiedCodeBlocks] = useState<Set<number>>(new Set());
  
  const handleCopyCode = async (code: string, index: number) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCodeBlocks(prev => new Set(prev).add(index));
      setTimeout(() => {
        setCopiedCodeBlocks(prev => {
          const newSet = new Set(prev);
          newSet.delete(index);
          return newSet;
        });
      }, 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  // Parse note references and replace with React components
  const parseNoteReferences = (text: string): string => {
    if (!text) return text;
    // For now, just return the text as-is since we'll handle it in the custom renderer
    return text;
  };

  // Aggressively merge URLs into the same paragraph as surrounding text
  const preprocessContent = (text: string): string => {
    if (!text) return text;
    
    // Replace any newlines (single or multiple) around URLs with a single space
    // This forces URLs to stay inline with text
    let result = text;
    
    // Replace: text + newline(s) + URL with: text + space + URL
    result = result.replace(/([^\n])\n+(?=https?:\/\/)/g, '$1 ');
    
    // Replace: URL + newline(s) + text with: URL + space + text
    result = result.replace(/(https?:\/\/[^\s]+)\n+([^\n])/g, '$1 $2');
    
    // Special case: if a line is ONLY a URL, merge it
    // Split into lines and process
    const lines = result.split('\n');
    const processed: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const isOnlyUrl = /^https?:\/\/[^\s]+$/.test(line);
      
      if (isOnlyUrl && processed.length > 0) {
        // Append URL to previous line with a space
        processed[processed.length - 1] += ' ' + line;
      } else if (isOnlyUrl && i < lines.length - 1) {
        // Prepend URL to next line with a space
        const nextLine = lines[i + 1].trim();
        if (nextLine) {
          lines[i + 1] = line + ' ' + nextLine;
        } else {
          processed.push(line);
        }
      } else {
        processed.push(lines[i]);
      }
    }
    
    return processed.join('\n');
  };

  const processedContent = preprocessContent(content);

  return (
    <div className="w-full prose prose-invert prose-gray max-w-none markdown-preview" style={{ minHeight: 'calc(100vh - 300px)' }}>
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]}
        components={{
          text({ node, ...props }: any) {
            // Render text nodes with inline URL detection
            const text = node.value || '';
            const urlPattern = /(https?:\/\/[^\s<>"{}|\\^`\[\]()]+)/g;
            const parts = text.split(urlPattern);
            
            return (
              <>
                {parts.map((part, index) => {
                  if (part.match(/^https?:\/\//)) {
                    // This is a URL - render as inline link
                    return (
                      <a
                        key={index}
                        href={part}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="markdown-link"
                        style={{
                          display: 'inline',
                          wordBreak: 'break-all',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {part}
                      </a>
                    );
                  }
                  return part;
                })}
              </>
            );
          },
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const codeString = String(children).replace(/\n$/, '');
            const codeIndex = node?.position?.start?.line || Date.now();
            
            // In react-markdown:
            // - Inline code (backticks): inline === true, no language class, no pre wrapper
            // - Code blocks (triple backticks): inline === false, may have language class, wrapped in pre
            // Check: inline must be true, OR (inline is not false AND no language class AND code is short/single line)
            const hasLanguageClass = match !== null;
            const isInlineCode = inline === true || (inline !== false && !hasLanguageClass && codeString.split('\n').length === 1);
            
            if (isInlineCode) {
              // Inline code - render as inline element without copy button
              // Don't spread className from props as it might contain block-level classes
              const { className: propClassName, ...restProps } = props;
              return (
                <code 
                  className="inline-code" 
                  style={{
                    display: 'inline !important',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                    margin: '0 !important',
                    padding: '0.2rem 0.5rem',
                    width: 'auto !important',
                    maxWidth: 'none !important',
                  }}
                  {...restProps}
                >
                  {children}
                </code>
              );
            }
            
            // Code block - handle both with and without language
            const language = match ? match[1] : 'text';
            
            return (
                <div className="relative group code-block-wrapper">
                  <div className="absolute top-3 right-3 z-10">
                    <button
                      onClick={() => handleCopyCode(codeString, codeIndex)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-theme-bg-primary/90 hover:bg-theme-bg-primary backdrop-blur-sm border border-gray-600/50 rounded-md text-theme-text-secondary hover:text-theme-text-primary transition-all text-xs"
                      title="Copy code"
                    >
                      {copiedCodeBlocks.has(codeIndex) ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-green-400" />
                          <span className="text-green-400">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                  <SyntaxHighlighter
                    language={language}
                    style={oneDark}
                    PreTag="div"
                    customStyle={{
                      margin: '1rem 0',
                      borderRadius: '6px',
                      padding: '0.5rem 0.75rem',
                      paddingTop: '2.25rem',
                      paddingBottom: '0.5rem',
                      overflowX: 'hidden',
                      wordWrap: 'break-word',
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'break-word',
                      backgroundColor: 'transparent',
                      border: 'none',
                      fontSize: '0.875rem',
                      lineHeight: '1.5',
                      color: '#d1d5db',
                    }}
                    codeTagProps={{
                      style: {
                        color: '#d1d5db',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                        background: 'transparent',
                      }
                    }}
                    {...props}
                  >
                    {codeString}
                  </SyntaxHighlighter>
                </div>
              );
          },
          pre({ children, ...props }: any) {
            // Pre tags only wrap code blocks, never inline code
            // We handle code blocks in the code component, so we just pass through
            return <pre {...props}>{children}</pre>;
          },
          p({ node, children, ...props }: any) {
            // Parse paragraph text to detect note references
            const parseContent = (children: any): any => {
              if (typeof children === 'string') {
                const noteRefPattern = /\[\[note:([^\]|]+)\|([^\]]+)\]\]/g;
                const parts: any[] = [];
                let lastIndex = 0;
                let match;

                while ((match = noteRefPattern.exec(children)) !== null) {
                  // Add text before the match
                  if (match.index > lastIndex) {
                    parts.push(children.substring(lastIndex, match.index));
                  }

                  // Add note reference component
                  const noteId = match[1];
                  const noteTitle = match[2];
                  parts.push(
                    <span
                      key={`note-ref-${match.index}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (onNavigateToNote) {
                          onNavigateToNote(noteId);
                        }
                      }}
                      className="note-reference-tag"
                      title={`Click to open: ${noteTitle}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        cursor: onNavigateToNote ? 'pointer' : 'default',
                        backgroundColor: 'rgba(232, 147, 95, 0.15)',
                        color: 'rgb(232, 147, 95)',
                        border: '1px solid rgba(232, 147, 95, 0.4)',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '0.375rem',
                        fontSize: '0.875em',
                        fontWeight: '500',
                        transition: 'all 0.2s ease',
                        margin: '0 0.2rem',
                        whiteSpace: 'nowrap',
                        verticalAlign: 'middle',
                      }}
                      onMouseEnter={(e) => {
                        if (onNavigateToNote) {
                          const target = e.currentTarget as HTMLElement;
                          target.style.backgroundColor = 'rgba(232, 147, 95, 0.25)';
                          target.style.borderColor = 'rgba(232, 147, 95, 0.6)';
                          target.style.transform = 'translateY(-1px)';
                          target.style.boxShadow = '0 2px 4px rgba(232, 147, 95, 0.2)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        const target = e.currentTarget as HTMLElement;
                        target.style.backgroundColor = 'rgba(232, 147, 95, 0.15)';
                        target.style.borderColor = 'rgba(232, 147, 95, 0.4)';
                        target.style.transform = 'translateY(0)';
                        target.style.boxShadow = 'none';
                      }}
                    >
                      <Book style={{ width: '0.875em', height: '0.875em', flexShrink: 0 }} />
                      {noteTitle}
                    </span>
                  );

                  lastIndex = match.index + match[0].length;
                }

                // Add remaining text
                if (lastIndex < children.length) {
                  parts.push(children.substring(lastIndex));
                }

                return parts.length > 0 ? parts : children;
              }

              // Handle array of children
              if (Array.isArray(children)) {
                return children.map((child, index) => {
                  if (typeof child === 'string') {
                    return parseContent(child);
                  }
                  // If it's a text node object
                  if (child?.props?.node?.type === 'text' && child?.props?.node?.value) {
                    return parseContent(child.props.node.value);
                  }
                  return child;
                });
              }

              return children;
            };

            const parsedChildren = parseContent(children);

            return (
              <p {...props} style={{ display: 'block', margin: '0 0 1rem 0' }}>
                {parsedChildren}
              </p>
            );
          },
          a({ node, href, children, ...props }: any) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                {...props}
                className="markdown-link"
                style={{
                  display: 'inline',
                  wordBreak: 'break-all',
                  overflowWrap: 'anywhere',
                }}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {processedContent || ''}
      </ReactMarkdown>
      {!content && (
        <div className="text-gray-600 italic">Start writing your note...</div>
      )}
      <style>{`
        .markdown-preview {
          color: rgb(209, 213, 219);
          line-height: 1.625;
        }
        /* Override prose styles that might make links block-level */
        .markdown-preview.prose a {
          display: inline !important;
        }
        .markdown-preview h1 {
          font-size: 2.25rem;
          font-weight: 700;
          color: rgb(229, 231, 235);
          margin-bottom: 1rem;
          margin-top: 0.5rem;
        }
        .markdown-preview h2 {
          font-size: 1.875rem;
          font-weight: 700;
          color: rgb(229, 231, 235);
          margin-bottom: 0.75rem;
          margin-top: 0.5rem;
        }
        .markdown-preview h3 {
          font-size: 1.5rem;
          font-weight: 600;
          color: rgb(209, 213, 219);
          margin-bottom: 0.75rem;
          margin-top: 0.5rem;
        }
        .markdown-preview h4 {
          font-size: 1.25rem;
          font-weight: 600;
          color: rgb(209, 213, 219);
          margin-bottom: 0.5rem;
          margin-top: 0.5rem;
        }
        .markdown-preview h5 {
          font-size: 1.125rem;
          font-weight: 600;
          color: rgb(209, 213, 219);
          margin-bottom: 0.5rem;
          margin-top: 0.5rem;
        }
        .markdown-preview h6 {
          font-size: 1rem;
          font-weight: 600;
          color: rgb(209, 213, 219);
          margin-bottom: 0.5rem;
          margin-top: 0.5rem;
        }
        .markdown-preview p {
          color: rgb(209, 213, 219);
          margin-bottom: 1rem;
          line-height: 1.625;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }
        .markdown-preview p:has(a) {
          display: block !important;
        }
        .markdown-preview p a {
          display: inline !important;
        }
        .markdown-preview a,
        .markdown-preview .markdown-link,
        .markdown-preview p a,
        .markdown-preview li a,
        .markdown-preview span a {
          color: rgb(147, 197, 253) !important;
          text-decoration: underline !important;
          text-decoration-color: rgba(96, 165, 250, 0.6) !important;
          background-color: rgba(96, 165, 250, 0.15) !important;
          border: 1px solid rgba(96, 165, 250, 0.4) !important;
          padding: 0.125rem 0.5rem !important;
          border-radius: 0.375rem !important;
          display: inline !important;
          font-size: inherit !important;
          font-weight: 500 !important;
          transition: all 0.2s ease !important;
          line-height: 1.5 !important;
          word-break: break-all !important;
          overflow-wrap: anywhere !important;
          white-space: normal !important;
          cursor: pointer !important;
          margin: 0 !important;
          float: none !important;
          clear: none !important;
          width: auto !important;
          max-width: none !important;
        }
        .markdown-preview a:hover,
        .markdown-preview .markdown-link:hover {
          background-color: rgba(96, 165, 250, 0.25) !important;
          border-color: rgba(96, 165, 250, 0.6) !important;
          color: rgb(219, 234, 254) !important;
          text-decoration-color: rgba(96, 165, 250, 0.8) !important;
        }
        .markdown-preview ul, .markdown-preview ol {
          color: rgb(209, 213, 219);
          margin-bottom: 1rem;
          padding-left: 1.5rem;
        }
        .markdown-preview ul {
          list-style-type: disc;
        }
        .markdown-preview ol {
          list-style-type: decimal;
        }
        .markdown-preview li {
          color: rgb(209, 213, 219);
          margin-bottom: 0.5rem;
        }
        .markdown-preview blockquote {
          border-left: 4px solid rgb(75, 85, 99);
          padding-left: 1rem;
          font-style: italic;
          color: rgb(156, 163, 175);
          margin: 1rem 0;
        }
        .markdown-preview code:not(pre code),
        .markdown-preview .inline-code {
          background-color: rgba(58, 68, 80, 0.9) !important;
          color: rgb(236, 237, 238) !important;
          padding: 0.2rem 0.5rem !important;
          border-radius: 0.375rem !important;
          font-size: 0.875rem !important;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
          border: 1px solid rgba(75, 85, 99, 0.6) !important;
          font-weight: 450 !important;
          line-height: 1.5 !important;
          display: inline !important;
          white-space: normal !important;
          word-break: break-word !important;
          margin: 0 !important;
          width: auto !important;
          max-width: none !important;
        }
        .markdown-preview code {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        }
        .markdown-preview pre {
          background-color: rgb(58, 68, 80);
          color: rgb(209, 213, 219);
          padding: 1rem;
          border-radius: 0.5rem;
          overflow-x: hidden;
          overflow-wrap: break-word;
          word-wrap: break-word;
          white-space: pre-wrap;
          margin: 1rem 0;
        }
        .markdown-preview pre code {
          background-color: transparent;
          padding: 0;
          font-size: 0.875rem;
          white-space: pre-wrap;
          word-wrap: break-word;
        }
        .markdown-preview .code-block-wrapper {
          position: relative;
        }
        .markdown-preview .code-block-wrapper > div {
          overflow-x: hidden !important;
          word-wrap: break-word !important;
          white-space: pre-wrap !important;
          overflow-wrap: break-word !important;
        }
        .markdown-preview .code-block-wrapper pre {
          overflow-x: hidden !important;
          word-wrap: break-word !important;
          white-space: pre-wrap !important;
          overflow-wrap: break-word !important;
        }
        .markdown-preview .code-block-wrapper code {
          white-space: pre-wrap !important;
          word-wrap: break-word !important;
          overflow-wrap: break-word !important;
        }
        .markdown-preview .code-block-wrapper .token {
          background: transparent !important;
        }
        .markdown-preview .code-block-wrapper pre[class*="language-"],
        .markdown-preview .code-block-wrapper code[class*="language-"] {
          background: transparent !important;
          color: #d1d5db !important;
        }
        .markdown-preview .code-block-wrapper > div[class*="language-"] {
          background: transparent !important;
        }
        .markdown-preview .code-block-wrapper .token.comment,
        .markdown-preview .code-block-wrapper .token.prolog,
        .markdown-preview .code-block-wrapper .token.doctype,
        .markdown-preview .code-block-wrapper .token.cdata {
          color: #9ca3af !important;
        }
        .markdown-preview .code-block-wrapper .token.string,
        .markdown-preview .code-block-wrapper .token.attr-value {
          color: #86efac !important;
        }
        .markdown-preview .code-block-wrapper .token.keyword,
        .markdown-preview .code-block-wrapper .token.operator {
          color: #60a5fa !important;
        }
        .markdown-preview .code-block-wrapper .token.property,
        .markdown-preview .code-block-wrapper .token.tag,
        .markdown-preview .code-block-wrapper .token.boolean,
        .markdown-preview .code-block-wrapper .token.number,
        .markdown-preview .code-block-wrapper .token.constant,
        .markdown-preview .code-block-wrapper .token.symbol {
          color: #f59e0b !important;
        }
        .markdown-preview .code-block-wrapper .token.function,
        .markdown-preview .code-block-wrapper .token.class-name {
          color: #a78bfa !important;
        }
        .markdown-preview .code-block-wrapper .token.variable {
          color: #f472b6 !important;
        }
        .markdown-preview table {
          min-width: 100%;
          border-collapse: collapse;
          border: 1px solid rgb(75, 85, 99);
          margin: 1rem 0;
        }
        .markdown-preview thead {
          background-color: rgb(58, 68, 80);
        }
        .markdown-preview tr {
          border-bottom: 1px solid rgb(75, 85, 99);
        }
        .markdown-preview th, .markdown-preview td {
          border: 1px solid rgb(75, 85, 99);
          padding: 0.5rem 1rem;
          color: rgb(209, 213, 219);
        }
        .markdown-preview th {
          text-align: left;
          color: rgb(209, 213, 219);
          font-weight: 600;
        }
        .markdown-preview hr {
          border-color: rgb(75, 85, 99);
          margin: 2rem 0;
          border-top: 1px solid rgb(75, 85, 99);
          border-bottom: none;
          border-left: none;
          border-right: none;
        }
        .markdown-preview strong {
          font-weight: 700;
          color: rgb(229, 231, 235);
        }
        .markdown-preview em {
          font-style: italic;
        }
        .markdown-preview del {
          text-decoration: line-through;
          color: rgb(156, 163, 175);
        }
        .markdown-preview img {
          max-width: 100%;
          height: auto;
          border-radius: 0.5rem;
          margin: 1rem 0;
        }
        .markdown-preview input[type="checkbox"] {
          margin-right: 0.5rem;
          appearance: none;
          width: 1.1em;
          height: 1.1em;
          border: 2px solid #6b8e7f;
          border-radius: 3px;
          background-color: transparent;
          cursor: pointer;
          position: relative;
          flex-shrink: 0;
        }
        .markdown-preview input[type="checkbox"]:checked {
          background-color: #6b8e7f;
          border-color: #6b8e7f;
          accent-color: #6b8e7f;
        }
        .markdown-preview input[type="checkbox"]:checked::before {
          content: "✓";
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          color: #1f2937;
          font-size: 0.9em;
          font-weight: 700;
          line-height: 1;
        }
        .markdown-preview li:has(input[type="checkbox"]:checked) {
          color: #6b8e7f;
        }
        .markdown-preview task-list-item {
          list-style-type: none;
        }
      `}</style>
    </div>
  );
}

