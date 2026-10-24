import { Spool, job, name } from './core';

/** VS Code tree context menus pass TreeItem; tree open passes its command arguments. */
export function resolveSpool(value: unknown): Spool {
  if (!value || typeof value !== 'object') throw new Error('No spool selected');
  const wrapper = value as { spool?: unknown };
  const raw = wrapper.spool ?? value;
  if (!raw || typeof raw !== 'object') throw new Error('Invalid spool selection');
  const s = raw as Partial<Spool>;
  if (typeof s.name !== 'string') throw new Error('Selected spool is missing name');
  if (typeof s.job !== 'string') throw new Error('Selected spool is missing job');
  if (typeof s.user !== 'string') throw new Error('Selected spool is missing user');
  if (!Number.isSafeInteger(s.number) || (s.number ?? 0) < 1) throw new Error('Selected spool has invalid number');
  name(s.name); job(s.job); name(s.user);
  return s as Spool;
}
