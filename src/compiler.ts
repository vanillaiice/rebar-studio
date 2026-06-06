import { twMerge } from 'tailwind-merge';
import { clsx, type ClassValue } from 'clsx';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface RebFieldSchema {
  key: string;
  type: string;
  label: string;
  options?: string[];
}

export interface CompilationResult {
  schema: RebFieldSchema[];
  htmlSource: string; // Go template code for the backend
  previewHtml: string; // Visual representation for the live editor preview
  paperWidth: string;
  paperHeight: string;
}

export function compileReb(rawHTML: string): CompilationResult {
  const schema: RebFieldSchema[] = [];
  
  // Pre-process raw HTML to convert <reb-row> to <tr reb-row> before the HTML5 parser hoists invalid tags out of tables
  rawHTML = rawHTML.replace(/<reb-row>/g, '<tr reb-row>').replace(/<\/reb-row>/g, '</tr>');

  // Use a DOM parser to parse the raw string
  const parser = new DOMParser();
  // Wrap in a div so we can easily get innerHTML later without losing root nodes
  const doc = parser.parseFromString(`<body>${rawHTML}</body>`, 'text/html');
  const root = doc.body;

  // We need to clone the document for the preview so they don't interfere
  const previewDoc = parser.parseFromString(`<body>${rawHTML}</body>`, 'text/html');
  const previewRoot = previewDoc.body;

  // Helper to walk nodes recursively
  const walk = (node: Element, isPreview: boolean) => {
    const children = Array.from(node.children);
    
    for (const child of children) {
      if (child.tagName.toLowerCase().startsWith('reb-')) {
        const rebType = child.tagName.toLowerCase().substring(4); // e.g. "text" from "reb-text"
        const name = child.getAttribute('name') || '';
        const label = child.getAttribute('label') || '';
        const optionsStr = child.getAttribute('options') || '';
        const className = child.getAttribute('class') || '';

        // Add to schema only on the first pass (when not isPreview)
        if (!isPreview && name) {
          let schemaType = rebType;
          if (rebType === 'declare') {
            schemaType = child.getAttribute('type') || 'text';
          }

          const field: RebFieldSchema = {
            key: name,
            type: schemaType,
            label: label,
          };
          if (optionsStr) {
            field.options = optionsStr.split(',').map(s => s.trim());
          }
          schema.push(field);
        }

        // --- Transform Node ---
        if (rebType === 'declare') {
          // A declare tag is invisible in both the Go output and the Visual Preview
          child.remove();
          continue;
        }
        
        if (rebType === 'tailwind') {
          // Replace with actual script tag
          if (isPreview) {
            const replacement = previewDoc.createElement('script');
            replacement.src = "https://unpkg.com/@tailwindcss/browser@4";
            child.replaceWith(replacement);
          } else {
            const replacement = doc.createElement('script');
            replacement.src = "tailwindcss.js";
            child.replaceWith(replacement);
          }
          continue;
        }

        if (rebType === 'pagebreak') {
          if (isPreview) {
            const replacement = previewDoc.createElement('div');
            replacement.className = "w-full border-b-2 border-dashed border-zinc-700/50 my-12 relative flex items-center justify-center";
            replacement.innerHTML = `<span class="bg-zinc-900 px-3 text-xs text-zinc-500 font-mono tracking-widest uppercase">Page Break</span>`;
            child.replaceWith(replacement);
          } else {
            const replacement = doc.createElement('div');
            replacement.setAttribute('style', 'page-break-after: always; clear: both;');
            child.replaceWith(replacement);
          }
          continue;
        }

        if (rebType === 'footer') {
          if (isPreview) {
            // Render it as a sticky dashed block at the bottom of the editor preview
            const replacement = previewDoc.createElement('div');
            replacement.className = "w-full border-t-2 border-dashed border-zinc-700/50 mt-12 pt-4 opacity-75 relative";
            // Emulate the Gotenberg numbering just for preview context
            let inner = child.innerHTML;
            inner = inner.replace(/class="[^"]*pageNumber[^"]*"/g, 'class="pageNumber"').replace(/<span class="pageNumber"><\/span>/g, '1');
            inner = inner.replace(/class="[^"]*totalPages[^"]*"/g, 'class="totalPages"').replace(/<span class="totalPages"><\/span>/g, '1');
            replacement.innerHTML = inner;
            
            if (className) replacement.className += ' ' + className;
            child.replaceWith(replacement);
          } else {
            // Generate the extraction div for the Go backend
            const replacement = doc.createElement('rebar-pdf-footer-extract');
            replacement.setAttribute('style', 'display:none;');
            if (className) replacement.setAttribute('class', className);
            replacement.innerHTML = child.innerHTML;
            child.replaceWith(replacement);
          }
          continue;
        }

        // For standard html output (Go Templates)
        if (!isPreview) {
          const replacement = doc.createElement(rebType === 'photogrid' || rebType === 'table' || rebType === 'textarea' ? 'div' : 'span');
          if (className) replacement.className = className;

          if (rebType === 'photogrid') {
            replacement.innerHTML = `{{range .${name}}}<img src="{{.}}" class="w-full object-cover rounded shadow-sm" />{{end}}`;
          } else if (rebType === 'table') {
            replacement.innerHTML = child.innerHTML; // Preserve the table layout
          } else if (name !== '') {
            replacement.innerHTML = rebType === 'textarea' ? `{{.${name} | safeHTML}}` : `{{.${name}}}`;
          }
          child.replaceWith(replacement);

          if (rebType === 'table') {
            // Ensure any inner tags like reb-declare are processed
            walk(replacement, isPreview);
          }
        } else {
          if (rebType === 'table') {
             const replacement = previewDoc.createElement('div');
             if (className) replacement.className = className;
             replacement.innerHTML = child.innerHTML;
             child.replaceWith(replacement);
             continue;
          }

          if (rebType === 'textarea' || rebType === 'text' || rebType === 'number' || rebType === 'date') {
            const replacement = previewDoc.createElement(rebType === 'textarea' ? 'div' : 'span');
            if (className) replacement.className = className;
            if (name !== '') replacement.innerHTML = `{{.${name}}}`;
            child.replaceWith(replacement);
            continue;
          }

          const replacement = previewDoc.createElement('div');
          replacement.className = 'mb-4';
          
          let inputHtml = '';
          
          if (rebType === 'photogrid') {
            inputHtml = `<div class="${cn('p-4 border-2 border-dashed border-zinc-700 bg-zinc-800/20 rounded-md text-center text-zinc-500 text-xs flex flex-col items-center justify-center min-h-[100px]', className)}"><svg class="w-6 h-6 mb-2 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>Photogrid Upload Area (${label})</div>`;
          } else if (rebType === 'select' || rebType === 'radio') {
            const opts = optionsStr.split(',').map(o => o.trim());
            if (rebType === 'select') {
              inputHtml = `<select disabled class="${cn('w-full rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-300', className)}"><option>${label}...</option>${opts.map(o => `<option>${o}</option>`).join('')}</select>`;
            } else {
               inputHtml = `<div class="${cn('flex gap-4 text-sm text-zinc-300', className)}">${opts.map(o => `<label class="flex items-center gap-2"><input type="radio" disabled name="${name}" /> ${o}</label>`).join('')}</div>`;
            }
          } else {
            inputHtml = `<div class="${cn('p-3 bg-brand-amber/10 text-brand-amber text-xs font-mono rounded border border-brand-amber/20', className)}">[${rebType.toUpperCase()} FIELD: ${name}]</div>`;
          }

          replacement.innerHTML = `
            <div class="flex flex-col gap-1.5 w-full">
              ${label ? `<label class="text-xs font-bold text-zinc-400 uppercase tracking-wider">${label}</label>` : ''}
              ${inputHtml}
            </div>
          `;
          child.replaceWith(replacement);
        }
      } else {
        // Walk deeper
        walk(child, isPreview);
      }
    }
  };

  walk(root, false);
  walk(previewRoot, true);

  // Extract CSS @page sizing
  let paperWidth = '210mm';
  let paperHeight = '297mm';
  
  const pageMatch = rawHTML.match(/@page\s*\{[^}]*size:\s*([^;}]+)/i);
  if (pageMatch) {
    const size = pageMatch[1].trim().toLowerCase();
    if (size.includes('a4 landscape')) {
      paperWidth = '297mm';
      paperHeight = '210mm';
    } else if (size.includes('a4')) {
      paperWidth = '210mm';
      paperHeight = '297mm';
    } else if (size.includes('a3 landscape')) {
      paperWidth = '420mm';
      paperHeight = '297mm';
    } else if (size.includes('a3')) {
      paperWidth = '297mm';
      paperHeight = '420mm';
    } else if (size.includes('letter landscape')) {
      paperWidth = '11in';
      paperHeight = '8.5in';
    } else if (size.includes('letter')) {
      paperWidth = '8.5in';
      paperHeight = '11in';
    } else if (size.split(/\s+/).length === 2) {
      const parts = size.split(/\s+/);
      if (!isNaN(parseFloat(parts[0])) && !isNaN(parseFloat(parts[1]))) {
        paperWidth = parts[0];
        paperHeight = parts[1];
      }
    }
  }

  let htmlSource = root.innerHTML.trim();
  let previewHtml = previewRoot.innerHTML.trim();

  // Globally mock Go template syntax for the visual preview to look clean
  previewHtml = previewHtml.replace(/\{\{formatDate\s+"([^"]+)"\s+\.([a-zA-Z0-9_]+)\}\}/g, (_, layout) => {
    if (layout === "02/01/06") return "12/04/26";
    return "12/04/2026";
  });
  
  // Mock math functions and formatNumber for visual preview
  previewHtml = previewHtml.replace(/\{\{\s*(?:multiply|add|subtract|divide|sumColumn)[\s\S]*?\}\}/g, '0.00');

  previewHtml = previewHtml.replace(/\{\{if\s+[^}]+\}\}(.*?)\{\{else\}\}(.*?)\{\{end\}\}/gs, '$1');
  previewHtml = previewHtml.replace(/\{\{if\s+[^}]+\}\}(.*?)\{\{end\}\}/gs, '$1');
  previewHtml = previewHtml.replace(/\{\{range\s+[^}]+\}\}/g, '');
  previewHtml = previewHtml.replace(/\{\{end\}\}/g, '');
  previewHtml = previewHtml.replace(/\{\{\.([a-zA-Z0-9_]+)(?:\s*\|\s*safeHTML)?\}\}/g, (_, p1) => {
    return p1.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  });

  // Fix DOMParser mangling of Go template syntaxes inside HTML attributes
  htmlSource = htmlSource.replace(/\{\{([a-zA-Z]+)="" /g, '{{$1 ');
  htmlSource = htmlSource.replace(/\{\{([^}]+)\}\}=""/g, '{{$1}}');
  
  // Fix DOMParser escaping quotes inside Go template directives in text nodes
  // {{if eq .severity &quot;C&quot;}} becomes {{if eq .severity "C"}}
  htmlSource = htmlSource.replace(/\{\{.*?\}\}/g, (match) => {
    return match
      .replace(/&quot;/g, '"')
      .replace(/&#34;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  });
  
  return {
    schema,
    htmlSource,
    previewHtml,
    paperWidth,
    paperHeight
  };
}
