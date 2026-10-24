import {test} from 'node:test';import {strict as assert} from 'node:assert';
import {command,iconvCommand,path,mapRow,Spool} from '../src/core';
const s:Spool={name:'QPJOBLOG',number:1,job:'633616/GGUILLEN/IARSCOPE',user:'GGUILLEN',status:'READY',pages:75,created:''};
test('qualified job and spool',()=>assert.match(command(s,'delete'),/JOB\(633616\/GGUILLEN\/IARSCOPE\) SPLNBR\(1\)/));
test('copy to stream file',()=>assert.match(command(s,'copy','/tmp/a'),/TOFILE\(\*TOSTMF\)/));
test('all supported encodings',()=>{for(const c of [37,284,1208] as const)assert.match(iconvCommand('/tmp/a','/tmp/b',37,c),/iconv -f IBM-037/)});
test('reject unsafe IFS paths',()=>{for(const p of ["/tmp/a'b",'relative','/tmp/../etc','/tmp/a\n','/tmp/$(id)'])assert.throws(()=>path(p))});
test('reject malicious job',()=>assert.throws(()=>command({...s,job:'123456/TEST/PGM);DLTUSRPRF'},'delete')));
test('map SQL row',()=>assert.equal(mapRow({spooled_file_name:'QPRINT',file_number:1,job_name:s.job,user_name:'GGUILLEN',status:'READY',total_pages:2}).pages,2));

test('invalid identifier includes empty value',()=>assert.throws(()=>{const {name}=require('../src/core');name('')},/identifier: \"\"/));

// Regression: CPD0078/CPD0074 when SQL qualified job is passed directly to CL JOB().
test('CPYSPLF uses verified IBM i number/user/name order for interactive job', () => {
 const interactive={...s,job:'684728/GGUILLEN/QPADEV000G'};
 const cl=command(interactive,'copy','/tmp/selected-spool.txt');
 assert.match(cl,/JOB\(684728\/GGUILLEN\/QPADEV000G\)/);
 assert.doesNotMatch(cl,/JOB\(QPADEV000G\/GGUILLEN\/684728\)/);
});
test('DLTSPLF uses verified number/user/name ordering', () => {
 assert.match(command({...s,job:'684728/GGUILLEN/QPADEV000G'},'delete'),/JOB\(684728\/GGUILLEN\/QPADEV000G\)/);
});

test('copy command preserves IBM i qualified job ordering',()=>{const cl=command({...s,job:'879891/GGUILLEN/QPADEV000V'},'copy','/tmp/a');assert.match(cl,/JOB\(879891\/GGUILLEN\/QPADEV000V\)/);assert.doesNotMatch(cl,/JOB\(QPADEV000V\/GGUILLEN\/879891\)/);});

test('SQL FILE_NUMBER 2 is preserved in CPYSPLF',()=>{
 const row=mapRow({SPOOLED_FILE_NAME:'QPJOBLOG',FILE_NUMBER:2,JOB_NAME:'879891/GGUILLEN/QPADEV000V',USER_NAME:'GGUILLEN',STATUS:'READY',TOTAL_PAGES:1});
 assert.equal(row.number,2);
 assert.match(command(row,'copy','/tmp/test.txt'),/JOB\(879891\/GGUILLEN\/QPADEV000V\) SPLNBR\(2\)/);
});
test('missing or invalid FILE_NUMBER is rejected rather than defaulting to 1',()=>{
 for(const v of ['',undefined,'*ONLY','0','NaN'])assert.throws(()=>mapRow({SPOOLED_FILE_NAME:'QPJOBLOG',FILE_NUMBER:v,JOB_NAME:'879891/GGUILLEN/QPADEV000V',USER_NAME:'GGUILLEN'}),/FILE_NUMBER/);
});
