import { UnprocessableEntityException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiService } from '../ai/ai.service.js';
import { CompaniesService } from '../companies/companies.service.js';
import { createTestDatabase, type TestDatabase } from '../database/testing.js';
import { createTestFiles } from '../files/testing.js';
import type { ImportResult, ImportService } from '../importers/import.service.js';
import type { JobDraft } from '../importers/job-draft.js';
import { HuntsService } from '../hunts/hunts.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import { ShareService } from './share.service.js';

const imported = (draft: JobDraft, warnings: string[] = []): ImportResult => ({
  draft,
  sources: ['test'],
  warnings,
});

describe('ShareService', () => {
  let database: TestDatabase;
  let jobs: JobsService;
  let share: ShareService;
  let alice: number;
  const importer = { import: vi.fn() };
  const ai = { getPublicSettings: vi.fn() };

  beforeEach(async () => {
    database = await createTestDatabase();
    const files = createTestFiles(database.db);
    const hunts = new HuntsService(database.db, files);
    jobs = new JobsService(database.db, hunts, files, new CompaniesService(database.db));
    importer.import.mockReset();
    ai.getPublicSettings.mockReset().mockResolvedValue({ configured: false });
    share = new ShareService(
      importer as unknown as ImportService,
      jobs,
      ai as unknown as AiService,
    );
    alice = await database.createUser('alice');
  });

  afterEach(() => database.client.close());

  it('saves the shared posting into the active hunt', async () => {
    importer.import.mockResolvedValue(
      imported({
        title: 'Senior Engineer',
        company: 'Acme',
        location: 'Berlin',
        description: 'Build things.',
        url: 'https://jobs.acme.test/42',
      }),
    );

    const result = await share.save(alice, { url: 'https://jobs.acme.test/42' });

    expect(result).toMatchObject({
      title: 'Senior Engineer',
      company: 'Acme',
      duplicate: false,
      message: 'Saved: Senior Engineer at Acme',
    });
    const saved = await jobs.findOne(alice, result.id);
    expect(saved).toMatchObject({
      location: 'Berlin',
      status: 'saved',
      huntId: expect.any(Number),
    });
  });

  it('still saves the link when the posting cannot be read', async () => {
    importer.import.mockRejectedValue(
      new UnprocessableEntityException('No job details were found'),
    );

    const result = await share.save(alice, {
      url: 'https://www.linkedin.com/jobs/view/4123456789',
      title: 'Backend Engineer',
    });

    expect(result).toMatchObject({
      title: 'Backend Engineer',
      company: 'linkedin.com',
      duplicate: false,
      warnings: ['No job details were found'],
    });
    expect((await jobs.findOne(alice, result.id)).url).toBe(
      'https://www.linkedin.com/jobs/view/4123456789',
    );
  });

  it('falls back to a name of its own when the share says nothing', async () => {
    importer.import.mockRejectedValue(new Error('offline'));
    const result = await share.save(alice, { url: 'https://careers.initech.test/roles/7' });
    expect(result).toMatchObject({ title: 'Shared posting', company: 'careers.initech.test' });
  });

  it('answers with the job that already exists instead of saving it twice', async () => {
    const draft = {
      title: 'Senior Engineer',
      company: 'Acme',
      url: 'https://jobs.acme.test/42',
    };
    importer.import.mockResolvedValue(imported(draft));
    const first = await share.save(alice, { url: draft.url });

    // The same posting again, this time reached through a tracking link.
    importer.import.mockResolvedValue(imported(draft));
    const again = await share.save(alice, { url: 'https://jobs.acme.test/42?utm_source=phone' });

    expect(again).toMatchObject({
      id: first.id,
      duplicate: true,
      message: 'Already saved: Senior Engineer at Acme',
    });
    expect(await jobs.list(alice, {})).toHaveLength(1);
  });

  it('lets the importer use AI only when a provider is set up', async () => {
    importer.import.mockResolvedValue(imported({ title: 'Engineer', company: 'Acme' }));
    await share.save(alice, { url: 'https://jobs.acme.test/1' });
    expect(importer.import).toHaveBeenCalledWith(expect.objectContaining({ useAi: false }));

    ai.getPublicSettings.mockResolvedValue({ configured: true });
    await share.save(alice, { url: 'https://jobs.acme.test/2' });
    expect(importer.import).toHaveBeenLastCalledWith(expect.objectContaining({ useAi: true }));
  });
});
