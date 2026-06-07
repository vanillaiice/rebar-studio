import { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import type { Monaco } from '@monaco-editor/react';
import { FileCode2, Eye, Download, Upload, Code2, Database, LayoutTemplate, PlusCircle } from 'lucide-react';
import { compileReb, type CompilationResult } from './compiler';

const DEFAULT_REB = `<!-- Explicitly request Tailwind CSS styling for this document -->
<reb-tailwind></reb-tailwind>

<style>
  body {
    font-family: Arial, sans-serif;
    color: #1a202c;
    line-height: 1.6;
  }
  .header-card {
    border-left: 6px solid #d97706;
    background-color: #fef3c7;
    padding: 16px;
    margin-bottom: 20px;
  }
  .meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 30px;
  }
</style>

<div class="max-w-3xl mx-auto bg-white p-8 shadow-sm">
  <div class="header-card">
    <h2 class="text-xl font-bold">High Risk Work Authorization Certificate</h2>
  </div>

  <div class="meta-grid">
    <div>
      <strong class="block text-sm text-slate-500 mb-1">Permit Reference:</strong>
      <reb-number name="permit_number" label="Authorized Permit Number" class="text-slate-800 font-semibold"></reb-number>
    </div>
    <div>
      <strong class="block text-sm text-slate-500 mb-1">Clearance Category:</strong>
      <reb-select name="clearance_type" label="Operational Clearance Category" options="Hot Work, Confined Space Entry, Electrical Isolation"></reb-select>
    </div>
  </div>

  <div class="status-box bg-slate-50 p-4 border border-slate-200 rounded">
    <div class="mb-4">
      <strong class="block text-sm text-slate-500 mb-1">PPE Controls Verified:</strong> 
      <reb-text name="ppe_verified" label="Protective Gears Inspected"></reb-text>
    </div>
    
    <h3 class="mt-4 font-bold text-slate-700">Additional Notes</h3>
    <reb-textarea name="inspector_notes" label="Inspector Comments" class="mt-2 text-sm italic"></reb-textarea>
  </div>
</div>

<reb-footer>
  <div class="w-full text-center text-[10px] text-slate-500 font-mono tracking-widest uppercase border-t border-slate-300 pt-2 mt-8">
    Rebar Automated Document System — Page <span class="pageNumber"></span> of <span class="totalPages"></span>
  </div>
</reb-footer>`;

type EditorTab = 'reb' | 'html' | 'json';

const REBAR_SNIPPETS = [
  { label: 'Text Field', snippet: '<reb-text name="field_name" label="Field Label"></reb-text>' },
  { label: 'Text Area', snippet: '<reb-textarea name="field_name" label="Field Label"></reb-textarea>' },
  { label: 'Number', snippet: '<reb-number name="field_name" label="Field Label"></reb-number>' },
  { label: 'Date', snippet: '<reb-date name="field_name" label="Field Label"></reb-date>' },
  { label: 'Select Dropdown', snippet: '<reb-select name="field_name" label="Field Label" options="Option 1, Option 2"></reb-select>' },
  { label: 'Radio Buttons', snippet: '<reb-radio name="field_name" label="Field Label" options="Yes, No"></reb-radio>' },
  { label: 'Photo Grid', snippet: '<reb-photogrid name="photos" label="Photo Evidence"></reb-photogrid>' },
  { label: 'File Attachments', snippet: '<reb-attachments name="attachments" label="Document Attachments"></reb-attachments>' },
  { label: 'Signature Pad', snippet: '<reb-signature name="inspector_sig" label="Inspector Signature"></reb-signature>' },
  { label: 'Data Table', snippet: '<reb-table name="table_data" label="Data Table" options="col1:text,col2:text"></reb-table>' },
  { label: 'Formula Table (Estimate)', snippet: '<reb-table name="estimate_items" label="Estimate Details" options="description:text,quantity:number,unit_price:number,amount:formula[quantity*unit_price|2]">\n  <table class="w-full text-sm border-collapse">\n    <thead>\n      <tr class="bg-slate-100">\n        <th class="p-2 border">Description</th>\n        <th class="p-2 border w-24">Qty</th>\n        <th class="p-2 border w-32">Rate</th>\n        <th class="p-2 border w-32">Amount</th>\n      </tr>\n    </thead>\n    <tbody>\n      <tr reb-row>\n        <td class="p-1 border"><reb-declare name="description"></reb-declare>{{.description}}</td>\n        <td class="p-1 border"><reb-declare name="quantity" type="number"></reb-declare>{{.quantity}}</td>\n        <td class="p-1 border"><reb-declare name="unit_price" type="number"></reb-declare>${{.unit_price}}</td>\n        <td class="p-1 border font-bold">${{multiply .quantity .unit_price | formatNumber 2}}</td>\n      </tr>\n    </tbody>\n  </table>\n  <div class="text-right font-bold mt-2 text-lg">\n    Grand Total: ${{sumColumn .estimate_items "amount" | formatNumber 2}}\n  </div>\n</reb-table>' },
  { label: 'Table Row', snippet: '<tr reb-row></tr>' },
  { label: 'Page Break', snippet: '<reb-pagebreak></reb-pagebreak>' },
  { label: 'Footer', snippet: '<reb-footer>\n  Page <span class="pageNumber"></span> of <span class="totalPages"></span>\n</reb-footer>' },
  { label: 'Hidden Field', snippet: '<reb-declare name="field_name" label="Hidden Field" type="string"></reb-declare>' },
  { label: 'Section Divider', snippet: '<reb-declare type="section" name="section_1" label="Section Title"></reb-declare>' },
  { label: 'Current Date/Time', snippet: '{{ now | formatDate "02/01/2006" }}' },
  { label: 'Tailwind Config', snippet: '<reb-tailwind></reb-tailwind>' }
];

function App() {
  const [activeTab, setActiveTab] = useState<EditorTab>('reb');
  const [previewOrientation, setPreviewOrientation] = useState<'auto' | 'portrait' | 'landscape'>('auto');
  const [previewZoom, setPreviewZoom] = useState(1);
  const [editorWidth, setEditorWidth] = useState(50);
  const isDragging = useRef(false);
  
  const [rebCode, setRebCode] = useState(() => {
    const saved = localStorage.getItem('rebar_editor_code');
    return saved !== null ? saved : DEFAULT_REB;
  });
  const [compiled, setCompiled] = useState<CompilationResult>({
    schema: [],
    htmlSource: '',
    previewHtml: '',
    paperWidth: '210mm',
    paperHeight: '297mm'
  });

  const editorRef = useRef<any>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleEditorDidMount = (editor: any, monaco: Monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Register Auto-completion provider for reb- elements
    monaco.languages.registerCompletionItemProvider('html', {
      provideCompletionItems: (model: any, position: any) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const suggestions = REBAR_SNIPPETS.map(snippet => ({
          label: snippet.label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: snippet.snippet,
          documentation: `Insert a ${snippet.label} component`,
          range: range,
        }));

        return { suggestions };
      }
    });
  };

  const insertSnippet = (snippet: string) => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    const selection = editor.getSelection();
    editor.executeEdits('snippets', [
      {
        range: selection,
        text: snippet,
        forceMoveMarkers: true
      }
    ]);
    editor.focus();
  };

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      // 224px is the width of the left sidebar (w-56)
      const containerWidth = window.innerWidth - 224; 
      let newWidth = ((e.clientX - 224) / containerWidth) * 100;
      if (newWidth < 20) newWidth = 20;
      if (newWidth > 80) newWidth = 80;
      setEditorWidth(newWidth);
    };

    const stopDrag = () => {
      isDragging.current = false;
      document.body.style.cursor = 'default';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', stopDrag);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopDrag);
  };

  // Recompile and save whenever REB code changes
  useEffect(() => {
    try {
      localStorage.setItem('rebar_editor_code', rebCode);
      const result = compileReb(rebCode);
      setCompiled(result);
    } catch (e) {
      console.error("Compilation error:", e);
    }
  }, [rebCode]);

  const handleDownload = () => {
    let content = '';
    let filename = '';
    let type = '';

    if (activeTab === 'reb') {
      content = rebCode;
      filename = 'template.reb';
      type = 'text/plain';
    } else if (activeTab === 'html') {
      content = compiled.htmlSource;
      filename = 'template.html';
      type = 'text/html';
    } else if (activeTab === 'json') {
      content = JSON.stringify(compiled.schema, null, 2);
      filename = 'schema.json';
      type = 'application/json';
    }

    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        setRebCode(content);
        setActiveTab('reb');
      }
    };
    reader.readAsText(file);
    // Reset input so the same file can be uploaded again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Construct iframe content for fully isolated dynamic Tailwind preview
  const previewSrcDoc = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { 
            margin: 0; 
            padding: 2rem; 
            font-family: ui-sans-serif, system-ui, sans-serif;
            background: transparent;
          }
          /* Simulate dark mode inside iframe based on parent if needed, but keeping simple for now */
          ::-webkit-scrollbar { width: 6px; height: 6px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: rgba(15, 23, 42, 0.2); border-radius: 9999px; }
        </style>
        <script>
          document.addEventListener("DOMContentLoaded", () => {
            const scrollPos = sessionStorage.getItem('previewScrollPos');
            const wasAtBottom = sessionStorage.getItem('previewAtBottom') === 'true';
            
            if (wasAtBottom) {
              // Scroll to bottom
              window.scrollTo(0, document.documentElement.scrollHeight);
            } else if (scrollPos) {
              window.scrollTo(0, parseInt(scrollPos));
            }
          });
          window.addEventListener('scroll', () => {
            sessionStorage.setItem('previewScrollPos', window.scrollY);
            const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 50;
            sessionStorage.setItem('previewAtBottom', atBottom);
          });
        </script>
      </head>
      <body>
        ${compiled.previewHtml}
      </body>
    </html>
  `;

  let finalWidth = compiled.paperWidth;
  let finalHeight = compiled.paperHeight;
  
  if (previewOrientation === 'landscape') {
    const wVal = parseFloat(finalWidth);
    const hVal = parseFloat(finalHeight);
    if (!isNaN(wVal) && !isNaN(hVal) && wVal < hVal) {
      finalWidth = compiled.paperHeight;
      finalHeight = compiled.paperWidth;
    }
  } else if (previewOrientation === 'portrait') {
    const wVal = parseFloat(finalWidth);
    const hVal = parseFloat(finalHeight);
    if (!isNaN(wVal) && !isNaN(hVal) && wVal > hVal) {
      finalWidth = compiled.paperHeight;
      finalHeight = compiled.paperWidth;
    }
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-brand-steel-dark text-slate-200 font-sans overflow-hidden">
      {/* Top Navigation */}
      <header className="h-14 shrink-0 border-b border-brand-steel-light bg-brand-steel flex items-center justify-between px-6 z-10">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-brand-amber text-brand-steel flex items-center justify-center font-black">
            <Code2 size={18} />
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-wide text-white">Rebar Studio</h1>
            <p className="text-[10px] text-brand-amber font-mono tracking-widest uppercase mt-0.5">Live Template Compiler</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImport} 
            accept=".reb,.html,.txt" 
            className="hidden" 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold bg-brand-steel-light hover:bg-zinc-700 text-white rounded-md transition"
          >
            <Upload size={14} />
            Import .REB
          </button>
          <button 
            onClick={handleDownload}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold bg-brand-amber hover:bg-brand-amber-dark text-brand-steel rounded-md transition"
          >
            <Download size={14} />
            Export {activeTab.toUpperCase()}
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Far Left Pane: Snippets Toolbar */}
        <div className="w-56 shrink-0 flex flex-col border-r border-brand-steel-light bg-[#191919]">
          <div className="flex items-center gap-2 p-3 text-xs font-bold uppercase tracking-wider text-zinc-400 border-b border-brand-steel-light bg-brand-steel shrink-0">
             <LayoutTemplate size={14} />
             Components
          </div>
          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5 custom-scrollbar">
            {REBAR_SNIPPETS.map((item, idx) => (
              <button
                key={idx}
                onClick={() => insertSnippet(item.snippet)}
                className="flex items-center justify-between px-3 py-2 text-[11px] font-medium text-left text-zinc-300 hover:text-white bg-[#252526] hover:bg-[#2d2d2d] border border-[#333] hover:border-[#444] rounded transition group"
              >
                <span>{item.label}</span>
                <PlusCircle size={14} className="opacity-0 group-hover:opacity-100 text-brand-amber transition-opacity" />
              </button>
            ))}
          </div>
        </div>

        {/* Center Pane: Code Editor */}
        <div 
          className="flex flex-col border-r border-brand-steel-light bg-[#1e1e1e]"
          style={{ width: `${editorWidth}%` }}
        >
          {/* Editor Tabs */}
          <div className="flex items-center bg-brand-steel shrink-0 border-b border-brand-steel-light">
            <button 
              onClick={() => setActiveTab('reb')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition ${activeTab === 'reb' ? 'bg-[#1e1e1e] text-brand-amber border-t-2 border-t-brand-amber' : 'text-zinc-500 hover:text-zinc-300 border-t-2 border-t-transparent'}`}
            >
              <FileCode2 size={14} />
              Source (.reb)
            </button>
            <button 
              onClick={() => setActiveTab('html')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition ${activeTab === 'html' ? 'bg-[#1e1e1e] text-brand-amber border-t-2 border-t-brand-amber' : 'text-zinc-500 hover:text-zinc-300 border-t-2 border-t-transparent'}`}
            >
              <Code2 size={14} />
              Compiled HTML
            </button>
            <button 
              onClick={() => setActiveTab('json')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition ${activeTab === 'json' ? 'bg-[#1e1e1e] text-brand-amber border-t-2 border-t-brand-amber' : 'text-zinc-500 hover:text-zinc-300 border-t-2 border-t-transparent'}`}
            >
              <Database size={14} />
              Compiled JSON
            </button>
          </div>

          {/* Monaco Editor Container */}
          <div className="flex-1 relative">
            {activeTab === 'reb' && (
              <Editor
                height="100%"
                defaultLanguage="html"
                theme="vs-dark"
                value={rebCode}
                onChange={(val) => setRebCode(val || '')}
                onMount={handleEditorDidMount}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  wordWrap: 'on',
                  padding: { top: 16 },
                }}
              />
            )}
            
            {activeTab === 'html' && (
              <Editor
                height="100%"
                defaultLanguage="html"
                theme="vs-dark"
                value={compiled.htmlSource}
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  fontSize: 13,
                  wordWrap: 'on',
                  padding: { top: 16 },
                }}
              />
            )}

            {activeTab === 'json' && (
              <Editor
                height="100%"
                defaultLanguage="json"
                theme="vs-dark"
                value={JSON.stringify(compiled.schema, null, 2)}
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  fontSize: 13,
                  padding: { top: 16 },
                }}
              />
            )}
          </div>
        </div>

        {/* Draggable Resizer */}
        <div 
          className="w-1.5 cursor-col-resize hover:bg-brand-amber active:bg-brand-amber transition-colors flex shrink-0 items-center justify-center z-10 relative group"
          onMouseDown={startDrag}
        >
          <div className="h-8 w-0.5 bg-zinc-600 rounded-full group-hover:bg-brand-steel-dark transition-colors"></div>
        </div>

        {/* Right Pane: Live Preview */}
        <div 
          className="flex flex-col bg-slate-100 dark:bg-slate-900"
          style={{ width: `${100 - editorWidth}%` }}
        >
          <div className="flex items-center justify-between bg-white dark:bg-slate-950 shrink-0 border-b border-slate-200 dark:border-zinc-800 px-4 py-2.5">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                <Eye size={14} />
                Live Visual Preview
              </div>
              <div className="flex items-center bg-slate-100 dark:bg-zinc-800/50 rounded-md p-0.5 border border-slate-200 dark:border-zinc-700/50">
                <button
                  onClick={() => setPreviewOrientation('auto')}
                  className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded ${previewOrientation === 'auto' ? 'bg-white dark:bg-zinc-600 text-brand-amber shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300'}`}
                >
                  Auto
                </button>
                <button
                  onClick={() => setPreviewOrientation('portrait')}
                  className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded ${previewOrientation === 'portrait' ? 'bg-white dark:bg-zinc-600 text-brand-amber shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300'}`}
                >
                  Portrait
                </button>
                <button
                  onClick={() => setPreviewOrientation('landscape')}
                  className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded ${previewOrientation === 'landscape' ? 'bg-white dark:bg-zinc-600 text-brand-amber shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300'}`}
                >
                  Landscape
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-slate-100 dark:bg-zinc-800/50 rounded-md p-0.5 border border-slate-200 dark:border-zinc-700/50 mr-2">
                <button
                  onClick={() => setPreviewZoom(z => Math.max(0.25, z - 0.25))}
                  className="px-2 py-0.5 text-xs font-bold text-slate-500 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  -
                </button>
                <span className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 px-2 min-w-[40px] text-center">
                  {Math.round(previewZoom * 100)}%
                </span>
                <button
                  onClick={() => setPreviewZoom(z => Math.min(3, z + 0.25))}
                  className="px-2 py-0.5 text-xs font-bold text-slate-500 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  +
                </button>
              </div>
              <span className="flex h-2 w-2 rounded-full bg-red-400"></span>
              <span className="flex h-2 w-2 rounded-full bg-amber-400"></span>
              <span className="flex h-2 w-2 rounded-full bg-green-400"></span>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto bg-slate-200 dark:bg-slate-800 p-8 flex items-start justify-center relative">
            {/* Wrapper to maintain scaled layout space for scrollbars */}
            <div 
              className="relative shrink-0 flex justify-center transition-all duration-300"
              style={{ 
                width: `calc(${finalWidth} * ${previewZoom})`, 
                minHeight: `calc(${finalHeight} * ${previewZoom})` 
              }}
            >
              <div 
                className="bg-white shadow-2xl relative transition-transform duration-300 origin-top shrink-0" 
                style={{ 
                  width: finalWidth, 
                  minHeight: finalHeight,
                  transform: `scale(${previewZoom})`
                }}
              >
                <iframe
                  title="Live Preview"
                  srcDoc={previewSrcDoc}
                  className="absolute inset-0 w-full h-full border-0"
                  sandbox="allow-scripts allow-same-origin"
                />
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default App;
