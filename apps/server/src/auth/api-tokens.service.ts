import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, lt, or, isNull } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import { apiTokens, users } from '../database/schema.js';
import type { PublicUser } from '../users/users.service.js';

/** Makes a Jobify token recognizable in a config file, and cheap to rule out in the guard. */
export const API_TOKEN_PREFIX = 'jfy_';

/** How stale `lastUsedAt` may get before a request writes it again. */
const LAST_USED_RESOLUTION_MS = 60_000;

/** A token as it can be listed afterwards: everything except the secret. */
export interface ApiTokenSummary {
  id: number;
  name: string;
  lastUsedAt: Date | null;
  createdAt: Date;
}

/**
 * Personal access tokens. They carry the same rights as a session, so they are stored the same
 * way: a random secret, kept only as its SHA-256 hash, returned to the user once.
 */
@Injectable()
export class ApiTokensService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Creates a token. The plain text is the only copy; it is never stored or shown again. */
  async create(userId: number, name: string): Promise<ApiTokenSummary & { token: string }> {
    const token = API_TOKEN_PREFIX + randomBytes(32).toString('base64url');
    const [row] = await this.db
      .insert(apiTokens)
      .values({ userId, name: name.trim(), tokenHash: ApiTokensService.hash(token) })
      .returning({ id: apiTokens.id, name: apiTokens.name, createdAt: apiTokens.createdAt });
    return { ...row, lastUsedAt: null, token };
  }

  async list(userId: number): Promise<ApiTokenSummary[]> {
    return this.db
      .select({
        id: apiTokens.id,
        name: apiTokens.name,
        lastUsedAt: apiTokens.lastUsedAt,
        createdAt: apiTokens.createdAt,
      })
      .from(apiTokens)
      .where(eq(apiTokens.userId, userId))
      .orderBy(desc(apiTokens.createdAt));
  }

  async revoke(userId: number, id: number): Promise<void> {
    const deleted = await this.db
      .delete(apiTokens)
      .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId)))
      .returning({ id: apiTokens.id });
    if (deleted.length === 0) throw new NotFoundException(`Token ${id} not found`);
  }

  /** The user a token belongs to, or null. Records that the token was used. */
  async findUser(token: string | undefined, now = Date.now()): Promise<PublicUser | null> {
    if (!token?.startsWith(API_TOKEN_PREFIX)) return null;
    const hash = ApiTokensService.hash(token);
    const [row] = await this.db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(apiTokens)
      .innerJoin(users, eq(users.id, apiTokens.userId))
      .where(eq(apiTokens.tokenHash, hash));
    if (!row) return null;

    // Only once a minute: "last used" is for the user's benefit, not an audit log.
    await this.db
      .update(apiTokens)
      .set({ lastUsedAt: new Date(now) })
      .where(
        and(
          eq(apiTokens.tokenHash, hash),
          or(
            isNull(apiTokens.lastUsedAt),
            lt(apiTokens.lastUsedAt, new Date(now - LAST_USED_RESOLUTION_MS)),
          ),
        ),
      );
    return row;
  }

  private static hash(token: string): string {
    return createHash('sha256').update(token).digest('base64url');
  }
}
