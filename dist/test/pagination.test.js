"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = require("node:assert");
const pagination_1 = require("../src/pagination");
(0, node_test_1.test)('FCFC splits only explicit new-page control records', () => {
    const result = (0, pagination_1.parseFcfc)('1Page one\r\n line two\r\n1Page two\r\n', 2);
    node_assert_1.strict.deepEqual(result.pages, ['Page one\nline two', 'Page two']);
});
(0, node_test_1.test)('FCFC rejects page-count mismatch', () => node_assert_1.strict.throws(() => (0, pagination_1.parseFcfc)('1Only page\n', 6), /FCFC extracted 1/));
(0, node_test_1.test)('FCFC rejects unrecognized controls', () => node_assert_1.strict.throws(() => (0, pagination_1.parseFcfc)('Xwrong\n', 1), /Unexpected FCFC/));
(0, node_test_1.test)('FCFC rejects overprinting', () => node_assert_1.strict.throws(() => (0, pagination_1.parseFcfc)('1first\n+overprint\n', 1), /overprint/));
