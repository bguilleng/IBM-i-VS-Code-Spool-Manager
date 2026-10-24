import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {splitPages,verifiedPages,parsePages,selectPages,asUtf8Txt} from '../src/download';
import {asPdf} from '../src/pdf';
test('split by form-feed and retain page order',()=>assert.deepEqual(splitPages('á\fñ\f€'),['á','ñ','€']));
test('parse ranges and remove duplicates',()=>assert.deepEqual(parsePages('3,1-2,2',4),[1,2,3]));
test('reject invalid page numbers',()=>{assert.throws(()=>parsePages('0',3));assert.throws(()=>parsePages('4',3));assert.throws(()=>parsePages('2-1',3));});
test('UTF8 selection',()=>assert.equal(Buffer.from(asUtf8Txt(selectPages(['á','ñ'],[2]))).toString('utf8'),'ñ'));
test('PDF contains selected page(s)',async()=>{const bytes=await asPdf(['first','second']);assert.equal(Buffer.from(bytes).subarray(0,5).toString(),'%PDF-');});

test('only allow original-page selection when boundaries match metadata',()=>{
 assert.equal(verifiedPages('page1\npage2',6),undefined);
 assert.equal(verifiedPages('a\fb',3),undefined);
 assert.deepEqual(verifiedPages('a\fb',2),['a','b']);
});
