# Rebar Template Editor

This is a specialized standalone editor for authoring `.reb` Rebar Form Templates. It provides administrators with a WYSIWYG interface to construct custom HTML structures, inject JSON field schemas, and preview the PDF styling results in real-time.

Built with **React**, **TypeScript**, and **Vite**, utilizing the Monaco Editor for syntax highlighting.

## Features

- **Monaco Engine**: Code editor featuring HTML syntax highlighting and automatic JSON schema formatting.
- **Visual Builder**: Adds Rebar-specific dynamic fields (e.g. `{{.project}}`, `{{.Answers.custom_field}}`, Photo Grids).
- **Live Preview**: Real-time rendering of the generated template components.
- **Form Deployment**: Commits finalized `.reb` templates directly to the backend over REST via API.

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Run the development server (runs independently of the main Web Client):
```bash
npm run dev
```

The editor will be available at [http://localhost:5173](http://localhost:5173).

## Compilation

To bundle the editor for production:
```bash
npm run build
```
This generates static HTML/JS/CSS assets in the `/dist` directory.
