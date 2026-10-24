"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = require("node:assert");
const download_1 = require("../src/download");
const pdf_1 = require("../src/pdf");
(0, node_test_1.test)('split by form-feed and retain page order', () => node_assert_1.strict.deepEqual((0, download_1.splitPages)('á\fñ\f€'), ['á', 'ñ', '€']));
(0, node_test_1.test)('parse ranges and remove duplicates', () => node_assert_1.strict.deepEqual((0, download_1.parsePages)('3,1-2,2', 4), [1, 2, 3]));
(0, node_test_1.test)('reject invalid page numbers', () => { node_assert_1.strict.throws(() => (0, download_1.parsePages)('0', 3)); node_assert_1.strict.throws(() => (0, download_1.parsePages)('4', 3)); node_assert_1.strict.throws(() => (0, download_1.parsePages)('2-1', 3)); });
(0, node_test_1.test)('UTF8 selection', () => node_assert_1.strict.equal(Buffer.from((0, download_1.asUtf8Txt)((0, download_1.selectPages)(['á', 'ñ'], [2]))).toString('utf8'), 'ñ'));
(0, node_test_1.test)('PDF contains selected page(s)', async () => { const bytes = await (0, pdf_1.asPdf)(['first', 'second']); node_assert_1.strict.equal(Buffer.from(bytes).subarray(0, 5).toString(), '%PDF-'); });
(0, node_test_1.test)('only allow original-page selection when boundaries match metadata', () => {
    node_assert_1.strict.equal((0, download_1.verifiedPages)('page1\npage2', 6), undefined);
    node_assert_1.strict.equal((0, download_1.verifiedPages)('a\fb', 3), undefined);
    node_assert_1.strict.deepEqual((0, download_1.verifiedPages)('a\fb', 2), ['a', 'b']);
});
