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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const service_1 = require("./service");
const download_1 = require("./download");
const pdf_1 = require("./pdf");
const pagination_1 = require("./pagination");
const selection_1 = require("./selection");
class Item extends vscode.TreeItem {
    spool;
    constructor(spool) {
        super(`${spool.name} #${spool.number}`);
        this.spool = spool;
        this.contextValue = 'spool';
        this.description = `${spool.status} · ${spool.pages} pages`;
        this.tooltip = `${spool.job} · ${spool.created}`;
        this.command = { command: 'spool.open', title: 'Open', arguments: [spool] };
        this.iconPath = new vscode.ThemeIcon('file-text');
    }
}
class Tree {
    svc;
    log;
    changed = new vscode.EventEmitter();
    onDidChangeTreeData = this.changed.event;
    constructor(svc, log) {
        this.svc = svc;
        this.log = log;
    }
    refresh() { this.changed.fire(); }
    getTreeItem(item) { return item; }
    async getChildren() {
        try {
            return (await this.svc.list()).map(s => new Item(s));
        }
        catch (e) {
            this.log.appendLine(`List failed: ${String(e)}`);
            void vscode.window.showErrorMessage(String(e));
            return [];
        }
    }
}
async function activate(ctx) {
    const log = vscode.window.createOutputChannel('IBM i Spool Manager');
    ctx.subscriptions.push(log);
    log.appendLine('Activating IBM i Spool Manager v0.3.7');
    const svc = new service_1.Service();
    const tree = new Tree(svc, log);
    ctx.subscriptions.push(vscode.window.registerTreeDataProvider('ibmiSpool.files', tree));
    log.appendLine('TreeDataProvider registered: ibmiSpool.files');
    const register = (id, fn) => {
        ctx.subscriptions.push(vscode.commands.registerCommand(`spool.${id}`, fn));
    };
    const report = (operation, e) => {
        log.appendLine(`${operation} failed: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
        void vscode.window.showErrorMessage(`${operation} failed: ${String(e)}`);
    };
    register('refresh', () => tree.refresh());
    register('open', async (selected) => {
        try {
            const s = (0, selection_1.resolveSpool)(selected);
            const content = await svc.preview(s);
            const doc = await vscode.workspace.openTextDocument({ language: 'plaintext', content });
            await vscode.window.showTextDocument(doc);
        }
        catch (e) {
            report('Open', e);
        }
    });
    register('remove', async (selected) => {
        try {
            const s = (0, selection_1.resolveSpool)(selected);
            if (await vscode.window.showWarningMessage(`Delete ${s.name} #${s.number} from ${s.job}?`, { modal: true }, 'Delete') !== 'Delete')
                return;
            await svc.remove(s);
            tree.refresh();
        }
        catch (e) {
            report('Delete', e);
        }
    });
    async function download(selected, onlyPages) {
        try {
            // Menu context passes Item (with .spool); double-click passes Spool directly.
            const s = (0, selection_1.resolveSpool)(selected);
            const format = await vscode.window.showQuickPick(['TXT (UTF-8)', 'PDF (searchable text)'], { placeHolder: 'Local download format' });
            if (!format)
                return;
            const content = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Reading spool text' }, () => svc.preview(s));
            // Full downloads never require original page separators.
            // PDF is a text rendering and may repaginate when separators are absent.
            const pages = (0, download_1.splitPages)(content);
            let chosen = pages;
            if (onlyPages) {
                let verified = (0, download_1.verifiedPages)(content, s.pages);
                if (!verified) {
                    log.appendLine(`[PAGINATION] No form feeds; attempting CPYSPLF CTLCHAR(*FCFC) for ${s.job} #${s.number}`);
                    try {
                        const fcfc = await svc.pageControlledText(s);
                        verified = (0, pagination_1.parseFcfc)(fcfc, s.pages).pages;
                        log.appendLine(`[PAGINATION] FCFC verified ${verified.length} pages`);
                    }
                    catch (cause) {
                        throw new Error(`Cannot safely select original pages. FCFC extraction failed or page count did not match: ${String(cause)}. Complete TXT/PDF download remains available.`);
                    }
                }
                const selection = await vscode.window.showInputBox({
                    prompt: `Select pages (1-${verified.length}), e.g. 1,3-5`,
                    placeHolder: '1,3-5',
                    validateInput: value => { try {
                        (0, download_1.parsePages)(value, verified.length);
                        return null;
                    }
                    catch (e) {
                        return String(e);
                    } }
                });
                if (selection === undefined)
                    return;
                chosen = (0, download_1.selectPages)(verified, (0, download_1.parsePages)(selection, verified.length));
            }
            else if (s.pages > 1 && pages.length !== s.pages) {
                log.appendLine(`[PAGINATION] ${s.job} ${s.name} #${s.number}: IBM i=${s.pages}; text segments=${pages.length}. Full export allowed; original page boundaries not guaranteed.`);
            }
            const ext = format.startsWith('TXT') ? 'txt' : 'pdf';
            const suggested = `${s.name}-${s.number}${onlyPages ? '-pages' : ''}.${ext}`;
            const uri = await vscode.window.showSaveDialog({
                saveLabel: 'Download spool', defaultUri: vscode.Uri.file(suggested),
                filters: ext === 'txt' ? { 'UTF-8 text': ['txt'] } : { PDF: ['pdf'] }
            });
            if (!uri)
                return;
            const bytes = ext === 'txt' ? (0, download_1.asUtf8Txt)(chosen) : await (0, pdf_1.asPdf)(chosen);
            await vscode.workspace.fs.writeFile(uri, bytes);
            void vscode.window.showInformationMessage(`Saved ${onlyPages ? `selected ${chosen.length} page(s)` : `complete spool (reported ${s.pages} page(s); original boundaries may not be preserved)`} to ${uri.fsPath}`);
        }
        catch (e) {
            report('Download', e);
        }
    }
    register('download', async (selected, onlyPages) => { await download(selected, onlyPages === true); });
    register('downloadPages', async (selected) => { await download(selected, true); });
    register('export', async (selected) => {
        try {
            const s = (0, selection_1.resolveSpool)(selected);
            const encoding = await vscode.window.showQuickPick([
                { label: 'UTF-8', ccsid: 1208 },
                { label: 'EBCDIC US', ccsid: 37 },
                { label: 'EBCDIC Spain', ccsid: 284 }
            ]);
            if (!encoding)
                return;
            const dst = await vscode.window.showInputBox({ prompt: 'IFS absolute destination path (new file)', value: `/home/${s.user}/${s.name}-${s.number}.txt` });
            if (!dst)
                return;
            await svc.export(s, dst, encoding.ccsid);
            void vscode.window.showInformationMessage(`Exported to ${dst}`);
        }
        catch (e) {
            report('IFS export', e);
        }
    });
    try {
        const instance = await (0, service_1.base)();
        instance.subscribe?.(ctx, 'connected', 'Spool manager refresh', () => tree.refresh());
        instance.subscribe?.(ctx, 'disconnected', 'Spool manager clear', () => tree.refresh());
    }
    catch (e) {
        log.appendLine(`Connection subscriptions unavailable: ${String(e)}`);
    }
}
function deactivate() { }
