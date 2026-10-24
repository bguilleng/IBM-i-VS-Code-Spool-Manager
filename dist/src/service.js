"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Service = void 0;
exports.base = base;
exports.sqlValue = sqlValue;
exports.connectedUser = connectedUser;
exports.setDiagnostics = setDiagnostics;
const vscode = __importStar(require("vscode"));
const core_1 = require("./core");
async function base() {
    const ext = vscode.extensions.getExtension('halcyontechltd.code-for-ibmi');
    if (!ext)
        throw Error('Code for IBM i not installed');
    if (!ext.isActive)
        await ext.activate();
    const api = ext.exports;
    if (!api.instance)
        throw Error('Code for IBM i API unavailable');
    return api.instance;
}
async function connection() {
    const c = (await base()).getConnection();
    if (!c)
        throw Error('Connect using Code for IBM i');
    return c;
}
/** Tolerate SQL column aliases with quoted, padded or qualified names. */
function sqlValue(row, key) {
    const wanted = key.toUpperCase();
    const entry = Object.entries(row).find(([k]) => k.trim().replace(/^.*[.]/, '').replace(/[^A-Za-z0-9_]/g, '').toUpperCase() === wanted);
    return String(entry?.[1] ?? '').trim();
}
/** Obtain identity from the active Code for IBM i connection; SQL is used as a cross-check. */
async function connectedUser(c) {
    const cfg = c.getConfig?.();
    const configUser = String(cfg?.username ?? cfg?.user ?? '').trim();
    let sqlUser = '';
    let sqlKeys = '';
    try {
        const rows = await c.runSQL('SELECT SESSION_USER AS IBM_USER FROM SYSIBM.SYSDUMMY1');
        if (rows.length) {
            sqlKeys = Object.keys(rows[0]).join(', ');
            sqlUser = sqlValue(rows[0], 'IBM_USER');
            // Some SQL wrappers return an expression column under SESSION_USER.
            if (!sqlUser)
                sqlUser = sqlValue(rows[0], 'SESSION_USER');
            // If exactly one scalar column was returned, its value is unambiguous.
            if (!sqlUser && Object.keys(rows[0]).length === 1)
                sqlUser = String(Object.values(rows[0])[0] ?? '').trim();
        }
    }
    catch (e) {
        if (!configUser)
            throw new Error('Cannot identify IBM i session: ' + String(e));
    }
    if (!configUser && !sqlUser)
        throw new Error(`Cannot determine IBM i session user; SQL columns: ${sqlKeys || '(none)'}`);
    const u = (0, core_1.name)(configUser || sqlUser);
    if (sqlUser && (0, core_1.name)(sqlUser) !== u)
        throw new Error(`Connected profile mismatch: configuration=${u}, SQL=${(0, core_1.name)(sqlUser)}`);
    return u;
}
/** Emit the exact command before execution so installed-version drift is observable. */
let diagnostic;
function setDiagnostics(write) { diagnostic = write; }
async function run(c, cmd, environment = 'ile') {
    diagnostic?.(`[${environment}] ${cmd}`);
    const r = await c.runCommand({ command: cmd, environment });
    if (r.code !== 0) {
        const detail = [r.stderr, r.stdout].filter(Boolean).join(' | ');
        diagnostic?.(`[FAILED ${r.code}] ${detail}`);
        if (/CPD000D/i.test(detail))
            throw Error(`IBM i rejected a command in a multithreaded job (CPD000D). Execute it from a safe single-threaded IBM i job; no automatic retry. Command: ${cmd}. Details: ${detail}`);
        if (/CPD0078|CPD0074/i.test(detail))
            throw Error(`IBM i rejected the JOB qualifier. Check the EXACT logged command in Output > IBM i Spool Manager. Sent: ${cmd}. Details: ${detail}`);
        throw Error(`${environment} command failed (${r.code}); command: ${cmd}; details: ${detail}`);
    }
}
class Service {
    async list() {
        const c = await connection(), u = await connectedUser(c);
        const rows = await c.runSQL(`SELECT SPOOLED_FILE_NAME,FILE_NUMBER,JOB_NAME,USER_NAME,STATUS,TOTAL_PAGES,CREATE_TIMESTAMP FROM QSYS2.OUTPUT_QUEUE_ENTRIES_BASIC WHERE USER_NAME='${u}' ORDER BY CREATE_TIMESTAMP DESC FETCH FIRST 1000 ROWS ONLY`);
        const spools = rows.map((row, index) => {
            try {
                return (0, core_1.mapRow)(row);
            }
            catch (error) {
                diagnostic?.(`[LIST INVALID ROW ${index}] keys=${Object.keys(row).join(', ')} error=${String(error)}`);
                throw error;
            }
        }).filter(s => s.user === u);
        diagnostic?.(`[LIST] connected=${u} count=${spools.length}`);
        for (const spool of spools)
            diagnostic?.(`[SPOOL] job=${spool.job} file=${spool.name} FILE_NUMBER=${spool.number}`);
        return spools;
    }
    async guard(c, s) {
        const u = await connectedUser(c);
        if ((0, core_1.name)(s.user) !== u)
            throw Error(`Spool user ${s.user} differs from connected user ${u}`);
        const rows = await c.runSQL(`SELECT USER_NAME FROM QSYS2.OUTPUT_QUEUE_ENTRIES_BASIC WHERE USER_NAME='${u}' AND JOB_NAME='${s.job}' AND SPOOLED_FILE_NAME='${(0, core_1.name)(s.name)}' AND FILE_NUMBER=${s.number} FETCH FIRST 1 ROW ONLY`);
        if (rows.length !== 1)
            throw Error('Spool no longer accessible to this user');
        const owner = sqlValue(rows[0], 'USER_NAME') || (Object.keys(rows[0]).length === 1 ? String(Object.values(rows[0])[0] ?? '').trim() : '');
        if (!owner || (0, core_1.name)(owner) !== u)
            throw Error('Spool user verification failed');
        diagnostic?.(`[GUARD OK] job=${s.job} file=${s.name} SPLNBR=${s.number} user=${u}`);
    }
    async remove(s) { const c = await connection(); await this.guard(c, s); await run(c, (0, core_1.command)(s, 'delete')); }
    async copyConverted(c, s, dst, ccsid, existingDir) {
        (0, core_1.path)(dst);
        await this.guard(c, s);
        const from = vscode.workspace.getConfiguration('ibmiSpool').get('sourceCcsid', 37);
        if (![37, 284, 1208].includes(from))
            throw Error('Unsupported source CCSID');
        const execute = async (dir) => {
            const src = `${dir}/spool-source.txt`;
            diagnostic?.(`[COPY SELECTED] job=${s.job} file=${s.name} SPLNBR=${s.number}`);
            await run(c, (0, core_1.command)(s, 'copy', src));
            await run(c, (0, core_1.iconvCommand)(src, dst, from, ccsid), 'pase');
            await run(c, `QSYS/CHGATR OBJ('${(0, core_1.path)(dst)}') ATR(*CCSID) VALUE(${ccsid})`);
        };
        if (existingDir)
            await execute(existingDir);
        else
            await c.withTempDirectory(execute);
    }
    /** Extract a separate FCFC-controlled stream; never change normal preview/export behavior. */
    async pageControlledText(s) {
        const c = await connection();
        await this.guard(c, s);
        const from = vscode.workspace.getConfiguration('ibmiSpool').get('sourceCcsid', 37);
        if (![37, 284, 1208].includes(from))
            throw Error('Unsupported source CCSID');
        return c.withTempDirectory(async (dir) => {
            const raw = `${dir}/spool-fcfc.raw`, utf8 = `${dir}/spool-fcfc.utf8`;
            diagnostic?.(`[FCFC COPY] job=${s.job} SPLNBR=${s.number}`);
            await run(c, (0, core_1.fcfcCopyCommand)(s, raw));
            await run(c, (0, core_1.iconvCommand)(raw, utf8, from, 1208), 'pase');
            const bytes = await c.getContent().downloadStreamfileRaw(utf8);
            return Buffer.from(bytes).toString('utf8');
        });
    }
    async export(s, dst, ccsid) { const c = await connection(); await this.copyConverted(c, s, dst, ccsid); }
    async preview(s) {
        const c = await connection();
        return c.withTempDirectory(async (dir) => {
            const dst = `${dir}/spool-utf8.txt`;
            await this.copyConverted(c, s, dst, 1208, dir);
            const content = c.getContent();
            if (typeof content.downloadStreamfileRaw !== 'function')
                throw Error('Code for IBM i does not expose downloadStreamfileRaw');
            const bytes = await content.downloadStreamfileRaw(dst);
            return Buffer.from(bytes).toString('utf8');
        });
    }
}
exports.Service = Service;
