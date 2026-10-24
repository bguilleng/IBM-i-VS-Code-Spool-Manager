"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.splitPages = splitPages;
exports.parsePages = parsePages;
exports.selectPages = selectPages;
exports.asUtf8Txt = asUtf8Txt;
exports.verifiedPages = verifiedPages;
/** Pure text-page processing. Page numbers are one-based. */
function splitPages(text) {
    const normalized = text.replace(/\r\n?/g, '\n');
    return normalized.split('\f');
}
function parsePages(input, total) {
    if (!Number.isSafeInteger(total) || total < 1)
        throw new Error('Invalid page count');
    if (!input.trim())
        throw new Error('Specify at least one page');
    const selected = new Set();
    for (const part of input.split(',')) {
        const match = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
        if (!match)
            throw new Error(`Invalid page selection: ${part}`);
        const first = Number(match[1]), last = match[2] ? Number(match[2]) : first;
        if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first < 1 || last > total || first > last) {
            throw new Error(`Pages must be between 1 and ${total}`);
        }
        for (let p = first; p <= last; p++)
            selected.add(p);
    }
    return [...selected].sort((a, b) => a - b);
}
function selectPages(pages, selection) {
    return selection.map(p => {
        if (!Number.isInteger(p) || p < 1 || p > pages.length)
            throw new Error('Page outside document');
        return pages[p - 1];
    });
}
function asUtf8Txt(pages) {
    return Buffer.from(pages.join('\f'), 'utf8');
}
/** Only form-feed boundaries matching IBM i's page count are trustworthy. */
function verifiedPages(text, reportedPages) {
    const pages = splitPages(text);
    return Number.isSafeInteger(reportedPages) && reportedPages > 0 && pages.length === reportedPages ? pages : undefined;
}
