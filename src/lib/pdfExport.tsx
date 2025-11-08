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
 * Now includes links and images
 */
function parseInlineMarkdown(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let currentPos = 0;
  
  // Pattern to match: **bold**, *italic*, `code`, ~~strikethrough~~, [link](url), ![image](url)
  const pattern = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|~~([^~]+)~~|!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\))/g;
  
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
      // [text](url) - link - show both text and URL
      segments.push({
        text: `${match[8]} (${match[9]})`,
        bold: false,
        italic: false,
        code: false,
        strikethrough: false,
        link: match[9],
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
  
  return segments;
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
      } else if (segment.link) {
        // Links are bright blue, bold, and underlined for maximum visibility
        pdf.setFontSize(fontSize);
        pdf.setTextColor(0, 85, 200); // Bright blue - very visible
        
        if (segment.bold && segment.italic) {
          pdf.setFont('helvetica', 'bolditalic');
        } else if (segment.bold) {
          pdf.setFont('helvetica', 'bold');
        } else if (segment.italic) {
          pdf.setFont('helvetica', 'italic');
        } else {
          pdf.setFont('helvetica', 'bold'); // Make links bold by default
        }
      } else if (segment.isImage) {
        // Images shown as gray italic text
        pdf.setFontSize(fontSize * 0.9);
        pdf.setTextColor(100, 100, 100);
        pdf.setFont('helvetica', 'italic');
      } else {
        pdf.setFontSize(fontSize);
        pdf.setTextColor(0, 0, 0);
        
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
      const width = pdf.getTextWidth(segment.text);
      
      // Render text (links show URL in parentheses)
      if (segment.link) {
        // Make link clickable
        pdf.textWithLink(segment.text, x, y, { url: segment.link });
        
        // Add prominent underline to make links clearly visible
        pdf.setDrawColor(0, 85, 200); // Bright blue to match link color
        pdf.setLineWidth(0.4); // Thicker underline
        pdf.line(x, y + 0.5, x + width, y + 0.5);
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
  };

  // Helper function to render quote segments (similar but with gray text)
  const renderQuoteLineSegments = (segments: TextSegment[], startX: number, y: number, fontSize: number): void => {
    let x = startX;
    
    for (const segment of segments) {
      // Set font style - quotes are gray and italic by default
      if (segment.code) {
        pdf.setFont('courier', 'normal');
        pdf.setFontSize(fontSize * 0.9);
        pdf.setTextColor(80, 80, 80);
        
        // Draw background for inline code
        const width = pdf.getTextWidth(segment.text);
        pdf.setFillColor(240, 240, 240);
        pdf.rect(x - 0.5, y - fontSize * 0.25, width + 1, fontSize * 0.35, 'F');
      } else {
        pdf.setFontSize(fontSize);
        pdf.setTextColor(80, 80, 80); // Consistent darker gray color
        
        if (segment.bold && segment.italic) {
          pdf.setFont('helvetica', 'bolditalic');
        } else if (segment.bold) {
          pdf.setFont('helvetica', 'bold');
        } else {
          pdf.setFont('helvetica', 'italic'); // Quotes are italic
        }
      }
      
      // Render text
      const width = pdf.getTextWidth(segment.text);
      pdf.text(segment.text, x, y);
      
      // Add strikethrough if needed
      if (segment.strikethrough) {
        pdf.setDrawColor(80, 80, 80);
        pdf.setLineWidth(0.2);
        pdf.line(x, y - fontSize * 0.15, x + width, y - fontSize * 0.15);
      }
      
      x += width;
    }
  };

  // Add title
  addText(title || 'Untitled', 24, 'bold', [0, 0, 0], 0, 4);

  // Add a subtle line under the title
  pdf.setDrawColor(200, 200, 200);
  pdf.setLineWidth(0.5);
  pdf.line(config.marginLeft, currentY, config.pageWidth - config.marginRight, currentY);
  currentY += 8;

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

  // Parse and render markdown content
  const lines = content.split('\n');
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
      
      const startY = currentY; // Track where text starts
      const borderWidth = 0.5; // Very thin line
      const borderX = config.marginLeft + 4; // Border position
      const textX = config.marginLeft + 10; // Text starts with spacing from border
      const quoteIndent = 10;
      
      // Render formatted text with italic base style
      const lineHeightMM = 11 * 0.35277778 * config.lineHeight;
      let lineSegments: TextSegment[] = [];
      let currentLineWidth = 0;
      
      pdf.setFontSize(11);
      pdf.setTextColor(80, 80, 80); // Darker gray for better readability
      
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
      const borderStartY = startY - 2.5; // Top of first text line
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
      pdf.setTextColor(0, 0, 0);
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
          currentY += 2; // Space before table
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
            const rowHeight = 7;
            
            checkPageBreak(rowHeight + 2);
            
            // Draw row background
            if (isHeader) {
              pdf.setFillColor(248, 248, 248);
              pdf.rect(config.marginLeft, currentY - 4.5, contentWidth, rowHeight, 'F');
            } else if (r % 2 === 0) {
              // Alternating row colors
              pdf.setFillColor(252, 252, 252);
              pdf.rect(config.marginLeft, currentY - 4.5, contentWidth, rowHeight, 'F');
            }
            
            // Draw cells
            for (let c = 0; c < numCols; c++) {
              const cellX = config.marginLeft + (c * colWidth);
              const cellText = row[c] || '';
              
              // Set font
              if (isHeader) {
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(30, 30, 30);
              } else {
                pdf.setFont('helvetica', 'normal');
                pdf.setTextColor(60, 60, 60);
              }
              
              // Truncate text if too long
              const maxWidth = colWidth - 6;
              let displayText = cellText;
              if (pdf.getTextWidth(cellText) > maxWidth) {
                while (pdf.getTextWidth(displayText + '...') > maxWidth && displayText.length > 0) {
                  displayText = displayText.slice(0, -1);
                }
                displayText += '...';
              }
              
              pdf.text(displayText, cellX + 3, currentY);
              
              // Draw cell borders
              pdf.setDrawColor(220, 220, 220);
              pdf.setLineWidth(0.3);
              pdf.rect(cellX, currentY - 4.5, colWidth, rowHeight);
            }
            
            currentY += rowHeight;
          }
          
          currentY += 5;
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
