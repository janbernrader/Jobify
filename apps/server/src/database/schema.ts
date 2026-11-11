import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { ATTACHMENT_KINDS } from '../files/file.constants.js';
import {
  EMPLOYMENT_TYPES,
  JOB_EVENT_TYPES,
  JOB_STATUSES,
  SALARY_PERIODS,
  WORKPLACE_TYPES,
} from '../jobs/job.constants.js';
import { TAG_COLORS } from '../tags/tag.constants.js';
import type { UserPreferences } from '../users/preferences.js';

const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`)
    .$onUpdate(() => new Date()),
};

export const USER_ROLES = ['admin', 'user'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface UserProfile {
  name: string;
  headline: string;
  resume: string;
  preferences: string;
}

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** Stored lowercase; usernames are case-insensitive. */
  username: text('username').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: USER_ROLES }).notNull().default('user'),
  /** Background the AI features use to personalize output. */
  profile: text('profile', { mode: 'json' }).$type<Partial<UserProfile>>().notNull().default({}),
  preferences: text('preferences', { mode: 'json' })
    .$type<Partial<UserPreferences>>()
    .notNull()
    .default({}),
  ...timestamps,
});

export const sessions = sqliteTable(
  'sessions',
  {
    /** SHA-256 of the session token; the token itself only lives in the user's cookie. */
    id: text('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: timestamps.createdAt,
  },
  (table) => [index('sessions_user_idx').on(table.userId)],
);

/**
 * A personal access token: how something that cannot hold a session cookie signs in as the
 * user, such as the iOS shortcut that shares a posting to Jobify. As for sessions, only the
 * token's SHA-256 hash is stored; the token itself is shown once, when it is created.
 */
export const apiTokens = sqliteTable(
  'api_tokens',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    /** What the user called it, e.g. "iPhone shortcut". */
    name: text('name').notNull(),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
    createdAt: timestamps.createdAt,
  },
  (table) => [index('api_tokens_user_idx').on(table.userId)],
);

/**
 * One job search, from starting to look until it ends. Every job belongs to a hunt, so a new
 * search starts with a clean list while earlier ones stay available with their stats.
 */
export const jobHunts = sqliteTable(
  'job_hunts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // Calendar dates (YYYY-MM-DD). A hunt without an end date is the user's active one.
    startedOn: text('started_on').notNull(),
    endedOn: text('ended_on'),
    ...timestamps,
  },
  (table) => [
    index('job_hunts_user_idx').on(table.userId),
    // A user has at most one active hunt.
    uniqueIndex('job_hunts_active_idx')
      .on(table.userId)
      .where(sql`${table.endedOn} is null`),
  ],
);

/**
 * An employer or a recruitment agency the user deals with. Companies outlive a job hunt, so
 * they are per user rather than per hunt, and a job's `company` text is kept in step with the
 * name here rather than replaced by it (see `CompaniesService`).
 */
export const companies = sqliteTable(
  'companies',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    website: text('website'),
    /** A recruitment agency rather than an employer: the same record with a different badge. */
    isAgency: integer('is_agency', { mode: 'boolean' }).notNull().default(false),
    /** What the user knows about them, in Markdown. */
    about: text('about'),
    ...timestamps,
  },
  (table) => [uniqueIndex('companies_user_name_idx').on(table.userId, table.name)],
);

export const jobs = sqliteTable(
  'jobs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /**
     * Nullable only because jobs created before accounts existed have no owner. They are
     * assigned to the first admin when the instance is set up.
     */
    userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
    /**
     * Nullable only for jobs that predate hunts (or were written by an older version after a
     * downgrade). `HuntsService.adoptOrphanedJobs` moves those into a hunt on startup.
     */
    huntId: integer('hunt_id').references(() => jobHunts.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    /**
     * The company's name, kept as text so every list, chart and backup reads one column. It
     * follows `companyId`: the services write it whenever the link changes, and a rename
     * updates every job of that company.
     */
    company: text('company').notNull(),
    /**
     * Nullable for jobs that predate companies (and for a job whose company was deleted out
     * from under it). `CompaniesService.adoptJobs` fills those in on startup.
     */
    companyId: integer('company_id').references(() => companies.id, { onDelete: 'set null' }),
    location: text('location'),
    workplaceType: text('workplace_type', { enum: WORKPLACE_TYPES }),
    employmentType: text('employment_type', { enum: EMPLOYMENT_TYPES }),
    status: text('status', { enum: JOB_STATUSES }).notNull().default('saved'),
    /** 1-5 rating of how excited the user is about the role. */
    interest: integer('interest'),
    salaryMin: integer('salary_min'),
    salaryMax: integer('salary_max'),
    salaryCurrency: text('salary_currency'),
    salaryPeriod: text('salary_period', { enum: SALARY_PERIODS }),
    url: text('url'),
    /** Where the posting was found, e.g. "LinkedIn" or "Workday". */
    source: text('source'),
    description: text('description'),
    notes: text('notes'),
    aiSummary: text('ai_summary'),
    coverLetter: text('cover_letter'),
    interviewPrep: text('interview_prep'),
    /**
     * Candidate details for this job only, such as a tailored resume. Each field that is filled
     * in replaces the same field of the user's profile in the AI features; blank fields fall
     * back to the profile (`profileForJob`).
     */
    profile: text('profile', { mode: 'json' }).$type<Partial<UserProfile>>(),
    contactName: text('contact_name'),
    contactEmail: text('contact_email'),
    tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
    // Calendar dates are stored as ISO strings (YYYY-MM-DD).
    postedOn: text('posted_on'),
    appliedOn: text('applied_on'),
    deadlineOn: text('deadline_on'),
    followUpOn: text('follow_up_on'),
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
    ...timestamps,
  },
  (table) => [
    index('jobs_user_idx').on(table.userId),
    index('jobs_hunt_idx').on(table.huntId),
    index('jobs_status_idx').on(table.status),
    index('jobs_company_idx').on(table.company),
    index('jobs_company_id_idx').on(table.companyId),
  ],
);

export const jobEvents = sqliteTable(
  'job_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    jobId: integer('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    type: text('type', { enum: JOB_EVENT_TYPES }).notNull(),
    fromStatus: text('from_status', { enum: JOB_STATUSES }),
    toStatus: text('to_status', { enum: JOB_STATUSES }),
    title: text('title'),
    body: text('body'),
    occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: timestamps.createdAt,
  },
  (table) => [index('job_events_job_idx').on(table.jobId)],
);

/**
 * A file the user uploaded, stored under `DATA_DIR/files` with its details here.
 *
 * `userId` is the owner and every query filters by it; `jobId` is where the file is shown and
 * may be null for a file whose job has gone. The path is always generated by the server, never
 * taken from the upload, and is the only way the bytes are addressed.
 */
export const attachments = sqliteTable(
  'attachments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    jobId: integer('job_id').references(() => jobs.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ATTACHMENT_KINDS }).notNull().default('other'),
    /** The name as uploaded, shown to the user and editable. Never used as a path. */
    name: text('name').notNull(),
    /** Relative to `DATA_DIR/files`, with forward slashes. */
    path: text('path').notNull().unique(),
    /** Guessed from the file's name, never taken from the browser's claim. */
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    sha256: text('sha256').notNull(),
    ...timestamps,
  },
  (table) => [
    index('attachments_user_idx').on(table.userId),
    index('attachments_job_idx').on(table.jobId),
    index('attachments_sha256_idx').on(table.sha256),
  ],
);

export const CHAT_ROLES = ['user', 'assistant'] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

/** The conversation a user has with the AI about one job, oldest first. */
export const jobChatMessages = sqliteTable(
  'job_chat_messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    jobId: integer('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    role: text('role', { enum: CHAT_ROLES }).notNull(),
    content: text('content').notNull(),
    createdAt: timestamps.createdAt,
  },
  (table) => [index('job_chat_messages_job_idx').on(table.jobId)],
);

/**
 * A user's tag and its color. Jobs keep tag names in `jobs.tags`; a row here exists only once a
 * tag was created or recolored explicitly (see `TagsService`).
 */
export const tags = sqliteTable(
  'tags',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color', { enum: TAG_COLORS }).notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('tags_user_name_idx').on(table.userId, table.name)],
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).$type<unknown>().notNull(),
});

export type User = typeof users.$inferSelect;
export type ApiToken = typeof apiTokens.$inferSelect;
export type JobHunt = typeof jobHunts.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type JobEvent = typeof jobEvents.$inferSelect;
export type NewJobEvent = typeof jobEvents.$inferInsert;
export type JobChatMessage = typeof jobChatMessages.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type Company = typeof companies.$inferSelect;
