"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseFcfc = parseFcfc;
function parseFcfc(text, expected) {
    if (!Number.isSafeInteger(expected) || expected < 1)
        throw Error('Invalid spool page count');
    const records = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    if (records.at(-1) === '')
        records.pop();
    if (!records.length)
        throw Error('FCFC extraction returned no records');
    const pages = [[]];
    let first = true;
    for (const record of records) {
        if (!record)
            throw Error('FCFC record without control character');
        const ctl = record[0], content = record.slice(1);
        if (![' ', '0', '1', '+', '-'].includes(ctl))
            throw Error(`Unexpected FCFC control: ${JSON.stringify(ctl)}`);
        if (ctl === '1' && !first)
            pages.push([]);
        // ASA: 1=new page, 0=double space, -=triple space, +=overprint.
        // Overprinting cannot be faithfully rendered as plain text; reject rather than corrupt.
        if (ctl === '+')
            throw Error('FCFC overprint cannot be represented safely as plain text');
        if (ctl === '0' && !first)
            pages.at(-1).push('');
        if (ctl === '-' && !first)
            pages.at(-1).push('', '');
        pages.at(-1).push(content);
        first = false;
    }
    if (pages.length !== expected)
        throw Error(`FCFC extracted ${pages.length} page(s); IBM i reports ${expected}. Refusing inaccurate page selection.`);
    return { pages: pages.map(lines => lines.join('\n')), method: 'fcfc' };
}
