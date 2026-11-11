import { mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AttachmentStore, safeName } from './attachment-store.js';

describe('safeName', () => {
  it('keeps an ordinary name', () => {
    expect(safeName('Resume_backend 2026.pdf')).toBe('Resume_backend-2026.pdf');
  });

  it('drops anything that could be a path', () => {
    expect(safeName('../../etc/passwd')).toBe('passwd');
    expect(safeName('..\\..\\windows\\system32\\config')).toBe('config');
    expect(safeName('/absolute/cv.pdf')).toBe('cv.pdf');
    expect(safeName('.bashrc')).toBe('bashrc');
  });

  it('flattens what a file system might choke on, keeping what transliterates', () => {
    expect(safeName('cv (fünf) *?.pdf')).toBe('cv-funf.pdf');
    expect(safeName('🙂.pdf')).toBe('file.pdf');
    expect(safeName('')).toBe('file');
  });

  it('keeps the extension, since the content type is read from it', () => {
    expect(safeName('letter.PDF')).toBe('letter.pdf');
    expect(safeName('archive.tar.gz')).toBe('archive.tar.gz');
  });
});

describe('AttachmentStore', () => {
  let root: string;
  let store: AttachmentStore;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'jobify-store-'));
    store = new AttachmentStore(root);
  });

  afterEach(() => store.clear());

  it('writes the file under the root and reports its hash', async () => {
    const stored = await store.save(Buffer.from('a cv'), 'My CV.pdf');

    expect(stored.path).toMatch(/^\d{4}\/\d{2}\/[0-9a-f]{16}-My-CV\.pdf$/);
    expect(stored.size).toBe(4);
    // sha256("a cv")
    expect(stored.sha256).toHaveLength(64);
    expect(await readFile(path.join(root, stored.path), 'utf8')).toBe('a cv');
  });

  it('gives two files of the same name their own place', async () => {
    const first = await store.save(Buffer.from('one'), 'cv.pdf');
    const second = await store.save(Buffer.from('two'), 'cv.pdf');
    expect(first.path).not.toBe(second.path);
  });

  it('refuses to resolve anything outside the root', () => {
    expect(() => store.resolve('../secrets.txt')).toThrow(/not inside/);
    expect(() => store.resolve('2026/01/../../../secrets.txt')).toThrow(/not inside/);
    expect(() => store.resolve('/etc/passwd')).toThrow(/not inside/);
    expect(() => store.resolve('')).toThrow(/not inside/);
    expect(() => store.resolve('cv\0.pdf')).toThrow(/not inside/);
  });

  it('deletes only what it is asked to, and never complains about a missing file', async () => {
    const kept = await store.save(Buffer.from('keep'), 'keep.pdf');
    const gone = await store.save(Buffer.from('gone'), 'gone.pdf');

    await store.remove(gone.path);
    await store.remove(gone.path);
    expect(await store.list()).toEqual([kept.path]);
  });

  it('sweeps up files that no longer belong to anything', async () => {
    const kept = await store.save(Buffer.from('keep'), 'keep.pdf');
    await store.save(Buffer.from('orphan'), 'orphan.pdf');

    expect(await store.removeExcept([kept.path])).toBe(1);
    expect(await store.list()).toEqual([kept.path]);
    // Nothing left to do the second time.
    expect(await store.removeExcept([kept.path])).toBe(0);
  });

  it('leaves a symlink and whatever it points at alone', async () => {
    const outside = path.join(tmpdir(), `jobify-outside-${Date.now()}.txt`);
    writeFileSync(outside, 'secret');
    symlinkSync(outside, path.join(root, 'link.txt'));

    // Only real files are listed, so the sweep never reaches through a link planted in the
    // store by something other than Jobify.
    expect(await store.list()).toEqual([]);
    await store.removeExcept([]);
    expect(await readFile(outside, 'utf8')).toBe('secret');
  });
});
