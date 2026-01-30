import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  Link,
  StyleSheet,
  pdf,
  Image as PDFImage,
} from '@react-pdf/renderer';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type {
  Root,
  Content,
  PhrasingContent,
  Text as MdastText,
  Heading,
  Paragraph,
  List,
  ListItem,
  Code,
  InlineCode,
  Strong,
  Emphasis,
  Delete,
  Link as MdastLink,
  Image as MdastImage,
  Blockquote,
  Table,
  TableRow,
  TableCell,
} from 'mdast';

// ============================================================================
// Constants & Types
// ============================================================================

// Color constants matching legacy version exactly
const COLORS = {
  // Syntax highlighting
  keyword: [147, 51, 234] as [number, number, number], // Purple
  string: [34, 139, 34] as [number, number, number], // Green
  comment: [108, 117, 125] as [number, number, number], // Gray
  number: [255, 140, 0] as [number, number, number], // Orange
  defaultCode: [55, 65, 81] as [number, number, number], // Dark gray

  // UI elements
  tag: [59, 130, 246] as [number, number, number], // Blue
  noteRef: [232, 147, 95] as [number, number, number], // Accent orange
  link: [80, 120, 160] as [number, number, number], // Muted blue-gray
  blockquote: [110, 110, 110] as [number, number, number], // Gray
  checkboxChecked: [100, 200, 150] as [number, number, number], // Muted green
  checkboxBorder: [190, 190, 190] as [number, number, number], // Gray

  // Text colors
  title: [40, 40, 40] as [number, number, number],
  heading1: [0, 0, 0] as [number, number, number],
  heading2: [20, 20, 20] as [number, number, number],
  heading3: [40, 40, 40] as [number, number, number],
  heading4: [60, 60, 60] as [number, number, number],
  body: [40, 40, 40] as [number, number, number],

  // Borders and backgrounds
  titleDivider: [230, 230, 230] as [number, number, number],
  codeBlockBg: [248, 248, 248] as [number, number, number],
  inlineCodeBg: [240, 240, 240] as [number, number, number],
  tableBorder: [230, 230, 230] as [number, number, number],
  tableOuterBorder: [220, 220, 220] as [number, number, number],
  blockquoteBorder: [200, 200, 200] as [number, number, number],
  horizontalRule: [200, 200, 200] as [number, number, number],
} as const;

