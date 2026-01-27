import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type { Root, Content, PhrasingContent, Heading, Paragraph, List, Code, Table, TableRow, TableCell } from 'mdast';
import type { OutputData, OutputBlockData } from '@editorjs/editorjs';

/**
 * Converts Markdown string to Editor.js OutputData
 */
export async function markdownToBlocks(markdown: string): Promise<OutputData> {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm);

  const tree = processor.parse(markdown) as Root;
  const blocks: OutputBlockData[] = [];

  for (const node of tree.children) {
    const block = await convertNodeToBlock(node);
    if (block) {
      blocks.push(block);
    }
  }

  return {
    time: Date.now(),
    blocks,
    version: '2.30.0', // Approximate version
  };
}

/**
 * Converts Editor.js OutputData to Markdown string
 */
export function blocksToMarkdown(data: OutputData): string {
  if (!data.blocks || !Array.isArray(data.blocks)) {
    return '';
  }

  return data.blocks.map(block => {
    switch (block.type) {
      case 'header':
        const level = block.data.level || 1;
        const prefix = '#'.repeat(level);
        return `${prefix} ${convertHtmlToMarkdown(block.data.text)}`;

      case 'paragraph':
        return convertHtmlToMarkdown(block.data.text);

      case 'list':
        const style = block.data.style || 'unordered';
        const items = block.data.items || [];
        return items.map((item: string, index: number) => {
          const content = convertHtmlToMarkdown(item);
          return style === 'ordered' ? `${index + 1}. ${content}` : `- ${content}`;
        }).join('\n');

      case 'checklist':
        const checkItems = block.data.items || [];
        return checkItems.map((item: any) => {
          const checked = item.checked ? 'x' : ' ';
          return `- [${checked}] ${convertHtmlToMarkdown(item.text)}`;
        }).join('\n');

      case 'quote':
        const quoteText = convertHtmlToMarkdown(block.data.text);
        const caption = block.data.caption ? `\n> -- ${convertHtmlToMarkdown(block.data.caption)}` : '';
        return `> ${quoteText}${caption}`;

      case 'code':
        return `\`\`\`${block.data.language || ''}\n${block.data.code}\n\`\`\``;

      case 'delimiter':
        return '---';

      case 'image':
        // Standard markdown image: ![alt](url)
        // If there's a caption, we might lose it in standard markdown unless we use HTML
        // but for now let's stick to standard markdown
        const alt = block.data.caption || block.data.file?.name || 'image';
        const url = block.data.file?.url || '';
        return `![${alt}](${url})`;

      case 'table':
        const content = block.data.content || [];
        if (!content.length) return '';

        const withHeadings = block.data.withHeadings;
        // Simple table generation
        return content.map((row: string[], rowIndex: number) => {
          const rowStr = `| ${row.map(cell => convertHtmlToMarkdown(cell)).join(' | ')} |`;
          let separator = '';
          if (withHeadings && rowIndex === 0) {
            separator = '\n| ' + row.map(() => '---').join(' | ') + ' |';
          }
          return rowStr + separator;
        }).join('\n');

      default:
        // Fallback for unknown blocks (or text)
        if (block.data && block.data.text) {
          return convertHtmlToMarkdown(block.data.text);
        }
        return '';
    }
  }).join('\n\n');
}

