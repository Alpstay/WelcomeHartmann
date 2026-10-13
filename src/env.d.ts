/// <reference path="./claude/claude.d.ts" />
/// <reference path="./claude/mcp.d.ts" />
/// <reference path="./claude/downloads.d.ts" />
/// <reference path="./claude/permissions.d.ts" />

import type { TDocumentDefinitions, TFontDictionary } from "pdfmake/interfaces";

declare global {
  /** pdfmake 0.2.20 caricato dalla CDN (build UMD). */
  interface PdfMakeDocument {
    getBlob(cb: (blob: Blob) => void): void;
  }
  interface PdfMakeStatic {
    createPdf(
      doc: TDocumentDefinitions,
      tableLayouts?: unknown,
      fonts?: TFontDictionary,
      vfs?: Record<string, string>,
    ): PdfMakeDocument;
  }
  interface Window {
    pdfMake?: PdfMakeStatic;
  }
}
