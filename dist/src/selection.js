"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveSpool = resolveSpool;
const core_1 = require("./core");
/** VS Code tree context menus pass TreeItem; tree open passes its command arguments. */
function resolveSpool(value) {
    if (!value || typeof value !== 'object')
        throw new Error('No spool selected');
    const wrapper = value;
    const raw = wrapper.spool ?? value;
    if (!raw || typeof raw !== 'object')
        throw new Error('Invalid spool selection');
    const s = raw;
    if (typeof s.name !== 'string')
        throw new Error('Selected spool is missing name');
    if (typeof s.job !== 'string')
        throw new Error('Selected spool is missing job');
    if (typeof s.user !== 'string')
        throw new Error('Selected spool is missing user');
    if (!Number.isSafeInteger(s.number) || (s.number ?? 0) < 1)
        throw new Error('Selected spool has invalid number');
    (0, core_1.name)(s.name);
    (0, core_1.job)(s.job);
    (0, core_1.name)(s.user);
    return s;
}