// Helper to convert MDAST node to Editor.js Block
async function convertNodeToBlock(node: Content): Promise<OutputBlockData | null> {
  switch (node.type) {
    case 'heading':
      const heading = node as Heading;
      return {
        type: 'header',
        data: {
          text: serializeChildren(heading.children),
          level: heading.depth
        }
      };

    case 'paragraph':
      const paragraph = node as Paragraph;
      // Check if it's an image paragraph (single image)
      if (paragraph.children.length === 1 && paragraph.children[0].type === 'image') {
        const image = paragraph.children[0] as any;
        return {
          type: 'image',
          data: {
            file: { url: image.url },
            caption: image.alt || '',
            withBorder: false,
            withBackground: false,
            stretched: false
          }
        };
      }
      return {
        type: 'paragraph',
        data: {
          text: serializeChildren(paragraph.children)
        }
      };

    case 'list':
      const list = node as List;
      // Check if it is a checklist (task list)
      const isChecklist = list.children.some((item: any) => item.checked !== null);

      if (isChecklist) {
         return {
          type: 'checklist',
          data: {
            items: list.children.map((item: any) => ({
              text: serializeChildren(item.children[0]?.children || []), // items usually have a paragraph as first child
              checked: !!item.checked
            }))
          }
        };
      }

      return {
        type: 'list',
        data: {
          style: list.ordered ? 'ordered' : 'unordered',
          items: list.children.map((item: any) => {
            // Flatten list item children
            return item.children.map((c: any) => serializeChildren([c])).join('');
          })
        }
      };

    case 'code':
      const code = node as Code;
      return {
        type: 'code',
        data: {
          code: code.value,
          language: code.lang
        }
      };

    case 'blockquote':
      const quote = node as any;
      // Blockquote children are usually paragraphs
      return {
        type: 'quote',
        data: {
          text: quote.children.map((c: any) => serializeChildren(c.children || [])).join('<br>'),
          alignment: 'left'
        }
      };

    case 'thematicBreak':
      return {
        type: 'delimiter',
        data: {}
      };

    case 'table':
      const table = node as Table;
      const rows = table.children.map((row: TableRow) =>
        row.children.map((cell: TableCell) => serializeChildren(cell.children))
      );
      return {
        type: 'table',
        data: {
          withHeadings: true, // Markdown tables always assume first row is header implicitly or explicitly
          content: rows
        }
      };

    case 'image':
      // Standalone image not in paragraph (rare in mdast but possible)
       const image = node as any;
        return {
          type: 'image',
          data: {
            file: { url: image.url },
            caption: image.alt || '',
          }
        };

    default:
      console.warn(`Unsupported block type: ${node.type}`);
      return null;
  }
}

// Helper to serialize MDAST inline nodes to HTML string for Editor.js
function serializeChildren(children: PhrasingContent[]): string {
  return children.map(child => serializeNode(child)).join('');
}

function serializeNode(node: any): string {
  switch (node.type) {
    case 'text':
      // Escape HTML entities if needed? Editor.js sanitizes usually, but let's be safe?
      // Actually, simple text should be fine.
      return node.value;

    case 'emphasis':
      return `<i>${serializeChildren(node.children)}</i>`;

    case 'strong':
      return `<b>${serializeChildren(node.children)}</b>`;

    case 'delete':
      return `<s>${serializeChildren(node.children)}</s>`; // or <strike>

    case 'inlineCode':
      return `<code class="inline-code">${node.value}</code>`;

    case 'link':
      return `<a href="${node.url}">${serializeChildren(node.children)}</a>`;

    case 'image':
      // Inline image? Editor.js doesn't support inline images well in text blocks.
      // We'll just render the alt text or a link.
      return `[Image: ${node.alt}]`;

    case 'html':
        return node.value;

    default:
      if (node.children) {
        return serializeChildren(node.children);
      }
      return node.value || '';
  }
}

// Helper to convert HTML from Editor.js to Markdown
function convertHtmlToMarkdown(html: string): string {
  // This is a naive implementation. For robust conversion we might want 'rehype-remark'
  // but let's try regex for common tags first to avoid heavy dependencies if possible.
  // Or we can assume simple tags from Editor.js: <b>, <i>, <a>, <code class="inline-code">, <mark class="cdx-marker">

  let md = html;

  // Replace HTML entities
  md = md.replace(/&nbsp;/g, ' ')
         .replace(/&amp;/g, '&')
         .replace(/&lt;/g, '<')
         .replace(/&gt;/g, '>');

  // Bold
  md = md.replace(/<b>(.*?)<\/b>/g, '**$1**');
  md = md.replace(/<strong>(.*?)<\/strong>/g, '**$1**');

  // Italic
  md = md.replace(/<i>(.*?)<\/i>/g, '*$1*');
  md = md.replace(/<em>(.*?)<\/em>/g, '*$1*');

  // Inline Code
  md = md.replace(/<code class="inline-code">(.*?)<\/code>/g, '`$1`');

  // Link
  md = md.replace(/<a href="(.*?)">(.*?)<\/a>/g, '[$2]($1)');

  // Marker/Highlight (if we use marker tool)
  md = md.replace(/<mark class="cdx-marker">(.*?)<\/mark>/g, '==$1=='); // Non-standard MD but common

  // Break
  md = md.replace(/<br>/g, '\n');

  return md;
}
