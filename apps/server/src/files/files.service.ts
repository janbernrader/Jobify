import { access, readFile } from 'node:fs/promises';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { and, desc, eq, inArray, isNotNull, type SQL } from 'drizzle-orm';
import { APP_CONFIG } from '../config/config.module.js';
import type { AppConfig } from '../config/configuration.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { attachments, jobs, type Attachment } from '../database/schema.js';
import { extractResumeText } from '../users/resume-text.js';
import { AttachmentStore } from './attachment-store.js';
import { contentTypeFor, isInlineType, type AttachmentKind } from './file.constants.js';

/** An attachment as the browser sees it. The path on disk is never sent out. */
export interface AttachmentSummary {
  id: number;
  jobId: number | null;
  kind: AttachmentKind;
  name: string;
  contentType: string;
  size: number;
  sha256: string;
  /** Whether the browser is allowed to open it in place rather than download it. */
  inline: boolean;
  createdAt: Date;
}

/** What the download route needs to send a file. */
export interface AttachmentContent {
  path: string;
  name: string;
  contentType: string;
  inline: boolean;
}

/**
 * Files belong to a single user, like jobs. Every method takes the owner's id and behaves as
 * if other users' files do not exist: a file belonging to somebody else is "not found", never
 * "forbidden", so these routes cannot be used to find out what other people have uploaded.
 */
@Injectable()
export class FilesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(FilesService.name);
  private readonly store: AttachmentStore;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    this.store = new AttachmentStore(config.files.dir);
  }

  /** Deleting a user (or an older version deleting a job) can leave files behind. */
  async onApplicationBootstrap(): Promise<void> {
    await this.removeOrphans();
  }

  async listForJob(userId: number, jobId: number): Promise<AttachmentSummary[]> {
    // Someone else's job is "not found" here too, rather than a job with no files.
    await this.assertJobOwned(userId, jobId);
    const rows = await this.db
      .select()
      .from(attachments)
      .where(and(eq(attachments.userId, userId), eq(attachments.jobId, jobId)))
      .orderBy(desc(attachments.createdAt), desc(attachments.id));
    return rows.map(FilesService.summary);
  }

  async upload(
    userId: number,
    jobId: number,
    file: { originalname?: string; buffer: Buffer },
    kind: AttachmentKind = 'other',
  ): Promise<AttachmentSummary> {
    await this.assertJobOwned(userId, jobId);
    if (!file.buffer?.length) throw new BadRequestException('That file is empty.');
    if (file.buffer.byteLength > this.config.files.maxBytes) {
      const megabytes = Math.floor(this.config.files.maxBytes / (1024 * 1024));
      throw new BadRequestException(`Files can be up to ${megabytes} MB.`);
    }

    const name = FilesService.cleanName(file.originalname);
    const stored = await this.store.save(file.buffer, name);
    try {
      const [row] = await this.db
        .insert(attachments)
        .values({
          userId,
          jobId,
          kind,
          name,
          path: stored.path,
          // From the name only: what the browser claims about an upload is not evidence.
          contentType: contentTypeFor(name),
          size: stored.size,
          sha256: stored.sha256,
        })
        .returning();
      return FilesService.summary(row);
    } catch (error) {
      // Nothing points at the file now, so it must not stay on disk.
      await this.store.remove(stored.path);
      throw error;
    }
  }

  async findOne(userId: number, id: number): Promise<AttachmentSummary> {
    return FilesService.summary(await this.owned(userId, id));
  }

  /** Where the bytes are, once the file is known to belong to this user. */
  async content(userId: number, id: number): Promise<AttachmentContent> {
    const row = await this.owned(userId, id);
    const path = this.store.resolve(row.path);
    // Checked here rather than while streaming, where the response has already started.
    await access(path).catch(() => {
      throw new NotFoundException(`${row.name} is missing from the file store`);
    });
    return {
      path,
      name: row.name,
      contentType: row.contentType,
      inline: isInlineType(row.contentType),
    };
  }

  /** The file's text, for filling in a job's resume or cover letter. */
  async text(userId: number, id: number) {
    const row = await this.owned(userId, id);
    const bytes = await readFile(this.store.resolve(row.path)).catch(() => {
      throw new NotFoundException(`${row.name} is missing from the file store`);
    });
    return extractResumeText(bytes);
  }

  async update(
    userId: number,
    id: number,
    changes: { name?: string; kind?: AttachmentKind },
  ): Promise<AttachmentSummary> {
    const row = await this.owned(userId, id);
    const name = changes.name === undefined ? undefined : FilesService.cleanName(changes.name);
    await this.db
      .update(attachments)
      .set({ ...(name && { name }), ...(changes.kind && { kind: changes.kind }) })
      .where(eq(attachments.id, row.id));
    return this.findOne(userId, id);
  }

  async remove(userId: number, id: number): Promise<void> {
    const row = await this.owned(userId, id);
    // The row goes first: a file still on disk is tidied up by the sweep, while a row pointing
    // at nothing would be a broken download.
    await this.db.delete(attachments).where(eq(attachments.id, row.id));
    await this.store.remove(row.path);
  }

  /**
   * Deletes the files of jobs that are about to be deleted. The rows would go by themselves
   * (ON DELETE CASCADE) but their paths would go with them, so they are collected first.
   */
  async removeForJobs(jobIds: number[]): Promise<void> {
    if (jobIds.length === 0) return;
    const rows = await this.db
      .select({ path: attachments.path })
      .from(attachments)
      .where(inArray(attachments.jobId, jobIds));
    for (const { path } of rows) await this.store.remove(path);
  }

  /** The same, for every job in a hunt that is about to be deleted. */
  async removeForHunt(userId: number, huntId: number): Promise<void> {
    const rows = await this.db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.userId, userId), eq(jobs.huntId, huntId)));
    await this.removeForJobs(rows.map((row) => row.id));
  }

  /** Deletes files on disk that no row points at any more. */
  async removeOrphans(): Promise<number> {
    const rows = await this.db.select({ path: attachments.path }).from(attachments);
    const removed = await this.store.removeExcept(rows.map((row) => row.path));
    if (removed > 0) this.logger.log(`Removed ${removed} file(s) left by deleted jobs`);
    return removed;
  }

  /** A file of this user's, or a 404 — the same answer as for one that does not exist. */
  private async owned(userId: number, id: number): Promise<Attachment> {
    const row = await this.db.query.attachments.findFirst({
      where: FilesService.ownedBy(userId, id),
    });
    if (!row) throw new NotFoundException(`File ${id} not found`);
    return row;
  }

  private static ownedBy(userId: number, id: number): SQL {
    return and(eq(attachments.id, id), eq(attachments.userId, userId))!;
  }

  private async assertJobOwned(userId: number, jobId: number): Promise<void> {
    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.userId, userId), isNotNull(jobs.userId)),
      columns: { id: true },
    });
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);
  }

  private static cleanName(name: string | undefined): string {
    // Only ever a label: the path on disk is the store's business.
    const base = (name ?? '').replace(/\\/g, '/').split('/').pop()?.trim();
    return base?.slice(0, 300) || 'file';
  }

  private static summary(row: Attachment): AttachmentSummary {
    return {
      id: row.id,
      jobId: row.jobId,
      kind: row.kind,
      name: row.name,
      contentType: row.contentType,
      size: row.size,
      sha256: row.sha256,
      inline: isInlineType(row.contentType),
      createdAt: row.createdAt,
    };
  }
}
