import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolveSpool } from '../src/selection';
import { Spool } from '../src/core';
const spool: Spool = { name: 'QPJOBLOG', number: 1, job: '633616/GGUILLEN/IARSCOPE', user: 'GGUILLEN', status: 'READY', pages: 75, created: '' };
test('double click argument is Spool', () => assert.equal(resolveSpool(spool), spool));
test('context menu argument is TreeItem', () => assert.equal(resolveSpool({ spool, label: 'QPJOBLOG #1' }), spool));
test('reject missing argument', () => assert.throws(() => resolveSpool(undefined), /No spool selected/));
test('reject invalid wrapped spool', () => assert.throws(() => resolveSpool({ spool: { number: 1 } }), /missing name/));
