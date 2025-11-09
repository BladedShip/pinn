import jsPDF from 'jspdf';

interface PDFStyleConfig {
  pageWidth: number;
  pageHeight: number;
  marginLeft: number;
  marginRight: number;
  marginTop: number;
  marginBottom: number;
  lineHeight: number;
}

interface TextSegment {
  text: string;
  bold: boolean;
  italic: boolean;
  code: boolean;
  strikethrough: boolean;
  link?: string;
  isImage?: boolean;
}

/**
 * Apply basic syntax highlighting to code
 */
function applyBasicSyntaxHighlighting(code: string): Array<{ text: string; color: [number, number, number] }> {
  const segments: Array<{ text: string; color: [number, number, number] }> = [];
  
  // Keywords (purple)
  const keywords = /\b(const|let|var|function|return|if|else|for|while|class|export|import|from|async|await|try|catch|new|this|typeof|interface|type|enum)\b/g;
  // Strings (green)
  const strings = /(["'`])((?:\\.|(?!\1).)*?)\1/g;
  // Comments (gray)
  const comments = /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm;
  // Numbers (orange)
  const numbers = /\b(\d+\.?\d*)\b/g;
  
  let lastIndex = 0;
  const tokens: Array<{ start: number; end: number; color: [number, number, number] }> = [];
  
  // Find all tokens
  let match: RegExpExecArray | null;
  
  // Comments
  comments.lastIndex = 0;
  while ((match = comments.exec(code)) !== null) {
    tokens.push({ start: match.index, end: match.index + match[0].length, color: [108, 117, 125] });
  }
  
  // Strings
  strings.lastIndex = 0;
  while ((match = strings.exec(code)) !== null) {
    tokens.push({ start: match.index, end: match.index + match[0].length, color: [34, 139, 34] });
  }
  
  // Keywords
  keywords.lastIndex = 0;
  while ((match = keywords.exec(code)) !== null) {
    // Don't highlight if inside string or comment
    const insideOther = tokens.some(t => match!.index >= t.start && match!.index < t.end);
    if (!insideOther) {
      tokens.push({ start: match.index, end: match.index + match[0].length, color: [147, 51, 234] });
    }
  }
  
  // Numbers
  numbers.lastIndex = 0;
  while ((match = numbers.exec(code)) !== null) {
    const insideOther = tokens.some(t => match!.index >= t.start && match!.index < t.end);
    if (!insideOther) {
      tokens.push({ start: match.index, end: match.index + match[0].length, color: [255, 140, 0] });
    }
  }
  
  // Sort tokens by start position
  tokens.sort((a, b) => a.start - b.start);
  
  // Build segments
  lastIndex = 0;
  for (const token of tokens) {
    // Add plain text before token
    if (token.start > lastIndex) {
      segments.push({ text: code.substring(lastIndex, token.start), color: [55, 65, 81] });
    }
    // Add highlighted token
    segments.push({ text: code.substring(token.start, token.end), color: token.color });
    lastIndex = token.end;
  }
  
  // Add remaining text
  if (lastIndex < code.length) {
    segments.push({ text: code.substring(lastIndex), color: [55, 65, 81] });
  }
  
  // If no segments, return entire line as default color
  if (segments.length === 0) {
    segments.push({ text: code, color: [55, 65, 81] });
  }
  
  return segments;
}

/**
 * Parse inline markdown to text segments with formatting
 * Now includes links, images, and note references
 */
function parseInlineMarkdown(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let currentPos = 0;
  
  // Pattern to match: **bold**, *italic*, `code`, ~~strikethrough~~, [link](url), ![image](url), [[note:id|title]]
  const pattern = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|~~([^~]+)~~|!\[([^\]]*)\]\(([^)]+)\)|\[\[note:([^\]|]+)\|([^\]]+)\]\]|\[([^\]]+)\]\(([^)]+)\))/g;
  
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
    if (match[6] && match[7]) {
      // ![alt](url) - image
      segments.push({
        text: `[Image: ${match[6] || 'image'}]`,
        bold: false,
        italic: true,
        code: false,
        strikethrough: false,
        isImage: true,
      });
    } else if (match[8] && match[9]) {
      // [[note:id|title]] - note reference
      // Render as "Note referred: noteTitle " in monospace font with accent color
      segments.push({
        text: ` Note referred: ${match[9]} `,
        bold: false,
        italic: false,
        code: false, // Don't use code styling
        strikethrough: false,
        link: `note:${match[8]}`, // Store note ID in link field for special rendering
      });
    } else if (match[10] && match[11]) {
      // [text](url) - link - show just the link text (no URL in parentheses)
      segments.push({
        text: match[10].trim(), // Trim any extra spaces
        bold: false,
        italic: false,
        code: false,
        strikethrough: false,
        link: match[11],
      });
    } else if (match[2]) {
      // **bold**
      segments.push({
        text: match[2],
        bold: true,
        italic: false,
        code: false,
        strikethrough: false,
      });
    } else if (match[3]) {
      // *italic*
      segments.push({
        text: match[3],
        bold: false,
        italic: true,
        code: false,
        strikethrough: false,
      });
    } else if (match[4]) {
      // `code`
      segments.push({
        text: match[4],
        bold: false,
        italic: false,
        code: true,
        strikethrough: false,
      });
    } else if (match[5]) {
      // ~~strikethrough~~
      segments.push({
        text: match[5],
        bold: false,
        italic: false,
        code: false,
        strikethrough: true,
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
    if (!segment.bold && !segment.italic && !segment.code && !segment.strikethrough && !segment.link && !segment.isImage) {
      const text = segment.text;
      let lastIndex = 0;
      let urlMatch: RegExpExecArray | null;
      
      // Reset regex lastIndex
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
 * Load image from URL for embedding in PDF
 */
async function loadImageFromUrl(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    
    // Set timeout to avoid hanging
    setTimeout(() => resolve(null), 5000);
    
    img.src = url;
  });
}

/**
 * Exports a document (title + markdown content) to PDF with proper text rendering
 */
export async function exportToPDF(title: string, content: string, filename?: string): Promise<void> {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const config: PDFStyleConfig = {
    pageWidth: 210,
    pageHeight: 297,
    marginLeft: 20,
    marginRight: 20,
    marginTop: 20,
    marginBottom: 20,
    lineHeight: 1.5,
  };

  const contentWidth = config.pageWidth - config.marginLeft - config.marginRight;
  let currentY = config.marginTop;

  // Helper function to check if we need a new page
  const checkPageBreak = (requiredSpace: number): void => {
    if (currentY + requiredSpace > config.pageHeight - config.marginBottom) {
      pdf.addPage();
      currentY = config.marginTop;
    }
  };

  // Helper function to add text with word wrapping
  const addText = (
    text: string,
    fontSize: number,
    fontStyle: 'normal' | 'bold' | 'italic' = 'normal',
    color: [number, number, number] = [0, 0, 0],
    extraSpaceBefore: number = 0,
    extraSpaceAfter: number = 0
  ): void => {
    currentY += extraSpaceBefore;
    
    pdf.setFontSize(fontSize);
    if (fontStyle === 'bold') {
      pdf.setFont('helvetica', 'bold');
    } else if (fontStyle === 'italic') {
      pdf.setFont('helvetica', 'italic');
    } else {
      pdf.setFont('helvetica', 'normal');
    }
    pdf.setTextColor(color[0], color[1], color[2]);

    const lineHeightMM = fontSize * 0.35277778 * config.lineHeight;
    const lines = pdf.splitTextToSize(text, contentWidth);

    for (let i = 0; i < lines.length; i++) {
      checkPageBreak(lineHeightMM);
      pdf.text(lines[i], config.marginLeft, currentY);
      currentY += lineHeightMM;
    }

    currentY += extraSpaceAfter;
  };

  // Helper function to render text with inline markdown formatting
  const addFormattedText = (
    text: string,
    fontSize: number,
    extraSpaceBefore: number = 0,
    extraSpaceAfter: number = 0
  ): void => {
    currentY += extraSpaceBefore;
    
    const segments = parseInlineMarkdown(text);
    const lineHeightMM = fontSize * 0.35277778 * config.lineHeight;
    
    let currentX = config.marginLeft;
    let lineSegments: TextSegment[] = [];
    let currentLineWidth = 0;
    
    pdf.setFontSize(fontSize);
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      
      // Set font for width measurement
      if (segment.code) {
        pdf.setFont('courier', 'normal');
      } else if (segment.bold && segment.italic) {
        pdf.setFont('helvetica', 'bolditalic');
      } else if (segment.bold) {
        pdf.setFont('helvetica', 'bold');
      } else if (segment.italic) {
        pdf.setFont('helvetica', 'italic');
      } else {
        pdf.setFont('helvetica', 'normal');
      }
      
      // Split segment into words for wrapping
      const words = segment.text.split(' ');
      
      for (let w = 0; w < words.length; w++) {
        const word = words[w] + (w < words.length - 1 ? ' ' : '');
        const wordWidth = pdf.getTextWidth(word);
        
        // Check if word fits on current line
        if (currentLineWidth + wordWidth > contentWidth && lineSegments.length > 0) {
          // Render current line
          checkPageBreak(lineHeightMM);
          renderLineSegments(lineSegments, currentX, currentY, fontSize);
          currentY += lineHeightMM;
          
          // Start new line
          lineSegments = [];
          currentLineWidth = 0;
          currentX = config.marginLeft;
        }
        
        // If single word is too long, break it into multiple segments
        if (wordWidth > contentWidth) {
          let remainingWord = word;
          while (remainingWord.length > 0) {
            let fitText = remainingWord;
            let fitWidth = pdf.getTextWidth(fitText);
            
            // Find the maximum length that fits
            while (fitWidth > contentWidth - currentLineWidth && fitText.length > 1) {
              fitText = fitText.substring(0, fitText.length - 1);
              fitWidth = pdf.getTextWidth(fitText);
            }
            
            lineSegments.push({
              text: fitText,
              bold: segment.bold,
              italic: segment.italic,
              code: segment.code,
              strikethrough: segment.strikethrough,
              link: segment.link, // Preserve link property
            });
            currentLineWidth += fitWidth;
            
            remainingWord = remainingWord.substring(fitText.length);
            
            if (remainingWord.length > 0) {
              // Move to next line
              checkPageBreak(lineHeightMM);
              renderLineSegments(lineSegments, currentX, currentY, fontSize);
              currentY += lineHeightMM;
              lineSegments = [];
              currentLineWidth = 0;
              currentX = config.marginLeft;
            }
          }
        } else {
          // Add word to current line
          lineSegments.push({
            text: word,
            bold: segment.bold,
            italic: segment.italic,
            code: segment.code,
            strikethrough: segment.strikethrough,
            link: segment.link, // Preserve link property
          });
          currentLineWidth += wordWidth;
        }
      }
    }
    
    // Render remaining segments
    if (lineSegments.length > 0) {
      checkPageBreak(lineHeightMM);
      renderLineSegments(lineSegments, config.marginLeft, currentY, fontSize);
      currentY += lineHeightMM;
    }
    
    currentY += extraSpaceAfter;
  };

  // Helper function to render a line of segments
  const renderLineSegments = (segments: TextSegment[], startX: number, y: number, fontSize: number): void => {
    let x = startX;
    
    for (const segment of segments) {
      // Set font style
      if (segment.code) {
        pdf.setFont('courier', 'normal');
        pdf.setFontSize(fontSize * 0.9);
        pdf.setTextColor(60, 60, 60);
        
        // Draw background for inline code
        const width = pdf.getTextWidth(segment.text);
        pdf.setFillColor(240, 240, 240);
        pdf.rect(x - 0.5, y - fontSize * 0.25, width + 1, fontSize * 0.35, 'F');
      } else if (segment.isImage) {
        // Images shown as gray italic text
        pdf.setFontSize(fontSize * 0.9);
        pdf.setTextColor(100, 100, 100);
        pdf.setFont('helvetica', 'italic');
      } else {
        pdf.setFontSize(fontSize);
        pdf.setTextColor(40, 40, 40); // Dark gray instead of pure black
        
        if (segment.bold && segment.italic) {
          pdf.setFont('helvetica', 'bolditalic');
        } else if (segment.bold) {
          pdf.setFont('helvetica', 'bold');
        } else if (segment.italic) {
          pdf.setFont('helvetica', 'italic');
        } else {
          pdf.setFont('helvetica', 'normal');
        }
      }
      
      // Render text
      let width: number;
      
      // Special handling for note references - use monospace and accent color
      if (segment.link && segment.link.startsWith('note:')) {
        // Note reference: use monospace font and accent color
        pdf.setFont('courier', 'normal');
        pdf.setTextColor(232, 147, 95); // Accent color
        pdf.setFontSize(fontSize * 0.95); // Slightly smaller for monospace
        
        width = pdf.getTextWidth(segment.text);
        pdf.text(segment.text, x, y);
        
        // Add strikethrough if needed
        if (segment.strikethrough) {
          pdf.setDrawColor(0, 0, 0);
          pdf.setLineWidth(0.2);
          pdf.line(x, y - fontSize * 0.15, x + width, y - fontSize * 0.15);
        }
        
        x += width;
      } else {
        // Regular rendering for non-note-reference segments
        width = pdf.getTextWidth(segment.text);
        
        // Render text (links show URL in parentheses)
        if (segment.link) {
          // Regular link
          pdf.setTextColor(80, 120, 160); // Muted blue-gray for regular links
          
          if (segment.bold && segment.italic) {
            pdf.setFont('helvetica', 'bolditalic');
          } else if (segment.bold) {
            pdf.setFont('helvetica', 'bold');
          } else if (segment.italic) {
            pdf.setFont('helvetica', 'italic');
          } else {
            pdf.setFont('helvetica', 'normal');
          }
          
          // Render text
          pdf.text(segment.text, x, y);
          
          // Add clickable area and underline
          const textHeight = fontSize * 0.35277778;
          pdf.link(x, y - textHeight, width, textHeight, { url: segment.link });
          
          // Add subtle underline
          pdf.setDrawColor(80, 120, 160); // Muted blue-gray to match link color
          pdf.setLineWidth(0.3); // Thinner underline for subtlety
          const underlineY = y + 1.5; // Position underline below baseline
          pdf.line(x, underlineY, x + width, underlineY);
        } else {
          pdf.text(segment.text, x, y);
        }
        
        // Add strikethrough if needed
        if (segment.strikethrough) {
          pdf.setDrawColor(0, 0, 0);
          pdf.setLineWidth(0.2);
          pdf.line(x, y - fontSize * 0.15, x + width, y - fontSize * 0.15);
        }
        
        x += width;
      }
    }
  };

  // Helper function to render quote segments (similar but with gray text)
  const renderQuoteLineSegments = (segments: TextSegment[], startX: number, y: number, fontSize: number): void => {
    let x = startX;
    
    for (const segment of segments) {
      // Set font style - quotes are gray and italic by default
      if (segment.code) {
        pdf.setFont('courier', 'normal');
        pdf.setFontSize(fontSize * 0.9);
        pdf.setTextColor(110, 110, 110);
        
        // Draw background for inline code
        const width = pdf.getTextWidth(segment.text);
        pdf.setFillColor(240, 240, 240);
        pdf.rect(x - 0.5, y - fontSize * 0.25, width + 1, fontSize * 0.35, 'F');
      } else {
        pdf.setFontSize(fontSize);
        
        // Handle links in quotes - check if it's a note reference or regular link
        if (segment.link) {
          const isNoteReference = segment.link.startsWith('note:');
          if (isNoteReference) {
            pdf.setFont('courier', 'normal'); // Monospace for note references
            pdf.setTextColor(232, 147, 95); // Accent color for note references
          } else {
            pdf.setTextColor(80, 120, 160); // Muted blue-gray for regular links
            
            if (segment.bold && segment.italic) {
              pdf.setFont('helvetica', 'bolditalic');
            } else if (segment.bold) {
              pdf.setFont('helvetica', 'bold');
            } else if (segment.italic) {
              pdf.setFont('helvetica', 'italic'); // Just italic for link in quote
            } else {
              pdf.setFont('helvetica', 'normal'); // Links not bold by default
            }
          }
        } else {
          pdf.setTextColor(110, 110, 110); // Lighter gray for quote text
          
          if (segment.bold && segment.italic) {
            pdf.setFont('helvetica', 'bolditalic');
          } else if (segment.bold) {
            pdf.setFont('helvetica', 'bold');
          } else {
            pdf.setFont('helvetica', 'italic'); // Quotes are italic
          }
        }
      }
      
      // Render text
      let width: number;
      
      // Special handling for note references - use monospace and accent color (even in quotes)
      if (segment.link && segment.link.startsWith('note:')) {
        // Note reference: use monospace font and accent color
        pdf.setFont('courier', 'normal');
        pdf.setTextColor(232, 147, 95); // Accent color
        pdf.setFontSize(fontSize * 0.95); // Slightly smaller for monospace
        
        width = pdf.getTextWidth(segment.text);
        pdf.text(segment.text, x, y);
        
        // Add strikethrough if needed
        if (segment.strikethrough) {
          pdf.setDrawColor(80, 80, 80);
          pdf.setLineWidth(0.2);
          pdf.line(x, y - fontSize * 0.15, x + width, y - fontSize * 0.15);
        }
        
        x += width;
      } else {
        // Regular rendering for non-note-reference segments
        width = pdf.getTextWidth(segment.text);
        
        // Render text (links show URL in parentheses)
        if (segment.link) {
          // Regular link
          pdf.text(segment.text, x, y);
          
          // Add clickable link area on top
          const textHeight = fontSize * 0.35277778;
          pdf.link(x, y - textHeight, width, textHeight, { url: segment.link });
          
          // Add subtle underline
          pdf.setDrawColor(80, 120, 160); // Muted blue-gray to match link color
          pdf.setLineWidth(0.3); // Thinner underline for subtlety
          const underlineY = y + 1.5; // Position underline below baseline
          pdf.line(x, underlineY, x + width, underlineY);
        } else {
          pdf.text(segment.text, x, y);
        }
        
        // Add strikethrough if needed
        if (segment.strikethrough) {
          pdf.setDrawColor(80, 80, 80);
          pdf.setLineWidth(0.2);
          pdf.line(x, y - fontSize * 0.15, x + width, y - fontSize * 0.15);
        }
        
        x += width;
      }
    }
  };

  // Add title
  addText(title || 'Untitled', 24, 'bold', [40, 40, 40], 0, 0);

  // Reduce space before the line
  currentY -= 6;

  // Add a subtle line under the title
  pdf.setDrawColor(230, 230, 230);
  pdf.setLineWidth(0.3);
  pdf.line(config.marginLeft, currentY, config.pageWidth - config.marginRight, currentY);
  currentY += 10; // Minimal space after line

  // Helper function to render images
  const renderImage = async (url: string, alt: string): Promise<void> => {
    try {
      const img = await loadImageFromUrl(url);
      if (img && img.complete && img.naturalWidth > 0) {
        checkPageBreak(80); // Check if we have space for image
        
        // Calculate dimensions to fit within page width
        const maxWidth = contentWidth - 10;
        const maxHeight = 150; // Max height in mm
        
        let imgWidth = img.naturalWidth * 0.264583; // Convert px to mm (96 DPI)
        let imgHeight = img.naturalHeight * 0.264583;
        
        // Scale down if needed
        if (imgWidth > maxWidth) {
          const scale = maxWidth / imgWidth;
          imgWidth = maxWidth;
          imgHeight *= scale;
        }
        
        if (imgHeight > maxHeight) {
          const scale = maxHeight / imgHeight;
          imgHeight = maxHeight;
          imgWidth *= scale;
        }
        
        // Center the image
        const imgX = config.marginLeft + (contentWidth - imgWidth) / 2;
        
        pdf.addImage(img, 'JPEG', imgX, currentY, imgWidth, imgHeight);
        currentY += imgHeight + 5;
      } else {
        // Fallback to text placeholder if image fails to load
        addFormattedText(`[Image: ${alt || 'image'}]`, 10, 2, 2);
      }
    } catch (error) {
      // Fallback to text placeholder on error
      addFormattedText(`[Image: ${alt || 'image'}]`, 10, 2, 2);
    }
  };

  // Preprocess content to merge URLs on separate lines into surrounding text
  // This prevents URLs from appearing on separate lines
  const preprocessContent = (text: string): string => {
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
  };

  // Parse and render markdown content
  const preprocessedContent = preprocessContent(content);
  const lines = preprocessedContent.split('\n');
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Handle code blocks
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        // End of code block - render it
        if (codeBlockContent.length > 0) {
          currentY += 3; // Space before code block
          
          const paddingTop = 4;
          const paddingBottom = 4;
          const paddingLeft = 4;
          const lineHeight = 5;
          const codeBlockHeight = codeBlockContent.length * lineHeight + paddingTop + paddingBottom;
          
          // Check if entire code block fits on current page
          if (currentY + codeBlockHeight > config.pageHeight - config.marginBottom) {
            // Move entire code block to next page
            pdf.addPage();
            currentY = config.marginTop;
          }
          
          // Simple clean background - no border
          pdf.setFillColor(248, 248, 248);
          pdf.rect(config.marginLeft, currentY, contentWidth, codeBlockHeight, 'F');
          
          currentY += paddingTop + 1;
          
          // Render code lines with syntax highlighting
          pdf.setFontSize(9);
          pdf.setFont('courier', 'normal');
          
          for (const codeLine of codeBlockContent) {
            // Apply syntax highlighting
            const highlightedSegments = applyBasicSyntaxHighlighting(codeLine);
            let xPos = config.marginLeft + paddingLeft;
            
            for (const seg of highlightedSegments) {
              pdf.setTextColor(seg.color[0], seg.color[1], seg.color[2]);
              pdf.text(seg.text, xPos, currentY);
              xPos += pdf.getTextWidth(seg.text);
            }
            
            currentY += lineHeight;
          }
          
          currentY += paddingBottom + 3;
          codeBlockContent = [];
        }
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeBlockContent = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Handle headings
    if (line.startsWith('# ')) {
      inList = false;
      addText(line.substring(2), 20, 'bold', [0, 0, 0], 6, 3);
      continue;
    } else if (line.startsWith('## ')) {
      inList = false;
      addText(line.substring(3), 16, 'bold', [20, 20, 20], 5, 2);
      continue;
    } else if (line.startsWith('### ')) {
      inList = false;
      addText(line.substring(4), 14, 'bold', [40, 40, 40], 4, 2);
      continue;
    } else if (line.startsWith('#### ')) {
      inList = false;
      addText(line.substring(5), 12, 'bold', [60, 60, 60], 3, 2);
      continue;
    }

    // Handle horizontal rules
    if (line.trim() === '---' || line.trim() === '***' || line.trim() === '___') {
      inList = false;
      currentY += 4;
      checkPageBreak(2);
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.3);
      pdf.line(config.marginLeft, currentY, config.pageWidth - config.marginRight, currentY);
      currentY += 4;
      continue;
    }

    // Handle blockquotes
    if (line.startsWith('> ')) {
      inList = false;
      currentY += 3; // Add spacing before quote
      checkPageBreak(10);
      
      const quoteText = line.substring(2).trim();
      const segments = parseInlineMarkdown(quoteText);
      
      const borderWidth = 0.5; // Very thin line
      const borderX = config.marginLeft + 4; // Border position
      const textX = config.marginLeft + 10; // Text starts with spacing from border
      const quoteIndent = 10;
      
      // Position border first, then text slightly below it
      // In jsPDF, Y coordinate is the baseline, so we need to account for that
      // The top of the text appears above the baseline, so we need enough offset
      const borderStartY = currentY; // Border starts here
      const startY = currentY + 3.5; // Text baseline starts below the border (ensures visual top of text is below border)
      currentY = startY; // Update currentY to start rendering text from this position
      
      // Render formatted text with italic base style
      const lineHeightMM = 11 * 0.35277778 * config.lineHeight;
      let lineSegments: TextSegment[] = [];
      let currentLineWidth = 0;
      
      pdf.setFontSize(11);
      pdf.setTextColor(110, 110, 110); // Lighter gray for quote text
      
      for (let j = 0; j < segments.length; j++) {
        const segment = segments[j];
        
        // Set font for width measurement (italic by default for quotes)
        if (segment.code) {
          pdf.setFont('courier', 'normal');
        } else if (segment.bold && segment.italic) {
          pdf.setFont('helvetica', 'bolditalic');
        } else if (segment.bold) {
          pdf.setFont('helvetica', 'bold');
        } else {
          pdf.setFont('helvetica', 'italic');
        }
        
        const words = segment.text.split(' ');
        
        for (let w = 0; w < words.length; w++) {
          const word = words[w] + (w < words.length - 1 ? ' ' : '');
          const wordWidth = pdf.getTextWidth(word);
          const maxQuoteWidth = contentWidth - quoteIndent - 2;
          
          if (currentLineWidth + wordWidth > maxQuoteWidth && lineSegments.length > 0) {
            checkPageBreak(lineHeightMM);
            renderQuoteLineSegments(lineSegments, textX, currentY, 11);
            currentY += lineHeightMM;
            
            lineSegments = [];
            currentLineWidth = 0;
          }
          
          // If single word is too long, break it
          if (wordWidth > maxQuoteWidth) {
            let remainingWord = word;
            while (remainingWord.length > 0) {
              let fitText = remainingWord;
              let fitWidth = pdf.getTextWidth(fitText);
              
              while (fitWidth > maxQuoteWidth - currentLineWidth && fitText.length > 1) {
                fitText = fitText.substring(0, fitText.length - 1);
                fitWidth = pdf.getTextWidth(fitText);
              }
              
              lineSegments.push({
                text: fitText,
                bold: segment.bold,
                italic: true, // Force italic for quotes
                code: segment.code,
                strikethrough: segment.strikethrough,
                link: segment.link, // Preserve link property
              });
              currentLineWidth += fitWidth;
              
              remainingWord = remainingWord.substring(fitText.length);
              
              if (remainingWord.length > 0) {
                checkPageBreak(lineHeightMM);
                renderQuoteLineSegments(lineSegments, textX, currentY, 11);
                currentY += lineHeightMM;
                lineSegments = [];
                currentLineWidth = 0;
              }
            }
          } else {
            lineSegments.push({
              text: word,
              bold: segment.bold,
              italic: true, // Force italic for quotes
              code: segment.code,
              strikethrough: segment.strikethrough,
              link: segment.link, // Preserve link property
            });
            currentLineWidth += wordWidth;
          }
        }
      }
      
      if (lineSegments.length > 0) {
        checkPageBreak(lineHeightMM);
        renderQuoteLineSegments(lineSegments, textX, currentY, 11);
        currentY += lineHeightMM;
      }
      
      // Draw left border - exactly matching text height
      const borderEndY = currentY - lineHeightMM + 2; // Bottom of last text line
      
      pdf.setDrawColor(200, 200, 200); // Subtle gray border
      pdf.setLineWidth(borderWidth);
      pdf.line(borderX, borderStartY, borderX, borderEndY);
      
      currentY += 3;
      continue;
    }

    // Handle task lists (checkboxes)
    const checkboxMatch = line.match(/^[\s]*[-*+]\s+\[([ xX])\]\s+/);
    if (checkboxMatch) {
      const indent = line.search(/[-*+]/);
      const isChecked = checkboxMatch[1].toLowerCase() === 'x';
      const text = line.substring(checkboxMatch[0].length).trim(); // Trim to remove extra spaces
      
      checkPageBreak(6);
      
      const checkboxX = config.marginLeft + (indent * 2);
      const textX = checkboxX + 10; // Same as numbered lists and bullets
      const maxTextWidth = contentWidth - (indent * 2) - 10;
      
      // Draw checkbox with rounded corners (positioned to align)
      const checkboxSize = 3.5;
      const checkboxY = currentY - 3;
      
      if (isChecked) {
        // Filled checkbox with checkmark (softer muted green)
        pdf.setFillColor(100, 200, 150); // Softer muted green
        pdf.setDrawColor(100, 200, 150);
        pdf.setLineWidth(0.3);
        pdf.roundedRect(checkboxX, checkboxY, checkboxSize, checkboxSize, 0.5, 0.5, 'FD');
        
        // White checkmark
        pdf.setDrawColor(255, 255, 255);
        pdf.setLineWidth(0.6);
        pdf.line(checkboxX + 0.7, checkboxY + 1.8, checkboxX + 1.4, checkboxY + 2.5);
        pdf.line(checkboxX + 1.4, checkboxY + 2.5, checkboxX + 2.8, checkboxY + 0.9);
      } else {
        // Empty checkbox
        pdf.setDrawColor(190, 190, 190);
        pdf.setLineWidth(0.3);
        pdf.roundedRect(checkboxX, checkboxY, checkboxSize, checkboxSize, 0.5, 0.5);
      }
      
      // Render text with inline formatting - ALL lines aligned to textX
      const segments = parseInlineMarkdown(text);
      const lineHeightMM = 11 * 0.35277778 * config.lineHeight;
      let lineSegments: TextSegment[] = [];
      let currentLineWidth = 0;
      
      pdf.setFontSize(11);
      
      for (let j = 0; j < segments.length; j++) {
        const segment = segments[j];
        
        if (segment.code) {
          pdf.setFont('courier', 'normal');
        } else if (segment.bold && segment.italic) {
          pdf.setFont('helvetica', 'bolditalic');
        } else if (segment.bold) {
          pdf.setFont('helvetica', 'bold');
        } else if (segment.italic) {
          pdf.setFont('helvetica', 'italic');
        } else {
          pdf.setFont('helvetica', 'normal');
        }
        
        const words = segment.text.split(' ');
        
        for (let w = 0; w < words.length; w++) {
          const word = words[w] + (w < words.length - 1 ? ' ' : '');
          const wordWidth = pdf.getTextWidth(word);
          
          if (currentLineWidth + wordWidth > maxTextWidth && lineSegments.length > 0) {
            checkPageBreak(lineHeightMM);
            renderLineSegments(lineSegments, textX, currentY, 11); // Always textX
            currentY += lineHeightMM;
            
            lineSegments = [];
            currentLineWidth = 0;
          }
          
          // If single word is too long, break it
          if (wordWidth > maxTextWidth) {
            let remainingWord = word;
            while (remainingWord.length > 0) {
              let fitText = remainingWord;
              let fitWidth = pdf.getTextWidth(fitText);
              
              while (fitWidth > maxTextWidth - currentLineWidth && fitText.length > 1) {
                fitText = fitText.substring(0, fitText.length - 1);
                fitWidth = pdf.getTextWidth(fitText);
              }
              
              lineSegments.push({
                text: fitText,
                bold: segment.bold,
                italic: segment.italic,
                code: segment.code,
                strikethrough: segment.strikethrough,
              });
              currentLineWidth += fitWidth;
              
              remainingWord = remainingWord.substring(fitText.length);
              
              if (remainingWord.length > 0) {
                checkPageBreak(lineHeightMM);
                renderLineSegments(lineSegments, textX, currentY, 11);
                currentY += lineHeightMM;
                lineSegments = [];
                currentLineWidth = 0;
              }
            }
          } else {
            lineSegments.push({
              text: word,
              bold: segment.bold,
              italic: segment.italic,
              code: segment.code,
              strikethrough: segment.strikethrough,
            });
            currentLineWidth += wordWidth;
          }
        }
      }
      
      if (lineSegments.length > 0) {
        checkPageBreak(lineHeightMM);
        renderLineSegments(lineSegments, textX, currentY, 11); // Always textX
        currentY += lineHeightMM;
      }
      
      inList = true;
      continue;
    }

    // Handle unordered lists
    if (line.match(/^[\s]*[-*+]\s/)) {
      const indent = line.search(/[-*+]/);
      const text = line.substring(line.indexOf(' ', indent) + 1).trim(); // Trim to remove extra spaces
      
      checkPageBreak(6);
      
      const bulletX = config.marginLeft + (indent * 2);
      const textX = bulletX + 10; // Text starts here - same as numbered lists
      const maxTextWidth = contentWidth - (indent * 2) - 10;
      
      // Draw bullet (positioned to visually align with where "1." would be)
      pdf.setFillColor(0, 0, 0);
      pdf.circle(bulletX + 1.5, currentY - 1.2, 0.9, 'F');
      
      // Render text with inline formatting - ALL lines aligned to textX
      const segments = parseInlineMarkdown(text);
      const lineHeightMM = 11 * 0.35277778 * config.lineHeight;
      let lineSegments: TextSegment[] = [];
      let currentLineWidth = 0;
      
      pdf.setFontSize(11);
      
      for (let j = 0; j < segments.length; j++) {
        const segment = segments[j];
        
        if (segment.code) {
          pdf.setFont('courier', 'normal');
        } else if (segment.bold && segment.italic) {
          pdf.setFont('helvetica', 'bolditalic');
        } else if (segment.bold) {
          pdf.setFont('helvetica', 'bold');
        } else if (segment.italic) {
          pdf.setFont('helvetica', 'italic');
        } else {
          pdf.setFont('helvetica', 'normal');
        }
        
        const words = segment.text.split(' ');
        
        for (let w = 0; w < words.length; w++) {
          const word = words[w] + (w < words.length - 1 ? ' ' : '');
          const wordWidth = pdf.getTextWidth(word);
          
          if (currentLineWidth + wordWidth > maxTextWidth && lineSegments.length > 0) {
            checkPageBreak(lineHeightMM);
            renderLineSegments(lineSegments, textX, currentY, 11); // Always textX
            currentY += lineHeightMM;
            
            lineSegments = [];
            currentLineWidth = 0;
          }
          
          // If single word is too long, break it
          if (wordWidth > maxTextWidth) {
            let remainingWord = word;
            while (remainingWord.length > 0) {
              let fitText = remainingWord;
              let fitWidth = pdf.getTextWidth(fitText);
              
              while (fitWidth > maxTextWidth - currentLineWidth && fitText.length > 1) {
                fitText = fitText.substring(0, fitText.length - 1);
                fitWidth = pdf.getTextWidth(fitText);
              }
              
              lineSegments.push({
                text: fitText,
                bold: segment.bold,
                italic: segment.italic,
                code: segment.code,
                strikethrough: segment.strikethrough,
                link: segment.link, // Preserve link property
              });
              currentLineWidth += fitWidth;
              
              remainingWord = remainingWord.substring(fitText.length);
              
              if (remainingWord.length > 0) {
                checkPageBreak(lineHeightMM);
                renderLineSegments(lineSegments, textX, currentY, 11);
                currentY += lineHeightMM;
                lineSegments = [];
                currentLineWidth = 0;
              }
            }
          } else {
            lineSegments.push({
              text: word,
              bold: segment.bold,
              italic: segment.italic,
              code: segment.code,
              strikethrough: segment.strikethrough,
              link: segment.link, // Preserve link property
            });
            currentLineWidth += wordWidth;
          }
        }
      }
      
      if (lineSegments.length > 0) {
        checkPageBreak(lineHeightMM);
        renderLineSegments(lineSegments, textX, currentY, 11); // Always textX
        currentY += lineHeightMM;
      }
      
      inList = true;
      continue;
    }

    // Handle ordered lists
    const orderedMatch = line.match(/^[\s]*(\d+)\.\s/);
    if (orderedMatch) {
      const indent = line.search(/\d/);
      const number = orderedMatch[1];
      const text = line.substring(line.indexOf(' ', indent + number.length) + 1).trim(); // Trim to remove extra spaces
      
      checkPageBreak(6);
      
      const numberX = config.marginLeft + (indent * 2);
      const textX = numberX + 10; // All lines start here
      const maxTextWidth = contentWidth - (indent * 2) - 10;
      
      // Draw number
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(40, 40, 40); // Dark gray instead of pure black
      pdf.text(`${number}.`, numberX, currentY);
      
      // Render text with inline formatting - ALL lines aligned to textX
      const segments = parseInlineMarkdown(text);
      const lineHeightMM = 11 * 0.35277778 * config.lineHeight;
      let lineSegments: TextSegment[] = [];
      let currentLineWidth = 0;
      
      pdf.setFontSize(11);
      
      for (let j = 0; j < segments.length; j++) {
        const segment = segments[j];
        
        if (segment.code) {
          pdf.setFont('courier', 'normal');
        } else if (segment.bold && segment.italic) {
          pdf.setFont('helvetica', 'bolditalic');
        } else if (segment.bold) {
          pdf.setFont('helvetica', 'bold');
        } else if (segment.italic) {
          pdf.setFont('helvetica', 'italic');
        } else {
          pdf.setFont('helvetica', 'normal');
        }
        
        const words = segment.text.split(' ');
        
        for (let w = 0; w < words.length; w++) {
          const word = words[w] + (w < words.length - 1 ? ' ' : '');
          const wordWidth = pdf.getTextWidth(word);
          
          if (currentLineWidth + wordWidth > maxTextWidth && lineSegments.length > 0) {
            checkPageBreak(lineHeightMM);
            renderLineSegments(lineSegments, textX, currentY, 11); // Always textX
            currentY += lineHeightMM;
            
            lineSegments = [];
            currentLineWidth = 0;
          }
          
          // If single word is too long, break it
          if (wordWidth > maxTextWidth) {
            let remainingWord = word;
            while (remainingWord.length > 0) {
              let fitText = remainingWord;
              let fitWidth = pdf.getTextWidth(fitText);
              
              while (fitWidth > maxTextWidth - currentLineWidth && fitText.length > 1) {
                fitText = fitText.substring(0, fitText.length - 1);
                fitWidth = pdf.getTextWidth(fitText);
              }
              
              lineSegments.push({
                text: fitText,
                bold: segment.bold,
                italic: segment.italic,
                code: segment.code,
                strikethrough: segment.strikethrough,
                link: segment.link, // Preserve link property
              });
              currentLineWidth += fitWidth;
              
              remainingWord = remainingWord.substring(fitText.length);
              
              if (remainingWord.length > 0) {
                checkPageBreak(lineHeightMM);
                renderLineSegments(lineSegments, textX, currentY, 11);
                currentY += lineHeightMM;
                lineSegments = [];
                currentLineWidth = 0;
              }
            }
          } else {
            lineSegments.push({
              text: word,
              bold: segment.bold,
              italic: segment.italic,
              code: segment.code,
              strikethrough: segment.strikethrough,
              link: segment.link, // Preserve link property
            });
            currentLineWidth += wordWidth;
          }
        }
      }
      
      if (lineSegments.length > 0) {
        checkPageBreak(lineHeightMM);
        renderLineSegments(lineSegments, textX, currentY, 11); // Always textX
        currentY += lineHeightMM;
      }
      
      inList = true;
      continue;
    }

    // Handle tables
    if (line.includes('|') && line.trim().startsWith('|')) {
      inList = false;
      
      // Check if this is a table by looking ahead for separator line
      let isTable = false;
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        if (nextLine.match(/^\|[\s:|-]+\|/)) {
          isTable = true;
        }
      }
      
      if (isTable) {
        // Parse table
        const tableLines: string[] = [line];
        let j = i + 1;
        
        // Collect all table rows
        while (j < lines.length && lines[j].includes('|')) {
          tableLines.push(lines[j]);
          j++;
        }
        
        // Skip the rows we've collected
        i = j - 1;
        
        // Parse table data
        const rows = tableLines.map(row => 
          row.split('|').map(cell => cell.trim()).filter(cell => cell.length > 0)
        );
        
        if (rows.length > 0) {
          currentY += 4; // Space before table
          checkPageBreak(15);
          
          const numCols = Math.max(...rows.map(r => r.length));
          const colWidth = contentWidth / numCols;
          
          pdf.setFontSize(10);
          
          for (let r = 0; r < rows.length; r++) {
            const row = rows[r];
            
            // Skip separator row
            if (r === 1 && row[0]?.match(/^[-:]+$/)) {
              continue;
            }
            
            const isHeader = r === 0;
            const rowHeight = 8; // Slightly taller rows for better readability
            
            checkPageBreak(rowHeight + 2);
            
            // Draw cells (no background colors)
            for (let c = 0; c < numCols; c++) {
              const cellX = config.marginLeft + (c * colWidth);
              const cellText = row[c] || '';
              
              // Set font and styling
              if (isHeader) {
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(40, 40, 40); // Dark gray instead of pure black
                pdf.setFontSize(10);
              } else {
                pdf.setFont('helvetica', 'normal');
                pdf.setTextColor(40, 40, 40); // Dark gray instead of pure black
                pdf.setFontSize(9.5);
              }
              
              // Truncate text if too long
              const maxWidth = colWidth - 8; // More padding
              let displayText = cellText;
              if (pdf.getTextWidth(cellText) > maxWidth) {
                while (pdf.getTextWidth(displayText + '...') > maxWidth && displayText.length > 0) {
                  displayText = displayText.slice(0, -1);
                }
                displayText += '...';
              }
              
              pdf.text(displayText, cellX + 4, currentY);
              
              // Draw cell borders - lighter borders throughout
              pdf.setDrawColor(230, 230, 230); // Very light gray
              pdf.setLineWidth(0.2);
              pdf.rect(cellX, currentY - 5, colWidth, rowHeight);
            }
            
            // Draw outer border for the entire table
            pdf.setDrawColor(220, 220, 220); // Light gray
            pdf.setLineWidth(0.3);
            pdf.rect(config.marginLeft, currentY - 5, contentWidth, rowHeight, 'S');
            
            currentY += rowHeight;
          }
          
          currentY += 6;
          continue;
        }
      }
    }

    // Handle empty lines
    if (line.trim() === '') {
      if (inList) {
        currentY += 2;
        inList = false;
      } else {
        currentY += 3;
      }
      continue;
    }

    // Handle standalone images (not inline)
    const imageMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imageMatch) {
      inList = false;
      const alt = imageMatch[1];
      const url = imageMatch[2];
      await renderImage(url, alt);
      continue;
    }

    // Handle regular paragraphs with inline formatting
    inList = false;
    addFormattedText(line, 11, 0, 1);
  }

  // Save the PDF
  const sanitizedName = filename || title.replace(/[^a-z0-9]/gi, '_') || 'Untitled';
  pdf.save(`${sanitizedName}.pdf`);
}