// Helper to convert RGB array to hex string
function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b]
    .map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    })
    .join('')}`;
}

/**
 * Detect if a character is an emoji
 * Covers most emoji ranges including:
 * - Basic emojis (U+1F300 - U+1F9FF)
 * - Emoticons (U+1F600 - U+1F64F)
 * - Supplemental symbols (U+1F900 - U+1F9FF)
 * - Symbols & Pictographs (U+1F300 - U+1F5FF)
 * - Transport & Map (U+1F680 - U+1F6FF)
 * - Flags (U+1F1E6 - U+1F1FF)
 * - And various other ranges
 */
function isEmoji(char: string): boolean {
  const codePoint = char.codePointAt(0);
  if (!codePoint) return false;

  return (
    // Emoticons
    (codePoint >= 0x1f600 && codePoint <= 0x1f64f) ||
    // Miscellaneous Symbols and Pictographs
    (codePoint >= 0x1f300 && codePoint <= 0x1f5ff) ||
    // Supplemental Symbols and Pictographs
    (codePoint >= 0x1f900 && codePoint <= 0x1f9ff) ||
    // Transport and Map Symbols
    (codePoint >= 0x1f680 && codePoint <= 0x1f6ff) ||
    // Regional Indicator Symbols (flags)
    (codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff) ||
    // Symbols and Pictographs Extended-A
    (codePoint >= 0x1fa00 && codePoint <= 0x1faff) ||
    // Symbols and Pictographs Extended-B
    (codePoint >= 0x1f000 && codePoint <= 0x1f02f) ||
    // Dingbats
    (codePoint >= 0x2700 && codePoint <= 0x27bf) ||
    // Miscellaneous Symbols
    (codePoint >= 0x2600 && codePoint <= 0x26ff) ||
    // Supplemental Arrows-C
    (codePoint >= 0x1f800 && codePoint <= 0x1f8ff) ||
    // CJK Symbols and Punctuation (includes some emoji-like symbols)
    (codePoint >= 0x3030 && codePoint <= 0x303f && (codePoint === 0x3030 || codePoint === 0x303d))
  );
}

/**
 * Split text into segments of emoji and non-emoji characters
 */
function splitEmojiSegments(text: string): EmojiSegment[] {
  const segments: EmojiSegment[] = [];
  let currentSegment = '';
  let currentIsEmoji = false;

  // Use Array.from to properly handle surrogate pairs (multi-byte emojis)
  const chars = Array.from(text);

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const charIsEmoji = isEmoji(char);

    // Check for emoji sequences (like flags which are 2 regional indicators)
    if (charIsEmoji && i < chars.length - 1) {
      const nextChar = chars[i + 1];
      if (isEmoji(nextChar)) {
        // Check if this is a flag (two regional indicators)
        const code1 = char.codePointAt(0);
        const code2 = nextChar.codePointAt(0);
        if (
          code1 &&
          code2 &&
          code1 >= 0x1f1e6 &&
          code1 <= 0x1f1ff &&
          code2 >= 0x1f1e6 &&
          code2 <= 0x1f1ff
        ) {
          // It's a flag, combine them
          if (currentSegment && currentIsEmoji !== charIsEmoji) {
            segments.push({ text: currentSegment, isEmoji: currentIsEmoji });
            currentSegment = '';
          }
          currentSegment += char + nextChar;
          currentIsEmoji = true;
          i++; // Skip next char as we've already processed it
          continue;
        }
      }
    }

    // If the emoji status changed, save current segment and start new one
    if (currentSegment && currentIsEmoji !== charIsEmoji) {
      segments.push({ text: currentSegment, isEmoji: currentIsEmoji });
      currentSegment = '';
    }

    currentSegment += char;
    currentIsEmoji = charIsEmoji;
  }

  // Add the last segment
  if (currentSegment) {
    segments.push({ text: currentSegment, isEmoji: currentIsEmoji });
  }

  return segments.length > 0 ? segments : [{ text, isEmoji: false }];
}

// Text segment type for inline markdown parsing
interface TextSegment {
  text: string;
  bold: boolean;
  italic: boolean;
  code: boolean;
  strikethrough: boolean;
  link?: string;
  isImage?: boolean;
  isTag?: boolean;
  noteRef?: { id: string; title: string };
  hasEmoji?: boolean; // Indicates if segment contains emojis
}

// Emoji segment for splitting text with emojis
interface EmojiSegment {
  text: string;
  isEmoji: boolean;
}

// Syntax highlighting segment
interface SyntaxSegment {
  text: string;
  color: [number, number, number];
}

// PDF configuration
const PDF_CONFIG = {
  pageWidth: 210, // A4 width in mm
  pageHeight: 297, // A4 height in mm
  marginLeft: 20,
  marginRight: 20,
  marginTop: 20,
  marginBottom: 20,
  lineHeight: 1.5,
} as const;

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 11,
    fontFamily: 'Helvetica',
    lineHeight: 1.6,
    color: rgbToHex(COLORS.body),
  },
  emoji: {
    fontFamily: 'Helvetica', // Fallback font
    // Note: react-pdf will attempt to use the system's emoji font when rendering emojis
    // Emoji rendering quality depends on the PDF viewer and system fonts available
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    color: rgbToHex(COLORS.title),
  },
  titleDivider: {
    borderBottom: `1px solid ${rgbToHex(COLORS.titleDivider)}`,
    marginBottom: 20,
  },
  heading1: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
    color: rgbToHex(COLORS.heading1),
  },
  heading2: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 14,
    marginBottom: 6,
    color: rgbToHex(COLORS.heading2),
  },
  heading3: {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 12,
    marginBottom: 5,
    color: rgbToHex(COLORS.heading3),
  },
  heading4: {
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 4,
    color: rgbToHex(COLORS.heading4),
  },
  paragraph: {
    marginBottom: 8,
  },
  list: {
    marginBottom: 8,
    paddingLeft: 20,
  },
  listItem: {
    marginBottom: 4,
    flexDirection: 'row',
  },
  bullet: {
    marginRight: 8,
  },
  codeBlock: {
    backgroundColor: rgbToHex(COLORS.codeBlockBg),
    padding: 10,
    marginBottom: 10,
    fontFamily: 'Courier',
    fontSize: 9,
  },
  inlineCode: {
    backgroundColor: rgbToHex(COLORS.inlineCodeBg),
    padding: '2px 4px',
    fontFamily: 'Courier',
    fontSize: 9.5,
    color: rgbToHex([60, 60, 60]),
  },
  blockquote: {
    borderLeft: `3px solid ${rgbToHex(COLORS.blockquoteBorder)}`,
    paddingLeft: 15,
    marginLeft: 0,
    marginBottom: 10,
    color: rgbToHex(COLORS.blockquote),
    fontStyle: 'italic',
  },
  table: {
    marginBottom: 10,
    border: `1px solid ${rgbToHex(COLORS.tableOuterBorder)}`,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: `1px solid ${rgbToHex(COLORS.tableBorder)}`,
  },
  tableHeader: {
    backgroundColor: '#f5f5f5',
    fontWeight: 'bold',
  },
  tableCell: {
    padding: 8,
    borderRight: `1px solid ${rgbToHex(COLORS.tableBorder)}`,
    flex: 1,
  },
  link: {
    color: rgbToHex(COLORS.link),
    textDecoration: 'underline',
  },
  tag: {
    color: rgbToHex(COLORS.tag),
    fontFamily: 'Courier',
    fontSize: 10,
  },
  noteRef: {
    color: rgbToHex(COLORS.noteRef),
    fontFamily: 'Courier',
    fontSize: 10.5,
  },
  imagePlaceholder: {
    color: '#999999',
    fontStyle: 'italic',
    fontSize: 10,
  },
  horizontalRule: {
    borderBottom: `1px solid ${rgbToHex(COLORS.horizontalRule)}`,
    marginTop: 10,
    marginBottom: 10,
  },
  strikethrough: {
    textDecoration: 'line-through',
  },
  checkbox: {
    width: 3.5,
    height: 3.5,
    marginRight: 6,
    marginTop: 2,
  },
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Apply basic syntax highlighting to code
 */
function applySyntaxHighlighting(code: string): SyntaxSegment[] {
  const segments: SyntaxSegment[] = [];

  // Replace rupee symbol for reliable rendering
  code = code.replace(/₹/g, 'Rs. ');

  // Patterns
  const keywords =
    /\b(const|let|var|function|return|if|else|for|while|class|export|import|from|async|await|try|catch|new|this|typeof|interface|type|enum)\b/g;
  const strings = /(["'`])((?:\\.|(?!\1).)*?)\1/g;
  const comments = /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm;
  const numbers = /\b(\d+\.?\d*)\b/g;

  const tokens: Array<{ start: number; end: number; color: [number, number, number] }> = [];
  let match: RegExpExecArray | null;

  // Find all tokens
  comments.lastIndex = 0;
  while ((match = comments.exec(code)) !== null) {
    tokens.push({ start: match.index, end: match.index + match[0].length, color: COLORS.comment });
  }

  strings.lastIndex = 0;
  while ((match = strings.exec(code)) !== null) {
    tokens.push({ start: match.index, end: match.index + match[0].length, color: COLORS.string });
  }

  keywords.lastIndex = 0;
  while ((match = keywords.exec(code)) !== null) {
    const insideOther = tokens.some(t => match!.index >= t.start && match!.index < t.end);
    if (!insideOther) {
      tokens.push({
        start: match.index,
        end: match.index + match[0].length,
        color: COLORS.keyword,
      });
    }
  }

  numbers.lastIndex = 0;
  while ((match = numbers.exec(code)) !== null) {
    const insideOther = tokens.some(t => match!.index >= t.start && match!.index < t.end);
    if (!insideOther) {
      tokens.push({ start: match.index, end: match.index + match[0].length, color: COLORS.number });
    }
  }

  // Sort tokens by start position
  tokens.sort((a, b) => a.start - b.start);

  // Build segments
  let lastIndex = 0;
  for (const token of tokens) {
    if (token.start > lastIndex) {
      segments.push({ text: code.substring(lastIndex, token.start), color: COLORS.defaultCode });
    }
    segments.push({ text: code.substring(token.start, token.end), color: token.color });
    lastIndex = token.end;
  }

  if (lastIndex < code.length) {
    segments.push({ text: code.substring(lastIndex), color: COLORS.defaultCode });
  }

  return segments.length > 0 ? segments : [{ text: code, color: COLORS.defaultCode }];
}

