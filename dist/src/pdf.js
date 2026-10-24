"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.asPdf = asPdf;
const pdf_lib_1 = require("pdf-lib");
/** Render plain spool text into selectable/searchable PDF pages. */
async function asPdf(pages) {
    const doc = await pdf_lib_1.PDFDocument.create();
    const font = await doc.embedFont(pdf_lib_1.StandardFonts.Courier);
    const size = 8, lineHeight = 10, margin = 30, pageWidth = 595.28, pageHeight = 841.89;
    const maxWidth = pageWidth - margin * 2;
    const maxLines = Math.floor((pageHeight - margin * 2) / lineHeight);
    for (const content of pages) {
        const lines = [];
        for (const line of content.replace(/\r\n?/g, '\n').split('\n')) {
            let current = '';
            for (const ch of line) {
                // PDF standard fonts cannot represent all Unicode. Replace unsupported glyphs.
                const cp = ch.codePointAt(0);
                const glyph = (cp >= 32 && cp <= 126) || (cp >= 160 && cp <= 255) ? ch : (ch === '\t' ? '    ' : '?');
                if (font.widthOfTextAtSize(current + glyph, size) > maxWidth && current) {
                    lines.push(current);
                    current = '';
                }
                current += glyph;
            }
            lines.push(current);
        }
        for (let start = 0; start < Math.max(lines.length, 1); start += maxLines) {
            const page = doc.addPage([pageWidth, pageHeight]);
            lines.slice(start, start + maxLines).forEach((line, i) => {
                // Avoid unsupported control characters in PDF text.
                page.drawText(line.replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, ' '), {
                    x: margin, y: pageHeight - margin - (i + 1) * lineHeight, font, size
                });
            });
        }
    }
    return doc.save();
}
