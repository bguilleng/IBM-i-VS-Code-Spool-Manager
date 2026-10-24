"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.name = name;
exports.job = job;
exports.path = path;
exports.command = command;
exports.mapRow = mapRow;
exports.quoteShell = quoteShell;
exports.iconvCommand = iconvCommand;
exports.spoolNumber = spoolNumber;
exports.fcfcCopyCommand = fcfcCopyCommand;
function name(v) { const s = String(v ?? '').trim().toUpperCase(); if (!/^[A-Z0-9_$#@]{1,10}$/.test(s))
    throw Error('Invalid IBM i identifier: ' + JSON.stringify(v)); return s; }
function job(v) { const p = String(v).trim().split('/'); if (p.length !== 3 || !/^\d{6}$/.test(p[0]))
    throw Error('Invalid job'); return `${p[0]}/${name(p[1])}/${name(p[2])}`; }
function path(v) { if (typeof v !== 'string' || !v.startsWith('/') || v.length > 1024 || /[\x00-\x1f\x7f'\\*?`$]/.test(v) || v.split('/').includes('..'))
    throw Error('Invalid IFS path'); return v; }
function command(s, op, target) {
    if (!Number.isInteger(s.number) || s.number < 1 || s.number > 999999)
        throw Error('Invalid spool number');
    // Verified on IBM i 7.5: JOB(number/user/name), SPLNBR(exact FILE_NUMBER).
    const id = `FILE(${name(s.name)}) JOB(${job(s.job)}) SPLNBR(${s.number})`;
    if (op === 'delete')
        return `QSYS/DLTSPLF ${id}`;
    if (!target)
        throw Error('IFS destination required');
    return `QSYS/CPYSPLF ${id} TOFILE(*TOSTMF) TOSTMF('${path(target)}') STMFOPT(*NONE)`;
}
function mapRow(r) {
    const get = (k) => String(Object.entries(r).find(([key]) => key.trim().replace(/^.*[.]/, '').replace(/[^A-Za-z0-9_]/g, '').toUpperCase() === k)?.[1] ?? '').trim();
    return { name: name(get('SPOOLED_FILE_NAME')), number: spoolNumber(get('FILE_NUMBER')), job: job(get('JOB_NAME')), user: name(get('USER_NAME')), status: get('STATUS'), pages: Number(get('TOTAL_PAGES')), created: get('CREATE_TIMESTAMP') };
}
function quoteShell(v) { return "'" + path(v).replace(/'/g, "'\\''") + "'"; }
function iconvCommand(src, dst, from, to) {
    const allowed = [37, 284, 1208];
    if (!allowed.includes(from) || !allowed.includes(to) || src === dst)
        throw Error('Invalid conversion');
    const enc = (c) => c === 1208 ? 'UTF-8' : `IBM-${String(c).padStart(3, '0')}`;
    return `iconv -f ${enc(from)} -t ${enc(to)} ${quoteShell(src)} > ${quoteShell(dst)}`;
}
/** Never default a missing/invalid SQL FILE_NUMBER to 1. */
function spoolNumber(value) {
    const raw = String(value ?? '').trim();
    if (!/^[0-9]{1,6}$/.test(raw))
        throw Error(`Invalid FILE_NUMBER from IBM i: ${JSON.stringify(value)}`);
    const n = Number(raw);
    if (!Number.isSafeInteger(n) || n < 1 || n > 999999)
        throw Error(`Invalid FILE_NUMBER from IBM i: ${JSON.stringify(value)}`);
    return n;
}
/** FCFC output requests first-character form control for each printed record. */
function fcfcCopyCommand(s, target) {
    return command(s, 'copy', target) + ' CTLCHAR(*FCFC)';
}
