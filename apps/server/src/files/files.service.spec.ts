import { mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../database/testing.js';
import { HuntsService } from '../hunts/hunts.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import { FilesService } from './files.service.js';
import { createTestFiles } from './testing.js';

const upload = (name: string, body = 'the file') => ({
  originalname: name,
  buffer: Buffer.from(body),
});

describe('FilesService', () => {
  let database: TestDatabase;
  let root: string;
  let files: FilesService;
  let jobs: JobsService;
  let hunts: HuntsService;
  let alice: number;
  let bob: number;
  let aliceJob: number;
  let bobJob: number;

  beforeEach(async () => {
    database = await createTestDatabase();
    root = mkdtempSync(path.join(tmpdir(), 'jobify-files-'));
    files = createTestFiles(database.db, root);
    hunts = new HuntsService(database.db, files);
    jobs = new JobsService(database.db, hunts, files);
    alice = await database.createUser('alice');
    bob = await database.createUser('bob');
    aliceJob = (await jobs.create(alice, { title: 'Engineer', company: 'Acme' })).id;
    bobJob = (await jobs.create(bob, { title: 'Engineer', company: 'Globex' })).id;
  });

  afterEach(async () => {
    await files.removeOrphans().catch(() => undefined);
    database.client.close();
  });

  it('stores a file against the job and reports what it is', async () => {
    const saved = await files.upload(alice, aliceJob, upload('My CV.pdf'), 'resume');

    expect(saved).toMatchObject({
      jobId: aliceJob,
      kind: 'resume',
      name: 'My CV.pdf',
      contentType: 'application/pdf',
      size: 8,
      inline: true,
    });
    expect(await files.listForJob(alice, aliceJob)).toHaveLength(1);
    const { path: stored } = await files.content(alice, saved.id);
    expect(await readFile(stored, 'utf8')).toBe('the file');
  });

  it('decides the content type from the name, and will not serve the risky ones in place', async () => {
    const page = await files.upload(alice, aliceJob, upload('evil.html', '<script>x</script>'));
    expect(page).toMatchObject({ contentType: 'application/octet-stream', inline: false });

    const vector = await files.upload(alice, aliceJob, upload('logo.svg', '<svg/>'));
    expect(vector).toMatchObject({ contentType: 'application/octet-stream', inline: false });

    const letter = await files.upload(alice, aliceJob, upload('letter.docx'));
    expect(letter.inline).toBe(false);
  });

  it('refuses an empty file and one over the limit', async () => {
    await expect(files.upload(alice, aliceJob, upload('empty.pdf', ''))).rejects.toThrow(
      BadRequestException,
    );

    const small = createTestFiles(database.db, root, 4);
    await expect(small.upload(alice, aliceJob, upload('big.pdf', 'far too long'))).rejects.toThrow(
      BadRequestException,
    );
  });

  describe('belonging to one user', () => {
    it('hides another user’s files from every route', async () => {
      const saved = await files.upload(alice, aliceJob, upload('My CV.pdf', 'alice only'));

      // Bob is told it does not exist, not that he may not have it.
      await expect(files.findOne(bob, saved.id)).rejects.toThrow(NotFoundException);
      await expect(files.content(bob, saved.id)).rejects.toThrow(NotFoundException);
      await expect(files.text(bob, saved.id)).rejects.toThrow(NotFoundException);
      await expect(files.update(bob, saved.id, { name: 'mine.pdf' })).rejects.toThrow(
        NotFoundException,
      );
      await expect(files.remove(bob, saved.id)).rejects.toThrow(NotFoundException);

      // Listing someone else's job is "not found" too, not an empty list.
      await expect(files.listForJob(bob, aliceJob)).rejects.toThrow(NotFoundException);

      // And none of that touched the file.
      expect(await files.findOne(alice, saved.id)).toMatchObject({ name: 'My CV.pdf' });
    });

    it('will not attach a file to someone else’s job', async () => {
      await expect(files.upload(alice, bobJob, upload('cv.pdf'))).rejects.toThrow(
        NotFoundException,
      );
      expect(await files.listForJob(bob, bobJob)).toEqual([]);
      await expect(files.listForJob(alice, bobJob)).rejects.toThrow(NotFoundException);
    });

    it('lists only the files of the job asked for', async () => {
      const second = (await jobs.create(alice, { title: 'Other', company: 'Initech' })).id;
      await files.upload(alice, aliceJob, upload('first.pdf'));
      await files.upload(alice, second, upload('second.pdf'));

      expect((await files.listForJob(alice, aliceJob)).map((file) => file.name)).toEqual([
        'first.pdf',
      ]);
    });
  });

  it('renames and reclassifies a file without moving it', async () => {
    const saved = await files.upload(alice, aliceJob, upload('untitled.pdf'));
    const renamed = await files.update(alice, saved.id, {
      name: '  Cover letter.pdf  ',
      kind: 'cover_letter',
    });

    expect(renamed).toMatchObject({ name: 'Cover letter.pdf', kind: 'cover_letter' });
    const { path: stored } = await files.content(alice, saved.id);
    expect(await readFile(stored, 'utf8')).toBe('the file');
  });

  it('reads the text out of a file for the resume fields', async () => {
    const saved = await files.upload(alice, aliceJob, upload('cv.txt', 'Jan\n\n\nBackend work'));
    await expect(files.text(alice, saved.id)).resolves.toMatchObject({
      text: 'Jan\n\nBackend work',
      format: 'text',
    });
  });

  it('takes the file off the disk when it is deleted', async () => {
    const saved = await files.upload(alice, aliceJob, upload('cv.pdf'));
    const { path: stored } = await files.content(alice, saved.id);

    await files.remove(alice, saved.id);
    await expect(readFile(stored)).rejects.toThrow();
    expect(await files.listForJob(alice, aliceJob)).toEqual([]);
  });

  it('takes a job’s files with the job', async () => {
    const saved = await files.upload(alice, aliceJob, upload('cv.pdf'));
    const { path: stored } = await files.content(alice, saved.id);

    await jobs.remove(alice, aliceJob);
    await expect(readFile(stored)).rejects.toThrow();
    await expect(files.findOne(alice, saved.id)).rejects.toThrow(NotFoundException);
  });

  it('takes the files of every job in a hunt with the hunt', async () => {
    const hunt = await hunts.current(alice);
    const saved = await files.upload(alice, aliceJob, upload('cv.pdf'));
    const { path: stored } = await files.content(alice, saved.id);

    await hunts.remove(alice, hunt!.id);
    await expect(readFile(stored)).rejects.toThrow();
  });

  it('sweeps up files that nothing points at any more', async () => {
    const saved = await files.upload(alice, aliceJob, upload('cv.pdf'));
    const { path: stored } = await files.content(alice, saved.id);
    // A user deleted in the database takes the row with it but not the file.
    await database.client.execute('delete from attachments');

    expect(await files.removeOrphans()).toBe(1);
    await expect(readFile(stored)).rejects.toThrow();
  });
});