/**
 * Parse inline markdown to text segments with formatting
 * Matches legacy version functionality exactly
 */
function parseInlineMarkdown(text: string): TextSegment[] {
  // Replace rupee symbol with "Rs." for reliable rendering
  text = text.replace(/₹/g, 'Rs. ');

  const segments: TextSegment[] = [];
  let currentPos = 0;

  // Pattern to match: **bold**, *italic*, `code`, ~~strikethrough~~, [link](url), ![image](url), [[note:id|title]], #tag
  const pattern =
    /(\*\*([^*]+?)\*\*|\*([^*\s][^*]*?[^*\s])\*|\*([^*\s])\*|`([^`]+?)`|~~([^~]+?)~~|!\[([^\]]*?)\]\(([^)]+?)\)|\[\[note:([^\]|]+?)\|([^\]]+?)\]\]|\[([^\]]+?)\]\(([^)]+?)\)|(#[\w_]+))/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    // Add any text before this match as plain text
    if (match.index > currentPos) {
      const plainText = text.substring(currentPos, match.index);
      if (plainText) {
        segments.push({
          text: plainText,
          bold: false,
          italic: false,
          code: false,
          strikethrough: false,
        });
      }
    }

    // Determine what type of formatting this is
    if (match[2]) {
      // **bold**
      segments.push({
        text: match[2],
        bold: true,
        italic: false,
        code: false,
        strikethrough: false,
      });
    } else if (match[3]) {
      // *italic* (multi-character)
      segments.push({
        text: match[3],
        bold: false,
        italic: true,
        code: false,
        strikethrough: false,
      });
    } else if (match[4]) {
      // *italic* (single character)
      segments.push({
        text: match[4],
        bold: false,
        italic: true,
        code: false,
        strikethrough: false,
      });
    } else if (match[5]) {
      // `code`
      segments.push({
        text: match[5],
        bold: false,
        italic: false,
        code: true,
        strikethrough: false,
      });
    } else if (match[6]) {
      // ~~strikethrough~~
      segments.push({
        text: match[6],
        bold: false,
        italic: false,
        code: false,
        strikethrough: true,
      });
    } else if (match[7] !== undefined && match[8]) {
      // ![alt](url) - image
      segments.push({
        text: `[Image: ${match[7] || 'image'}]`,
        bold: false,
        italic: true,
        code: false,
        strikethrough: false,
        isImage: true,
      });
    } else if (match[9] && match[10]) {
      // [[note:id|title]] - note reference
      segments.push({
        text: ` Note referred: ${match[10]} `,
        bold: false,
        italic: false,
        code: false,
        strikethrough: false,
        noteRef: { id: match[9], title: match[10] },
      });
    } else if (match[11] && match[12]) {
      // [text](url) - link
      segments.push({
        text: match[11].trim(),
        bold: false,
        italic: false,
        code: false,
        strikethrough: false,
        link: match[12],
      });
    } else if (match[13]) {
      // #tag - tag
      segments.push({
        text: match[13],
        bold: false,
        italic: false,
        code: false,
        strikethrough: false,
        isTag: true,
      });
    }

    currentPos = match.index + match[0].length;
  }

  // Add any remaining text
  if (currentPos < text.length) {
    const remainingText = text.substring(currentPos);
    if (remainingText) {
      segments.push({
        text: remainingText,
        bold: false,
        italic: false,
        code: false,
        strikethrough: false,
      });
    }
  }

  // If no segments, return the entire text as plain
  if (segments.length === 0) {
    segments.push({
      text: text,
      bold: false,
      italic: false,
      code: false,
      strikethrough: false,
    });
  }

  // Process segments to detect bare URLs in plain text
  const urlPattern = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/gi;
  const processedSegments: TextSegment[] = [];

  for (const segment of segments) {
    // Only process plain text segments (not already formatted)
    if (
      !segment.bold &&
      !segment.italic &&
      !segment.code &&
      !segment.strikethrough &&
      !segment.link &&
      !segment.isImage &&
      !segment.isTag &&
      !segment.noteRef
    ) {
      const text = segment.text;
      let lastIndex = 0;
      let urlMatch: RegExpExecArray | null;

      urlPattern.lastIndex = 0;
      let foundUrl = false;

      while ((urlMatch = urlPattern.exec(text)) !== null) {
        foundUrl = true;
        // Add text before the URL
        if (urlMatch.index > lastIndex) {
          processedSegments.push({
            text: text.substring(lastIndex, urlMatch.index),
            bold: false,
            italic: false,
            code: false,
            strikethrough: false,
          });
        }

        // Add the URL as a link
        const url = urlMatch[1];
        processedSegments.push({
          text: url,
          bold: false,
          italic: false,
          code: false,
          strikethrough: false,
          link: url,
        });

        lastIndex = urlMatch.index + urlMatch[0].length;
      }

      // If no URLs found, add the entire segment as-is
      if (!foundUrl) {
        processedSegments.push(segment);
      } else {
        // Add remaining text after last URL
        if (lastIndex < text.length) {
          processedSegments.push({
            text: text.substring(lastIndex),
            bold: false,
            italic: false,
            code: false,
            strikethrough: false,
          });
        }
      }
    } else {
      // Keep formatted segments as-is
      processedSegments.push(segment);
    }
  }

  return processedSegments;
}

/**
 * Preprocess content to merge URLs on separate lines into surrounding text
 */
function preprocessContent(text: string): string {
  if (!text) return text;

  let result = text;

  // Replace: text + newline(s) + URL with: text + space + URL
  result = result.replace(/([^\n])\n+(?=https?:\/\/)/g, '$1 ');

  // Replace: URL + newline(s) + text with: URL + space + text
  result = result.replace(/(https?:\/\/[^\s]+)\n+([^\n])/g, '$1 $2');

  // Handle URL-only lines
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
}

/**
 * Load image from URL for embedding in PDF
 */
async function loadImageFromUrl(url: string): Promise<string | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      // Convert image to data URL for react-pdf
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        try {
          const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
          resolve(dataUrl);
        } catch (e) {
          resolve(null);
        }
      } else {
        resolve(null);
      }
    };

    img.onerror = () => resolve(null);

    // Set timeout to avoid hanging
    setTimeout(() => resolve(null), 5000);

    img.src = url;
  });
}

// ============================================================================
// React PDF Components
// ============================================================================

/**
 * Render text with emoji support
 * Splits text into emoji and non-emoji segments and applies appropriate styling
 */
function renderTextWithEmojis(text: string, baseStyle: any, key: number): React.ReactElement {
  const emojiSegments = splitEmojiSegments(text);

  return (
    <Text key={key} style={baseStyle}>
      {emojiSegments.map((emojiSeg, idx) => {
        if (emojiSeg.isEmoji) {
          // For emoji segments, use the emoji style (which uses system emoji font)
          return (
            <Text key={idx} style={[baseStyle, styles.emoji]}>
              {emojiSeg.text}
            </Text>
          );
        } else {
          // For non-emoji segments, use the base style
          return (
            <Text key={idx} style={baseStyle}>
              {emojiSeg.text}
            </Text>
          );
        }
      })}
    </Text>
  );
}

/**
 * Render inline content (text with formatting)
 * Enhanced to match legacy styling exactly with emoji support
 */
function renderInlineContent(node: PhrasingContent, key: number = 0): React.ReactElement {
  if (node.type === 'text') {
    const textNode = node as MdastText;
    const segments = parseInlineMarkdown(textNode.value);

    return (
      <Text key={key}>
        {segments.map((segment, idx) => {
          if (segment.isTag) {
            return renderTextWithEmojis(segment.text, styles.tag, idx);
          } else if (segment.noteRef) {
            return renderTextWithEmojis(segment.text, styles.noteRef, idx);
          } else if (segment.link) {
            const emojiSegments = splitEmojiSegments(segment.text);
            return (
              <Link key={idx} src={segment.link} style={styles.link}>
                {emojiSegments.map((emojiSeg, emojiIdx) => (
                  <Text
                    key={emojiIdx}
                    style={emojiSeg.isEmoji ? [styles.link, styles.emoji] : styles.link}
                  >
                    {emojiSeg.text}
                  </Text>
                ))}
              </Link>
            );
          } else if (segment.isImage) {
            return (
              <Text key={idx} style={styles.imagePlaceholder}>
                {segment.text}
              </Text>
            );
          } else if (segment.code) {
            // Don't split emojis in code - keep as-is
            return (
              <Text key={idx} style={styles.inlineCode}>
                {segment.text}
              </Text>
            );
          } else if (segment.strikethrough) {
            return renderTextWithEmojis(segment.text, styles.strikethrough, idx);
          } else {
            const style: any = {};
            if (segment.bold) style.fontWeight = 'bold';
            if (segment.italic) style.fontStyle = 'italic';
            return renderTextWithEmojis(segment.text, style, idx);
          }
        })}
      </Text>
    );
  }

  if (node.type === 'strong') {
    const strongNode = node as Strong;
    return (
      <Text key={key} style={{ fontWeight: 'bold' }}>
        {strongNode.children.map((child, idx) => renderInlineContent(child, idx))}
      </Text>
    );
  }

  if (node.type === 'emphasis') {
    const emphasisNode = node as Emphasis;
    return (
      <Text key={key} style={{ fontStyle: 'italic' }}>
        {emphasisNode.children.map((child, idx) => renderInlineContent(child, idx))}
      </Text>
    );
  }

  if (node.type === 'delete') {
    const deleteNode = node as Delete;
    return (
      <Text key={key} style={styles.strikethrough}>
        {deleteNode.children.map((child, idx) => renderInlineContent(child, idx))}
      </Text>
    );
  }

  if (node.type === 'inlineCode') {
    const codeNode = node as InlineCode;
    return (
      <Text key={key} style={styles.inlineCode}>
        {codeNode.value}
      </Text>
    );
  }

  if (node.type === 'link') {
    const linkNode = node as MdastLink;
    return (
      <Link key={key} src={linkNode.url} style={styles.link}>
        {linkNode.children.map((child, idx) => renderInlineContent(child, idx))}
      </Link>
    );
  }

  if (node.type === 'image') {
    const imageNode = node as MdastImage;
    return (
      <Text key={key} style={styles.imagePlaceholder}>
        [Image: {imageNode.alt || 'image'}]
      </Text>
    );
  }

  // Fallback for unknown types
  return <Text key={key} />;
}

/**
 * Code block component with syntax highlighting
 */
function CodeBlock({ code, key }: { code: string; key: number }) {
  const segments = applySyntaxHighlighting(code);

  return (
    <View key={key} style={styles.codeBlock}>
      {segments.map((segment, idx) => (
        <Text
          key={idx}
          style={{ fontFamily: 'Courier', fontSize: 9, color: rgbToHex(segment.color) }}
        >
          {segment.text}
        </Text>
      ))}
    </View>
  );
}

/**
 * Task list item component with checkbox
 */
function TaskListItem({ item, idx }: { item: ListItem; idx: number }) {
  const isChecked = item.checked === true;

  return (
    <View key={idx} style={styles.listItem}>
      <View style={{ width: 10, marginRight: 6, marginTop: 2 }}>
        {/* Checkbox rendering - react-pdf doesn't support SVG, so we use a workaround */}
        {isChecked ? (
          <View
            style={{
              width: 3.5,
              height: 3.5,
              backgroundColor: rgbToHex(COLORS.checkboxChecked),
              borderRadius: 0.5,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Text style={{ color: 'white', fontSize: 8, fontWeight: 'bold' }}>✓</Text>
          </View>
        ) : (
          <View
            style={{
              width: 3.5,
              height: 3.5,
              borderWidth: 0.3,
              borderColor: rgbToHex(COLORS.checkboxBorder),
              borderRadius: 0.5,
            }}
          />
        )}
      </View>
      <View style={{ flex: 1 }}>
        {item.children.map((child, childIdx) => renderNode(child, childIdx))}
      </View>
    </View>
  );
}

/**
 * Extract text content from table cell node
 */
function extractCellText(node: any): string {
  if (node.type === 'text') return node.value;
  if (node.type === 'paragraph') {
    return node.children.map(extractCellText).join('');
  }
  if (node.children) {
    return node.children.map(extractCellText).join('');
  }
  return '';
}

/**
 * Enhanced table component with markdown formatting support
 */
function EnhancedTable({ table, key }: { table: Table; key: number }) {
  const rows = table.children;
  // Skip separator row (second row if it's all dashes/colons)
  const filteredRows = rows.filter((row, idx) => {
    if (idx === 1) {
      const rowText = row.children
        .map((cell: TableCell) => {
          const cellText = extractCellText(cell);
          return cellText.trim();
        })
        .join('');
      // If it's all dashes/colons/spaces, it's a separator row
      return !/^[\s:|-]+$/.test(rowText);
    }
    return true;
  });

  const isHeaderRow = (rowIdx: number) => rowIdx === 0 && filteredRows.length > 1;

  return (
    <View key={key} style={styles.table}>
      {filteredRows.map((row, rowIdx) => {
        const tableRow = row as TableRow;
        const isHeader = isHeaderRow(rowIdx);

        return (
          <View
            key={rowIdx}
            style={isHeader ? [styles.tableRow, styles.tableHeader] : styles.tableRow}
          >
            {tableRow.children.map((cell, cellIdx) => {
              const tableCell = cell as TableCell;

              // Extract text from cell for preprocessing
              let cellText = tableCell.children.map(extractCellText).join('');

              // Handle <br> tags
              cellText = cellText
                .replace(/&lt;br\s*\/?&gt;/gi, '\n')
                .replace(/&lt;br&gt;/gi, '\n')
                .replace(/<br\s*\/?>/gi, '\n');

              // Replace rupee symbol
              cellText = cellText.replace(/₹/g, 'Rs. ');

              // Preprocess price ranges
              cellText = cellText.replace(/(Rs\.\s*[\d,]+)\s*-\s*(Rs\.\s*[\d,]+)/g, '$1 - $2');

              return (
                <View key={cellIdx} style={styles.tableCell}>
                  <Text style={isHeader ? { fontWeight: 'bold' } : undefined}>
                    {tableCell.children.map((child: any, childIdx: number) => {
                      // Table cells can contain paragraphs or phrasing content
                      if (child.type === 'paragraph') {
                        const para = child as Paragraph;
                        return para.children.map((inline, inlineIdx) =>
                          renderInlineContent(inline, inlineIdx)
                        );
                      }
                      // Direct phrasing content
                      return renderInlineContent(child as PhrasingContent, childIdx);
                    })}
                  </Text>
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

/**
 * Image component that renders preloaded images
 */
function ImageComponent({
  imageNode,
  imageSrc,
  key,
}: {
  imageNode: MdastImage;
  imageSrc: string | null;
  key: number;
}) {
  if (!imageSrc) {
    return (
      <Text key={key} style={styles.imagePlaceholder}>
        [Image: {imageNode.alt || 'image'}]
      </Text>
    );
  }

  // Calculate dimensions to fit within page width
  const maxWidth = PDF_CONFIG.pageWidth - PDF_CONFIG.marginLeft - PDF_CONFIG.marginRight - 80; // Account for padding
  const maxHeight = 150; // Max height in mm

  return (
    <View key={key} style={{ marginBottom: 10, alignItems: 'center' }}>
      <PDFImage
        src={imageSrc}
        style={{
          maxWidth: `${maxWidth}mm`,
          maxHeight: `${maxHeight}mm`,
          objectFit: 'contain',
        }}
      />
    </View>
  );
}

/**
 * Render a markdown node to PDF components
 * Enhanced to support all markdown elements with legacy styling
 */
function renderNode(
  node: Content | Root,
  key: number = 0,
  imageMap?: Map<string, string | null>
): React.ReactElement | null {
  if (node.type === 'heading') {
    const heading = node as Heading;
    const level = heading.depth;
    const headingStyle =
      level === 1
        ? styles.heading1
        : level === 2
          ? styles.heading2
          : level === 3
            ? styles.heading3
            : styles.heading4;

    return (
      <View key={key} style={headingStyle}>
        <Text style={headingStyle}>
          {heading.children.map((child, idx) => renderInlineContent(child, idx))}
        </Text>
      </View>
    );
  }

  if (node.type === 'paragraph') {
    const paragraph = node as Paragraph;
    return (
      <View key={key} style={styles.paragraph}>
        <Text>{paragraph.children.map((child, idx) => renderInlineContent(child, idx))}</Text>
      </View>
    );
  }

  if (node.type === 'list') {
    const list = node as List;
    const hasTaskItems = list.children.some(
      item => (item as ListItem).checked !== null && (item as ListItem).checked !== undefined
    );

    if (hasTaskItems) {
      // Task list
      return (
        <View key={key} style={styles.list}>
          {list.children.map((item, idx) => (
            <TaskListItem key={idx} item={item as ListItem} idx={idx} />
          ))}
        </View>
      );
    } else {
      // Regular list
      return (
        <View key={key} style={styles.list}>
          {list.children.map((item, idx) => {
            const listItem = item as ListItem;
            const marker = list.ordered ? `${idx + 1}.` : '•';

            return (
              <View key={idx} style={styles.listItem}>
                <Text style={styles.bullet}>{marker}</Text>
                <View style={{ flex: 1 }}>
                  {listItem.children.map((child, childIdx) =>
                    renderNode(child, childIdx, imageMap)
                  )}
                </View>
              </View>
            );
          })}
        </View>
      );
    }
  }

  if (node.type === 'code') {
    const code = node as Code;
    return <CodeBlock key={key} code={code.value} />;
  }

  if (node.type === 'blockquote') {
    const blockquote = node as Blockquote;
    return (
      <View key={key} style={styles.blockquote}>
        {blockquote.children.map((child, idx) => renderNode(child, idx, imageMap))}
      </View>
    );
  }

  if (node.type === 'thematicBreak') {
    return <View key={key} style={styles.horizontalRule} />;
  }

  if (node.type === 'table') {
    const table = node as Table;
    return <EnhancedTable key={key} table={table} />;
  }

  if (node.type === 'image') {
    const imageNode = node as MdastImage;
    const imageSrc = imageMap?.get(imageNode.url || '') || null;
    return <ImageComponent key={key} imageNode={imageNode} imageSrc={imageSrc} />;
  }

  return null;
}

/**
 * Extract all image URLs from markdown tree
 */
function extractImageUrls(node: Content | Root, urls: Set<string>): void {
  if (node.type === 'image') {
    const imageNode = node as MdastImage;
    if (imageNode.url) {
      urls.add(imageNode.url);
    }
  }

  if ('children' in node && node.children) {
    for (const child of node.children) {
      extractImageUrls(child as Content, urls);
    }
  }
}

/**
 * Create PDF document component
 */
function PDFDocument({
  title,
  content,
  imageMap,
}: {
  title: string;
  content: string;
  imageMap?: Map<string, string | null>;
}) {
  // Preprocess content
  const preprocessedContent = preprocessContent(content);

  // Parse markdown
  const processor = unified().use(remarkParse).use(remarkGfm);

  const tree = processor.parse(preprocessedContent) as Root;

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View>
          <Text style={styles.title}>{title || 'Untitled'}</Text>
          <View style={styles.titleDivider} />
          {tree.children.map((node, idx) => renderNode(node, idx, imageMap))}
        </View>
      </Page>
    </Document>
  );
}

/**
 * Exports a document (title + markdown content) to PDF
 */
export async function exportToPDF(
  title: string,
  content: string,
  filename?: string
): Promise<void> {
  try {
    // Preprocess content to extract image URLs
    const preprocessedContent = preprocessContent(content);
    const processor = unified().use(remarkParse).use(remarkGfm);
    const tree = processor.parse(preprocessedContent) as Root;

    // Extract all image URLs
    const imageUrls = new Set<string>();
    extractImageUrls(tree, imageUrls);

    // Preload all images
    const imageMap = new Map<string, string | null>();
    await Promise.all(
      Array.from(imageUrls).map(async url => {
        const dataUrl = await loadImageFromUrl(url);
        imageMap.set(url, dataUrl);
      })
    );

    // Create document with preloaded images
    const doc = <PDFDocument title={title} content={content} imageMap={imageMap} />;
    const blob = await pdf(doc).toBlob();

    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const sanitizedName = filename || title.replace(/[^a-z0-9]/gi, '_') || 'Untitled';
    link.download = `${sanitizedName}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
}
