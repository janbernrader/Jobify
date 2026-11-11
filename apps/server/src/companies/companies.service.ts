import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  sql,
  type SQL,
} from 'drizzle-orm';
import { DATABASE, type Database, type Executor } from '../database/database.module.js';
import { companies, jobHunts, jobs, type Company } from '../database/schema.js';
import { ACTIVE_STATUSES, type JobStatus } from '../jobs/job.constants.js';
import type { CompanyDto } from './company.dto.js';

/** A company in a list, with how much is going on there. */
export interface CompanySummary extends Company {
  jobCount: number;
  /** Jobs still in play: not archived, at a status from `ACTIVE_STATUSES`. */
  openCount: number;
  /** When something last happened with one of its jobs. */
  lastActivityAt: Date | null;
}

/** One of a company's jobs, as its page lists them. */
export interface CompanyJob {
  id: number;
  title: string;
  status: JobStatus;
  appliedOn: string | null;
  archived: boolean;
  updatedAt: Date;
  hunt: { id: number; name: string; endedOn: string | null } | null;
}

export interface CompanyDetail extends CompanySummary {
  jobs: CompanyJob[];
}

/**
 * Companies belong to a single user, like everything else, and outlive a job hunt: the page
 * shows every job at a company across every hunt.
 *
 * A job keeps its company's name in `jobs.company` and the link in `jobs.companyId`. The name
 * is written whenever the link is, and a rename updates every job of that company, so the two
 * never drift and nothing else in Jobify has to learn about companies to keep working.
 */
