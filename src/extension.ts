import * as vscode from 'vscode';
import { Spool, Ccsid } from './core';
import { Service, base } from './service';
import { splitPages, verifiedPages, parsePages, selectPages, asUtf8Txt } from './download';
import { asPdf } from './pdf';
import { parseFcfc } from './pagination';
import { resolveSpool } from './selection';

class Item extends vscode.TreeItem {
  constructor(public readonly spool: Spool) {
    super(`${spool.name} #${spool.number}`);
    this.contextValue = 'spool';
    this.description = `${spool.status} · ${spool.pages} pages`;
    this.tooltip = `${spool.job} · ${spool.created}`;
    this.command = { command: 'spool.open', title: 'Open', arguments: [spool] };
    this.iconPath = new vscode.ThemeIcon('file-text');
  }
}
class Tree implements vscode.TreeDataProvider<Item> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  constructor(private readonly svc: Service, private readonly log: vscode.OutputChannel) {}
  refresh(): void { this.changed.fire(); }
  getTreeItem(item: Item): vscode.TreeItem { return item; }
  async getChildren(): Promise<Item[]> {
    try { return (await this.svc.list()).map(s => new Item(s)); }
    catch (e) { this.log.appendLine(`List failed: ${String(e)}`); void vscode.window.showErrorMessage(String(e)); return []; }
  }
}

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
  const log = vscode.window.createOutputChannel('IBM i Spool Manager');
  ctx.subscriptions.push(log);
  log.appendLine('Activating IBM i Spool Manager v0.3.7');
  const svc = new Service();
  const tree = new Tree(svc, log);
  ctx.subscriptions.push(vscode.window.registerTreeDataProvider('ibmiSpool.files', tree));
  log.appendLine('TreeDataProvider registered: ibmiSpool.files');

  const register = (id: string, fn: (...args: unknown[]) => Promise<void> | void): void => {
    ctx.subscriptions.push(vscode.commands.registerCommand(`spool.${id}`, fn));
  };
  const report = (operation: string, e: unknown): void => {
    log.appendLine(`${operation} failed: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
    void vscode.window.showErrorMessage(`${operation} failed: ${String(e)}`);
  };

  register('refresh', () => tree.refresh());
  register('open', async selected => {
    try {
      const s = resolveSpool(selected);
      const content = await svc.preview(s);
      const doc = await vscode.workspace.openTextDocument({ language: 'plaintext', content });
      await vscode.window.showTextDocument(doc);
    } catch (e) { report('Open', e); }
  });
  register('remove', async selected => {
    try {
      const s = resolveSpool(selected);
      if (await vscode.window.showWarningMessage(`Delete ${s.name} #${s.number} from ${s.job}?`, { modal: true }, 'Delete') !== 'Delete') return;
      await svc.remove(s);
      tree.refresh();
    } catch (e) { report('Delete', e); }
  });

  async function download(selected: unknown, onlyPages: boolean): Promise<void> {
    try {
      // Menu context passes Item (with .spool); double-click passes Spool directly.
      const s = resolveSpool(selected);
      const format = await vscode.window.showQuickPick(['TXT (UTF-8)', 'PDF (searchable text)'], { placeHolder: 'Local download format' });
      if (!format) return;
      const content = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Reading spool text' }, () => svc.preview(s));
      // Full downloads never require original page separators.
      // PDF is a text rendering and may repaginate when separators are absent.
      const pages = splitPages(content);
      let chosen = pages;
      if (onlyPages) {
        let verified = verifiedPages(content, s.pages);
        if (!verified) {
          log.appendLine(`[PAGINATION] No form feeds; attempting CPYSPLF CTLCHAR(*FCFC) for ${s.job} #${s.number}`);
          try {
            const fcfc = await svc.pageControlledText(s);
            verified = parseFcfc(fcfc, s.pages).pages;
            log.appendLine(`[PAGINATION] FCFC verified ${verified.length} pages`);
          } catch (cause) {
            throw new Error(`Cannot safely select original pages. FCFC extraction failed or page count did not match: ${String(cause)}. Complete TXT/PDF download remains available.`);
          }
        }
        const selection = await vscode.window.showInputBox({
          prompt: `Select pages (1-${verified.length}), e.g. 1,3-5`,
          placeHolder: '1,3-5',
          validateInput: value => { try { parsePages(value, verified.length); return null; } catch (e) { return String(e); } }
        });
        if (selection === undefined) return;
        chosen = selectPages(verified, parsePages(selection, verified.length));
      } else if (s.pages > 1 && pages.length !== s.pages) {
        log.appendLine(`[PAGINATION] ${s.job} ${s.name} #${s.number}: IBM i=${s.pages}; text segments=${pages.length}. Full export allowed; original page boundaries not guaranteed.`);
      }
      const ext = format.startsWith('TXT') ? 'txt' : 'pdf';
      const suggested = `${s.name}-${s.number}${onlyPages ? '-pages' : ''}.${ext}`;
      const uri = await vscode.window.showSaveDialog({
        saveLabel: 'Download spool', defaultUri: vscode.Uri.file(suggested),
        filters: ext === 'txt' ? { 'UTF-8 text': ['txt'] } : { PDF: ['pdf'] }
      });
      if (!uri) return;
      const bytes = ext === 'txt' ? asUtf8Txt(chosen) : await asPdf(chosen);
      await vscode.workspace.fs.writeFile(uri, bytes);
      void vscode.window.showInformationMessage(`Saved ${onlyPages ? `selected ${chosen.length} page(s)` : `complete spool (reported ${s.pages} page(s); original boundaries may not be preserved)`} to ${uri.fsPath}`);
    } catch (e) { report('Download', e); }
  }
  register('download', async (selected, onlyPages) => { await download(selected, onlyPages === true); });
  register('downloadPages', async selected => { await download(selected, true); });
  register('export', async selected => {
    try {
      const s = resolveSpool(selected);
      const encoding = await vscode.window.showQuickPick([
        { label: 'UTF-8', ccsid: 1208 },
        { label: 'EBCDIC US', ccsid: 37 },
        { label: 'EBCDIC Spain', ccsid: 284 }
      ]);
      if (!encoding) return;
      const dst = await vscode.window.showInputBox({ prompt: 'IFS absolute destination path (new file)', value: `/home/${s.user}/${s.name}-${s.number}.txt` });
      if (!dst) return;
      await svc.export(s, dst, encoding.ccsid as Ccsid);
      void vscode.window.showInformationMessage(`Exported to ${dst}`);
    } catch (e) { report('IFS export', e); }
  });
  try {
    const instance = await base();
    instance.subscribe?.(ctx, 'connected', 'Spool manager refresh', () => tree.refresh());
    instance.subscribe?.(ctx, 'disconnected', 'Spool manager clear', () => tree.refresh());
  } catch (e) { log.appendLine(`Connection subscriptions unavailable: ${String(e)}`); }
}
export function deactivate(): void {}
