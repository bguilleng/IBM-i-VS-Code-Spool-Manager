import * as vscode from 'vscode';
import {Spool,Ccsid,name,mapRow,command,fcfcCopyCommand,iconvCommand,path} from './core';

type CmdResult={code:number;stderr:string;stdout:string};
export type Connection={
 runSQL(sql:string):Promise<Record<string,unknown>[]>;
 runCommand(o:{command:string;environment:'ile'|'pase'}):Promise<CmdResult>;
 getContent():{downloadStreamfileRaw(remotePath:string):Promise<Uint8Array>};
 withTempDirectory<T>(fn:(dir:string)=>Promise<T>):Promise<T>;
 getConfig?():{username?:string;user?:string};
};
export async function base():Promise<{getConnection():Connection|undefined;subscribe?(ctx:vscode.ExtensionContext,event:string,label:string,fn:()=>void):void}>{
 const ext=vscode.extensions.getExtension('halcyontechltd.code-for-ibmi');
 if(!ext)throw Error('Code for IBM i not installed');
 if(!ext.isActive)await ext.activate();
 const api=ext.exports as {instance?:unknown};
 if(!api.instance)throw Error('Code for IBM i API unavailable');
 return api.instance as Awaited<ReturnType<typeof base>>;
}
async function connection():Promise<Connection>{
 const c=(await base()).getConnection();
 if(!c)throw Error('Connect using Code for IBM i');
 return c;
}
/** Tolerate SQL column aliases with quoted, padded or qualified names. */
export function sqlValue(row:Record<string,unknown>,key:string):string {
 const wanted=key.toUpperCase();
 const entry=Object.entries(row).find(([k])=>k.trim().replace(/^.*[.]/,'').replace(/[^A-Za-z0-9_]/g,'').toUpperCase()===wanted);
 return String(entry?.[1]??'').trim();
}
/** Obtain identity from the active Code for IBM i connection; SQL is used as a cross-check. */
export async function connectedUser(c:Connection):Promise<string>{
 const cfg=c.getConfig?.();
 const configUser=String(cfg?.username??cfg?.user??'').trim();
 let sqlUser='';
 let sqlKeys='';
 try {
  const rows=await c.runSQL('SELECT SESSION_USER AS IBM_USER FROM SYSIBM.SYSDUMMY1');
  if(rows.length){sqlKeys=Object.keys(rows[0]).join(', ');sqlUser=sqlValue(rows[0],'IBM_USER');
   // Some SQL wrappers return an expression column under SESSION_USER.
   if(!sqlUser)sqlUser=sqlValue(rows[0],'SESSION_USER');
   // If exactly one scalar column was returned, its value is unambiguous.
   if(!sqlUser && Object.keys(rows[0]).length===1)sqlUser=String(Object.values(rows[0])[0]??'').trim();
  }
 } catch(e){
  if(!configUser)throw new Error('Cannot identify IBM i session: '+String(e));
 }
 if(!configUser && !sqlUser)throw new Error(`Cannot determine IBM i session user; SQL columns: ${sqlKeys||'(none)'}`);
 const u=name(configUser||sqlUser);
 if(sqlUser && name(sqlUser)!==u)throw new Error(`Connected profile mismatch: configuration=${u}, SQL=${name(sqlUser)}`);
 return u;
}
/** Emit the exact command before execution so installed-version drift is observable. */
let diagnostic: ((message:string)=>void) | undefined;
export function setDiagnostics(write:(message:string)=>void):void { diagnostic=write; }
async function run(c:Connection,cmd:string,environment:'ile'|'pase'='ile'){
 diagnostic?.(`[${environment}] ${cmd}`);
 const r=await c.runCommand({command:cmd,environment});
 if(r.code!==0){
  const detail=[r.stderr,r.stdout].filter(Boolean).join(' | ');
  diagnostic?.(`[FAILED ${r.code}] ${detail}`);
  if (/CPD000D/i.test(detail)) throw Error(`IBM i rejected a command in a multithreaded job (CPD000D). Execute it from a safe single-threaded IBM i job; no automatic retry. Command: ${cmd}. Details: ${detail}`);
  if (/CPD0078|CPD0074/i.test(detail)) throw Error(`IBM i rejected the JOB qualifier. Check the EXACT logged command in Output > IBM i Spool Manager. Sent: ${cmd}. Details: ${detail}`);
  throw Error(`${environment} command failed (${r.code}); command: ${cmd}; details: ${detail}`);
 }
}
export class Service {
 async list():Promise<Spool[]>{
  const c=await connection(),u=await connectedUser(c);
  const rows=await c.runSQL(`SELECT SPOOLED_FILE_NAME,FILE_NUMBER,JOB_NAME,USER_NAME,STATUS,TOTAL_PAGES,CREATE_TIMESTAMP FROM QSYS2.OUTPUT_QUEUE_ENTRIES_BASIC WHERE USER_NAME='${u}' ORDER BY CREATE_TIMESTAMP DESC FETCH FIRST 1000 ROWS ONLY`);
  const spools=rows.map((row,index)=>{
   try { return mapRow(row); }
   catch(error) { diagnostic?.(`[LIST INVALID ROW ${index}] keys=${Object.keys(row).join(', ')} error=${String(error)}`); throw error; }
  }).filter(s=>s.user===u);
  diagnostic?.(`[LIST] connected=${u} count=${spools.length}`);
  for(const spool of spools) diagnostic?.(`[SPOOL] job=${spool.job} file=${spool.name} FILE_NUMBER=${spool.number}`);
  return spools;
 }
 private async guard(c:Connection,s:Spool):Promise<void>{
  const u=await connectedUser(c);
  if(name(s.user)!==u)throw Error(`Spool user ${s.user} differs from connected user ${u}`);
  const rows=await c.runSQL(`SELECT USER_NAME FROM QSYS2.OUTPUT_QUEUE_ENTRIES_BASIC WHERE USER_NAME='${u}' AND JOB_NAME='${s.job}' AND SPOOLED_FILE_NAME='${name(s.name)}' AND FILE_NUMBER=${s.number} FETCH FIRST 1 ROW ONLY`);
  if(rows.length!==1)throw Error('Spool no longer accessible to this user');
  const owner=sqlValue(rows[0],'USER_NAME')||(Object.keys(rows[0]).length===1?String(Object.values(rows[0])[0]??'').trim():'');
  if(!owner||name(owner)!==u)throw Error('Spool user verification failed');
  diagnostic?.(`[GUARD OK] job=${s.job} file=${s.name} SPLNBR=${s.number} user=${u}`);
 }
 async remove(s:Spool):Promise<void>{const c=await connection();await this.guard(c,s);await run(c,command(s,'delete'));}
 private async copyConverted(c:Connection,s:Spool,dst:string,ccsid:Ccsid,existingDir?:string):Promise<void>{
  path(dst);await this.guard(c,s);
  const from=vscode.workspace.getConfiguration('ibmiSpool').get<Ccsid>('sourceCcsid',37);
  if(![37,284,1208].includes(from))throw Error('Unsupported source CCSID');
  const execute=async(dir:string)=>{
   const src=`${dir}/spool-source.txt`;
   diagnostic?.(`[COPY SELECTED] job=${s.job} file=${s.name} SPLNBR=${s.number}`);
   await run(c,command(s,'copy',src));
   await run(c,iconvCommand(src,dst,from,ccsid),'pase');
   await run(c,`QSYS/CHGATR OBJ('${path(dst)}') ATR(*CCSID) VALUE(${ccsid})`);
  };
  if(existingDir)await execute(existingDir);else await c.withTempDirectory(execute);
 }
 /** Extract a separate FCFC-controlled stream; never change normal preview/export behavior. */
 async pageControlledText(s:Spool):Promise<string>{
  const c=await connection();
  await this.guard(c,s);
  const from=vscode.workspace.getConfiguration('ibmiSpool').get<Ccsid>('sourceCcsid',37);
  if(![37,284,1208].includes(from))throw Error('Unsupported source CCSID');
  return c.withTempDirectory(async dir=>{
   const raw=`${dir}/spool-fcfc.raw`, utf8=`${dir}/spool-fcfc.utf8`;
   diagnostic?.(`[FCFC COPY] job=${s.job} SPLNBR=${s.number}`);
   await run(c,fcfcCopyCommand(s,raw));
   await run(c,iconvCommand(raw,utf8,from,1208),'pase');
   const bytes=await c.getContent().downloadStreamfileRaw(utf8);
   return Buffer.from(bytes).toString('utf8');
  });
 }
 async export(s:Spool,dst:string,ccsid:Ccsid):Promise<void>{const c=await connection();await this.copyConverted(c,s,dst,ccsid);}
 async preview(s:Spool):Promise<string>{
  const c=await connection();return c.withTempDirectory(async dir=>{
   const dst=`${dir}/spool-utf8.txt`;
   await this.copyConverted(c,s,dst,1208,dir);
   const content=c.getContent();
   if(typeof content.downloadStreamfileRaw!=='function')throw Error('Code for IBM i does not expose downloadStreamfileRaw');
   const bytes=await content.downloadStreamfileRaw(dst);
   return Buffer.from(bytes).toString('utf8');
  });
 }
}
