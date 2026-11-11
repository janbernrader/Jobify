import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../ai/ai.service.js';
import { ImportService } from '../importers/import.service.js';
import type { JobDraft } from '../importers/job-draft.js';
import { JobsService } from '../jobs/jobs.service.js';
import type { ShareJobDto } from './share.dto.js';

/** What the sharing app is told, in the shape a phone shortcut can read without unpacking it. */
export interface SharedJobResult {
  id: number;
  title: string;
  company: string;
  url: string | null;
  /** True when this posting was already saved, in which case nothing was added. */
  duplicate: boolean;
  /** One line to show in a notification. */
  message: string;
  /** What could not be read, if anything. The job is saved either way. */
  warnings: string[];
}

/**
 * Saving a posting in one request, for the share sheet (see docs/share-to-jobify.md).
 *
 * Unlike `POST /import`, which returns a draft for the user to review, this saves: there is no
 * form on the other end, only a notification. So it never refuses — a posting it cannot read
 * is still saved with its link and whatever the sharing app called it, to be tidied up later —
 * and a posting that is already saved comes back as the job that matched rather than a 409.
 */
@Injectable()
export class ShareService {
  private readonly logger = new Logger(ShareService.name);

  constructor(
    private readonly importer: ImportService,
    private readonly jobs: JobsService,
    private readonly ai: AiService,
  ) {}

  async save(userId: number, dto: ShareJobDto): Promise<SharedJobResult> {
    const { draft, warnings } = await this.read(dto);
    // Several pay ranges are for the user to choose between, which needs the form.
    const { salaryRanges: _ranges, ...fields } = draft;
    const title = draft.title?.trim() || dto.title?.trim() || 'Shared posting';
    const company = draft.company?.trim() || ShareService.hostName(dto.url) || 'Unknown';
    const url = draft.url ?? dto.url ?? null;

    const [existing] = await this.jobs.findDuplicates(userId, { title, company, url });
    if (existing) {
      return {
        id: existing.id,
        title: existing.title,
        company: existing.company,
        url: existing.url,
        duplicate: true,
        message: `Already saved: ${existing.title} at ${existing.company}`,
        warnings,
      };
    }

    const job = await this.jobs.create(userId, {
      ...fields,
      title,
      company,
      url: url ?? undefined,
      // The duplicate check above has already run, with the fallbacks applied.
      allowDuplicate: true,
    });
    return {
      id: job.id,
      title: job.title,
      company: job.company,
      url: job.url,
      duplicate: false,
      message: `Saved: ${job.title} at ${job.company}`,
      warnings,
    };
  }

  /** Reads the posting, or gives up gracefully: a link saved as a stub beats a lost link. */
  private async read(dto: ShareJobDto): Promise<{ draft: JobDraft; warnings: string[] }> {
    const { configured } = await this.ai.getPublicSettings();
    try {
      const result = await this.importer.import({ ...dto, useAi: configured });
      return { draft: result.draft, warnings: result.warnings };
    } catch (error) {
      const message = (error as Error).message;
      this.logger.warn(`Could not read the shared posting: ${message}`);
      return { draft: {}, warnings: [message] };
    }
  }

  /** "jobs.acme.com" → "acme.com", a better guess at the company than nothing. */
  private static hostName(url: string | undefined): string | undefined {
    if (!url) return undefined;
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return undefined;
    }
  }
}