@Injectable()
export class CompaniesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CompaniesService.name);

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Upgrades from versions without companies: gives every existing job one. */
  async onApplicationBootstrap(): Promise<void> {
    await this.adoptJobs();
  }

  async list(userId: number): Promise<CompanySummary[]> {
    const rows = await this.db
      .select({
        company: companies,
        jobCount: count(jobs.id),
        openCount: sql<number>`sum(case when ${jobs.archived} = 0 and ${jobs.status} in ${ACTIVE_STATUSES} then 1 else 0 end)`,
        lastActivityAt: sql<number | null>`max(${jobs.updatedAt})`,
      })
      .from(companies)
      .leftJoin(jobs, eq(jobs.companyId, companies.id))
      .where(eq(companies.userId, userId))
      .groupBy(companies.id)
      .orderBy(asc(sql`lower(${companies.name})`));

    return rows.map(({ company, jobCount, openCount, lastActivityAt }) => ({
      ...company,
      jobCount,
      openCount: Number(openCount ?? 0),
      lastActivityAt: lastActivityAt == null ? null : new Date(Number(lastActivityAt)),
    }));
  }

  async findOne(userId: number, id: number): Promise<CompanyDetail> {
    const [summary] = (await this.list(userId)).filter((company) => company.id === id);
    if (!summary) throw new NotFoundException(`Company ${id} not found`);

    const rows = await this.db
      .select({
        id: jobs.id,
        title: jobs.title,
        status: jobs.status,
        appliedOn: jobs.appliedOn,
        archived: jobs.archived,
        updatedAt: jobs.updatedAt,
        huntId: jobHunts.id,
        huntName: jobHunts.name,
        huntEndedOn: jobHunts.endedOn,
      })
      .from(jobs)
      .leftJoin(jobHunts, eq(jobHunts.id, jobs.huntId))
      .where(and(eq(jobs.userId, userId), eq(jobs.companyId, id)))
      .orderBy(desc(jobs.updatedAt), desc(jobs.id));

    return {
      ...summary,
      jobs: rows.map(({ huntId, huntName, huntEndedOn, ...job }) => ({
        ...job,
        hunt:
          huntId != null && huntName != null
            ? { id: huntId, name: huntName, endedOn: huntEndedOn }
            : null,
      })),
    };
  }

  async create(userId: number, dto: CompanyDto): Promise<CompanyDetail> {
    const name = CompaniesService.cleanName(dto.name);
    const existing = await this.byName(userId, name);
    if (existing) {
      throw new ConflictException(`You already have a company called ${existing.name}`);
    }
    const [created] = await this.db
      .insert(companies)
      .values({ ...dto, userId, name })
      .returning({ id: companies.id });
    return this.findOne(userId, created.id);
  }

  /** Renaming a company renames it on its jobs too, so the two never disagree. */
  async update(userId: number, id: number, dto: Partial<CompanyDto>): Promise<CompanyDetail> {
    const company = await this.owned(userId, id);
    const name = dto.name === undefined ? undefined : CompaniesService.cleanName(dto.name);
    if (name && name.toLowerCase() !== company.name.toLowerCase()) {
      const clash = await this.byName(userId, name);
      if (clash) throw new ConflictException(`You already have a company called ${clash.name}`);
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(companies)
        .set({ ...dto, ...(name && { name }) })
        .where(eq(companies.id, id));
      if (name && name !== company.name) {
        await tx.update(jobs).set({ company: name }).where(eq(jobs.companyId, id));
      }
    });
    return this.findOne(userId, id);
  }

  /**
   * Deletes a company. Refused while it still has jobs: the jobs would keep their company's
   * name but lose the page that gathers them, which is rarely what anyone means.
   */
  async remove(userId: number, id: number): Promise<void> {
    await this.owned(userId, id);
    const [{ jobCount }] = await this.db
      .select({ jobCount: count() })
      .from(jobs)
      .where(and(eq(jobs.userId, userId), eq(jobs.companyId, id)));
    if (jobCount > 0) {
      throw new ConflictException(
        `This company has ${jobCount} job(s). Move or delete them before deleting it.`,
      );
    }
    await this.db.delete(companies).where(eq(companies.id, id));
  }

  /**
   * The company a job's text names, creating it the first time it is used — the same bargain
   * as tags, so no code path has to create a company before saving a job.
   */
  async forName(userId: number, rawName: string, db: Executor = this.db): Promise<Company> {
    const name = CompaniesService.cleanName(rawName);
    const existing = await this.byName(userId, name, db);
    if (existing) return existing;
    const [created] = await db.insert(companies).values({ userId, name }).returning();
    return created;
  }

  /**
   * Gives jobs written before companies existed (or by an older version after a downgrade)
   * the company their text names. Safe to run any number of times.
   */
  async adoptJobs(userId?: number): Promise<number> {
    const orphaned = and(
      isNull(jobs.companyId),
      isNotNull(jobs.userId),
      ne(sql`trim(${jobs.company})`, ''),
    );
    const rows = await this.db
      .select({ userId: jobs.userId, company: jobs.company })
      .from(jobs)
      .where(userId === undefined ? orphaned : and(orphaned, eq(jobs.userId, userId)))
      .groupBy(jobs.userId, sql`lower(trim(${jobs.company}))`);
    if (rows.length === 0) return 0;

    let adopted = 0;
    for (const row of rows) {
      const owner = row.userId!;
      adopted += await this.db.transaction(async (tx) => {
        const company = await this.forName(owner, row.company, tx);
        const updated = await tx
          .update(jobs)
          .set({ companyId: company.id, company: company.name })
          .where(
            and(
              eq(jobs.userId, owner),
              isNull(jobs.companyId),
              eq(sql`lower(trim(${jobs.company}))`, row.company.trim().toLowerCase()),
            ),
          )
          .returning({ id: jobs.id });
        return updated.length;
      });
    }
    this.logger.log(`Gave ${adopted} job(s) a company`);
    return adopted;
  }

  /** The user's companies by id, for filling in job lists. */
  async byIds(userId: number, ids: number[]): Promise<Map<number, Company>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db
      .select()
      .from(companies)
      .where(and(eq(companies.userId, userId), inArray(companies.id, ids)));
    return new Map(rows.map((row) => [row.id, row]));
  }

  /** Matching ignores case, so "ACME" and "Acme" are one company. */
  private async byName(
    userId: number,
    name: string,
    db: Executor = this.db,
  ): Promise<Company | undefined> {
    const [row] = await db
      .select()
      .from(companies)
      .where(
        and(eq(companies.userId, userId), eq(sql`lower(${companies.name})`, name.toLowerCase())),
      )
      .limit(1);
    return row;
  }

  private async owned(userId: number, id: number): Promise<Company> {
    const company = await this.db.query.companies.findFirst({
      where: CompaniesService.ownedBy(userId, id),
    });
    if (!company) throw new NotFoundException(`Company ${id} not found`);
    return company;
  }

  private static ownedBy(userId: number, id: number): SQL {
    return and(eq(companies.id, id), eq(companies.userId, userId))!;
  }

  private static cleanName(name: string): string {
    return name.trim().replace(/\s+/g, ' ');
  }
}
