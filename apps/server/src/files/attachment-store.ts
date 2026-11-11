import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Where uploaded files live: `<root>/YYYY/MM/<key>-<safe name>`.
 *
 * Nothing outside the root is ever read, written or deleted, and no path here comes from the
 * client: the stored name is only ever a label. The key in front of the name makes a file's
 * address unguessable even to someone who knows what it is called, though the routes check the
 * owner before serving anything in any case.
 */
export class AttachmentStore {
  constructor(private readonly root: string) {}

  /** Writes the bytes and reports where they went. The caller saves the path and hash. */
  async save(bytes: Buffer, name: string): Promise<{ path: string; size: number; sha256: string }> {
    const now = new Date();
    const month = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const relative = `${month}/${randomBytes(8).toString('hex')}-${safeName(name)}`;
    const destination = this.resolve(relative);

    await mkdir(path.dirname(destination), { recursive: true });
    // Written beside the destination and moved into place, so a failed write leaves nothing
    // behind that a later read could pick up half-finished.
    const temporary = `${destination}.part`;
    try {
      await writeFile(temporary, bytes, { flag: 'wx' });
      await rename(temporary, destination);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
    return {
      path: relative,
      size: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  }

  async remove(relative: string): Promise<void> {
    await unlink(this.resolve(relative)).catch(() => undefined);
  }

  /** Every path on disk, relative to the root, for finding the ones no row points at. */
  async list(): Promise<string[]> {
    const entries = await readdir(this.root, { recursive: true, withFileTypes: true }).catch(
      () => [],
    );
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.relative(this.root, path.join(entry.parentPath, entry.name)))
      .filter((relative) => !relative.endsWith('.part'));
  }

  /** Deletes files with no row behind them (a job, hunt or user that has since gone). */
  async removeExcept(keep: Iterable<string>): Promise<number> {
    const wanted = new Set(keep);
    const orphans = (await this.list()).filter((relative) => !wanted.has(relative));
    for (const relative of orphans) await this.remove(relative);
    return orphans.length;
  }

  /** Clears the store, for tests. */
  async clear(): Promise<void> {
    await rm(this.root, { recursive: true, force: true });
  }

  /**
   * The absolute path of a file in the store. Refuses anything that would reach outside the
   * root, however it is spelled: `..`, an absolute path, a backslash on a platform that takes
   * one as a separator.
   */
  resolve(relative: string): string {
    const resolved = path.resolve(this.root, relative);
    const inside = resolved.startsWith(this.root + path.sep);
    if (!inside || relative.includes('\0') || path.isAbsolute(relative)) {
      throw new Error(`${relative} is not inside the file store`);
    }
    return resolved;
  }
}

/**
 * A file name that is safe on any file system: ASCII, no separators, no leading dot, with the
 * extension kept because the content type is guessed from it.
 */
export function safeName(name: string, limit = 80): string {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? '';
  // Split before cleaning: a name whose stem is all emoji still has an extension, and the
  // extension is what the content type is read from.
  const dot = base.lastIndexOf('.');
  const [rawStem, rawExtension] = dot > 0 ? [base.slice(0, dot), base.slice(dot + 1)] : [base, ''];

  const ascii = (value: string) => value.normalize('NFKD').replace(/[^\x20-\x7e]/g, '');
  const stem =
    ascii(rawStem)
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^[-._]+|[-._]+$/g, '')
      .slice(0, limit) || 'file';
  const extension = ascii(rawExtension)
    .replace(/[^A-Za-z0-9]+/g, '')
    .slice(0, 10)
    .toLowerCase();

  return extension ? `${stem}.${extension}` : stem;
}
