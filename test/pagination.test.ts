import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {parseFcfc} from '../src/pagination';
test('FCFC splits only explicit new-page control records',()=>{
 const result=parseFcfc('1Page one\r\n line two\r\n1Page two\r\n',2);
 assert.deepEqual(result.pages,['Page one\nline two','Page two']);
});
test('FCFC rejects page-count mismatch',()=>assert.throws(()=>parseFcfc('1Only page\n',6),/FCFC extracted 1/));
test('FCFC rejects unrecognized controls',()=>assert.throws(()=>parseFcfc('Xwrong\n',1),/Unexpected FCFC/));
test('FCFC rejects overprinting',()=>assert.throws(()=>parseFcfc('1first\n+overprint\n',1),/overprint/));
