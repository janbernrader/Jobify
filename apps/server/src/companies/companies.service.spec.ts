import { ConflictException, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../database/testing.js';
import { jobs as jobsTable } from '../database/schema.js';
import { createTestFiles } from '../files/testing.js';
import { HuntsService } from '../hunts/hunts.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import { CompaniesService } from './companies.service.js';

describe('CompaniesService', () => {
  let database: TestDatabase;
  let companies: CompaniesService;
  let jobs: JobsService;
  let alice: number;
  let bob: number;

  beforeEach(async () => {
    database = await createTestDatabase();
    companies = new CompaniesService(database.db);
    jobs = new JobsService(
      database.db,
      new HuntsService(database.db, createTestFiles(database.db)),
      createTestFiles(database.db),
      companies,
    );
    alice = await database.createUser('alice');
    bob = await database.createUser('bob');
  });

  afterEach(() => database.client.close());

  it('gives a saved job its company, creating it the first time', async () => {
    const job = await jobs.create(alice, { title: 'Engineer', company: '  Acme  Corp ' });

    expect(job.company).toBe('Acme Corp');
    expect(job.companyId).toEqual(expect.any(Number));
    expect(await companies.list(alice)).toMatchObject([{ name: 'Acme Corp', jobCount: 1 }]);
  });

  it('treats the same name in another case as the same company', async () => {
    const first = await jobs.create(alice, { title: 'Engineer', company: 'Acme' });
    const second = await jobs.create(alice, { title: 'Designer', company: 'ACME' });

    expect(second.companyId).toBe(first.companyId);
    // The name stays as the company was first written, not as the second job typed it.
    expect(second.company).toBe('Acme');
    expect(await companies.list(alice)).toHaveLength(1);
  });

  it('counts jobs, open jobs and when something last happened', async () => {
    await jobs.create(alice, { title: 'Engineer', company: 'Acme', status: 'applied' });
    const rejected = await jobs.create(alice, { title: 'Designer', company: 'Acme' });
    await jobs.update(alice, rejected.id, { status: 'rejected' });
    await jobs.create(alice, { title: 'Other', company: 'Globex' });

    const [acme, globex] = await companies.list(alice);
    expect(acme).toMatchObject({ name: 'Acme', jobCount: 2, openCount: 1 });
    expect(acme.lastActivityAt).toBeInstanceOf(Date);
    expect(globex).toMatchObject({ name: 'Globex', jobCount: 1, openCount: 1 });
  });

  it('moves a job to another company when its name is edited', async () => {
    const job = await jobs.create(alice, { title: 'Engineer', company: 'Acme' });
    const moved = await jobs.update(alice, job.id, { company: 'Globex' });

    expect(moved.company).toBe('Globex');
    expect(moved.companyId).not.toBe(job.companyId);
    // The old company stays, with nothing in it, like a tag nobody uses any more.
    expect(await companies.list(alice)).toMatchObject([
      { name: 'Acme', jobCount: 0 },
      { name: 'Globex', jobCount: 1 },
    ]);
  });

  it('renames the company on its jobs too', async () => {
    const job = await jobs.create(alice, { title: 'Engineer', company: 'Acme' });
    await companies.update(alice, job.companyId!, { name: 'Acme Corporation' });

    expect((await jobs.findOne(alice, job.id)).company).toBe('Acme Corporation');
  });

  it('refuses a name another company already has', async () => {
    await jobs.create(alice, { title: 'Engineer', company: 'Acme' });
    const globex = await jobs.create(alice, { title: 'Other', company: 'Globex' });

    await expect(companies.create(alice, { name: 'acme' })).rejects.toThrow(ConflictException);
    await expect(companies.update(alice, globex.companyId!, { name: 'ACME' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('keeps a company until its jobs are gone', async () => {
    const job = await jobs.create(alice, { title: 'Engineer', company: 'Acme' });
    await expect(companies.remove(alice, job.companyId!)).rejects.toThrow(ConflictException);

    await jobs.remove(alice, job.id);
    await expect(companies.remove(alice, job.companyId!)).resolves.toBeUndefined();
    expect(await companies.list(alice)).toEqual([]);
  });

  it('shows a company its jobs from every hunt', async () => {
    const first = await jobs.create(alice, { title: 'Engineer', company: 'Acme' });
    const hunts = new HuntsService(database.db, createTestFiles(database.db));
    await hunts.create(alice, { name: 'This year' });
    const second = await jobs.create(alice, { title: 'Staff Engineer', company: 'Acme' });

    const detail = await companies.findOne(alice, first.companyId!);
    expect(detail.jobs.map((job) => job.id).sort()).toEqual([first.id, second.id].sort());
    expect(new Set(detail.jobs.map((job) => job.hunt?.name))).toEqual(
      new Set(['Job hunt 2026', 'This year']),
    );
  });

  describe('belonging to one user', () => {
    it('keeps each user’s companies to themselves', async () => {
      const hers = await jobs.create(alice, { title: 'Engineer', company: 'Acme' });
      await jobs.create(bob, { title: 'Engineer', company: 'Acme' });

      // The same name, two separate companies.
      expect(await companies.list(alice)).toHaveLength(1);
      expect(await companies.list(bob)).toHaveLength(1);
      expect((await companies.list(bob))[0].id).not.toBe(hers.companyId);

      await expect(companies.findOne(bob, hers.companyId!)).rejects.toThrow(NotFoundException);
      await expect(companies.update(bob, hers.companyId!, { name: 'Mine' })).rejects.toThrow(
        NotFoundException,
      );
      await expect(companies.remove(bob, hers.companyId!)).rejects.toThrow(NotFoundException);
    });
  });

  describe('upgrading', () => {
    it('gives jobs written before companies existed the one their text names', async () => {
      const job = await jobs.create(alice, { title: 'Engineer', company: 'Acme' });
      // As an older version left them: a name, no link.
      await database.db.update(jobsTable).set({ companyId: null }).where(eq(jobsTable.id, job.id));

      expect(await companies.adoptJobs()).toBe(1);
      expect((await jobs.findOne(alice, job.id)).companyId).toBe(job.companyId);
      // And again changes nothing.
      expect(await companies.adoptJobs()).toBe(0);
    });

    it('folds differently cased names into one company', async () => {
      await database.db.insert(jobsTable).values([
        { userId: alice, title: 'One', company: 'Acme' },
        { userId: alice, title: 'Two', company: 'ACME' },
        { userId: bob, title: 'Three', company: 'Acme' },
      ]);

      expect(await companies.adoptJobs()).toBe(3);
      expect(await companies.list(alice)).toMatchObject([{ name: 'Acme', jobCount: 2 }]);
      expect(await companies.list(bob)).toMatchObject([{ name: 'Acme', jobCount: 1 }]);
    });
  });
});
