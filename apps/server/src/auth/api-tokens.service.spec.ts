import { NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { apiTokens } from '../database/schema.js';
import { createTestDatabase, type TestDatabase } from '../database/testing.js';
import { API_TOKEN_PREFIX, ApiTokensService } from './api-tokens.service.js';

describe('ApiTokensService', () => {
  let database: TestDatabase;
  let tokens: ApiTokensService;
  let alice: number;
  let bob: number;

  beforeEach(async () => {
    database = await createTestDatabase();
    tokens = new ApiTokensService(database.db);
    alice = await database.createUser('alice');
    bob = await database.createUser('bob');
  });

  afterEach(() => database.client.close());

  it('returns the token once and stores only its hash', async () => {
    const created = await tokens.create(alice, '  iPhone shortcut  ');
    expect(created.name).toBe('iPhone shortcut');
    expect(created.token.startsWith(API_TOKEN_PREFIX)).toBe(true);

    const [stored] = await database.db.select().from(apiTokens);
    expect(stored.tokenHash).not.toBe(created.token);
    expect(stored.tokenHash).not.toContain(created.token.slice(API_TOKEN_PREFIX.length));

    expect(await tokens.list(alice)).toMatchObject([{ id: created.id, name: 'iPhone shortcut' }]);
  });

  it('resolves the token to its owner and records that it was used', async () => {
    const { token, id } = await tokens.create(alice, 'Shortcut');
    expect(await tokens.findUser(token)).toMatchObject({ id: alice, username: 'alice' });

    const [used] = await database.db.select().from(apiTokens).where(eq(apiTokens.id, id));
    expect(used.lastUsedAt).toBeInstanceOf(Date);
  });

  it('only writes lastUsedAt again once it has gone stale', async () => {
    const { token, id } = await tokens.create(alice, 'Shortcut');
    const start = Date.UTC(2026, 0, 1);
    await tokens.findUser(token, start);
    await tokens.findUser(token, start + 1_000);

    const [soon] = await database.db.select().from(apiTokens).where(eq(apiTokens.id, id));
    expect(soon.lastUsedAt?.getTime()).toBe(start);

    await tokens.findUser(token, start + 120_000);
    const [later] = await database.db.select().from(apiTokens).where(eq(apiTokens.id, id));
    expect(later.lastUsedAt?.getTime()).toBe(start + 120_000);
  });

  it('rejects anything that is not a token', async () => {
    const { token } = await tokens.create(alice, 'Shortcut');
    expect(await tokens.findUser(undefined)).toBeNull();
    expect(await tokens.findUser('')).toBeNull();
    // A session cookie's token has no prefix, and must not pass as a personal access token.
    expect(await tokens.findUser(token.slice(API_TOKEN_PREFIX.length))).toBeNull();
    expect(await tokens.findUser(`${API_TOKEN_PREFIX}wrong`)).toBeNull();
  });

  it('keeps tokens private to their owner', async () => {
    const { id } = await tokens.create(alice, 'Shortcut');
    expect(await tokens.list(bob)).toEqual([]);
    await expect(tokens.revoke(bob, id)).rejects.toThrow(NotFoundException);
    expect(await tokens.list(alice)).toHaveLength(1);
  });

  it('stops working once revoked', async () => {
    const { token, id } = await tokens.create(alice, 'Shortcut');
    await tokens.revoke(alice, id);
    expect(await tokens.findUser(token)).toBeNull();
    expect(await tokens.list(alice)).toEqual([]);
  });
});
