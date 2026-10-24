"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = require("node:assert");
const core_1 = require("../src/core");
const s = { name: 'QPJOBLOG', number: 1, job: '633616/GGUILLEN/IARSCOPE', user: 'GGUILLEN', status: 'READY', pages: 75, created: '' };
(0, node_test_1.test)('qualified job and spool', () => node_assert_1.strict.match((0, core_1.command)(s, 'delete'), /JOB\(633616\/GGUILLEN\/IARSCOPE\) SPLNBR\(1\)/));
(0, node_test_1.test)('copy to stream file', () => node_assert_1.strict.match((0, core_1.command)(s, 'copy', '/tmp/a'), /TOFILE\(\*TOSTMF\)/));
(0, node_test_1.test)('all supported encodings', () => { for (const c of [37, 284, 1208])
    node_assert_1.strict.match((0, core_1.iconvCommand)('/tmp/a', '/tmp/b', 37, c), /iconv -f IBM-037/); });
(0, node_test_1.test)('reject unsafe IFS paths', () => { for (const p of ["/tmp/a'b", 'relative', '/tmp/../etc', '/tmp/a\n', '/tmp/$(id)'])
    node_assert_1.strict.throws(() => (0, core_1.path)(p)); });
(0, node_test_1.test)('reject malicious job', () => node_assert_1.strict.throws(() => (0, core_1.command)({ ...s, job: '123456/TEST/PGM);DLTUSRPRF' }, 'delete')));
(0, node_test_1.test)('map SQL row', () => node_assert_1.strict.equal((0, core_1.mapRow)({ spooled_file_name: 'QPRINT', file_number: 1, job_name: s.job, user_name: 'GGUILLEN', status: 'READY', total_pages: 2 }).pages, 2));
(0, node_test_1.test)('invalid identifier includes empty value', () => node_assert_1.strict.throws(() => { const { name } = require('../src/core'); name(''); }, /identifier: \"\"/));
// Regression: CPD0078/CPD0074 when SQL qualified job is passed directly to CL JOB().
(0, node_test_1.test)('CPYSPLF uses verified IBM i number/user/name order for interactive job', () => {
    const interactive = { ...s, job: '684728/GGUILLEN/QPADEV000G' };
    const cl = (0, core_1.command)(interactive, 'copy', '/tmp/selected-spool.txt');
    node_assert_1.strict.match(cl, /JOB\(684728\/GGUILLEN\/QPADEV000G\)/);
    node_assert_1.strict.doesNotMatch(cl, /JOB\(QPADEV000G\/GGUILLEN\/684728\)/);
});
(0, node_test_1.test)('DLTSPLF uses verified number/user/name ordering', () => {
    node_assert_1.strict.match((0, core_1.command)({ ...s, job: '684728/GGUILLEN/QPADEV000G' }, 'delete'), /JOB\(684728\/GGUILLEN\/QPADEV000G\)/);
});
(0, node_test_1.test)('copy command preserves IBM i qualified job ordering', () => { const cl = (0, core_1.command)({ ...s, job: '879891/GGUILLEN/QPADEV000V' }, 'copy', '/tmp/a'); node_assert_1.strict.match(cl, /JOB\(879891\/GGUILLEN\/QPADEV000V\)/); node_assert_1.strict.doesNotMatch(cl, /JOB\(QPADEV000V\/GGUILLEN\/879891\)/); });
(0, node_test_1.test)('SQL FILE_NUMBER 2 is preserved in CPYSPLF', () => {
    const row = (0, core_1.mapRow)({ SPOOLED_FILE_NAME: 'QPJOBLOG', FILE_NUMBER: 2, JOB_NAME: '879891/GGUILLEN/QPADEV000V', USER_NAME: 'GGUILLEN', STATUS: 'READY', TOTAL_PAGES: 1 });
    node_assert_1.strict.equal(row.number, 2);
    node_assert_1.strict.match((0, core_1.command)(row, 'copy', '/tmp/test.txt'), /JOB\(879891\/GGUILLEN\/QPADEV000V\) SPLNBR\(2\)/);
});
(0, node_test_1.test)('missing or invalid FILE_NUMBER is rejected rather than defaulting to 1', () => {
    for (const v of ['', undefined, '*ONLY', '0', 'NaN'])
        node_assert_1.strict.throws(() => (0, core_1.mapRow)({ SPOOLED_FILE_NAME: 'QPJOBLOG', FILE_NUMBER: v, JOB_NAME: '879891/GGUILLEN/QPADEV000V', USER_NAME: 'GGUILLEN' }), /FILE_NUMBER/);
});
