import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AppConfig } from '../config/configuration.js';
import type { Database } from '../database/database.module.js';
import { ATTACHMENT_MAX_BYTES } from './file.constants.js';
import { FilesService } from './files.service.js';

/**
 * A files service writing to a throwaway directory, for the specs of everything that has to
 * take files with it when it deletes something.
 */
export function createTestFiles(
  db: Database,
  dir?: string,
  maxBytes = ATTACHMENT_MAX_BYTES,
): FilesService {
  const files = { dir: dir ?? mkdtempSync(path.join(tmpdir(), 'jobify-files-')), maxBytes };
  return new FilesService(db, { files } as AppConfig);
}
