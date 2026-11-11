// Shared with non-DTO code (the store, the controller, the web app's types), so it lives
// outside the decorated DTO module.

/** What a file is to the application it belongs to. */
export const ATTACHMENT_KINDS = ['resume', 'cover_letter', 'posting', 'offer', 'other'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

/** Largest file the upload route accepts. A CV, a letter, a scan: not a video. */
export const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

/** Longest file name kept, in characters. */
export const ATTACHMENT_NAME_MAX_LENGTH = 300;

/**
 * The only types a browser is allowed to open in place. Everything else downloads, so a file
 * can never run as a page on Jobify's own origin and reach the session cookie. HTML, SVG and
 * anything scriptable are deliberately absent.
 */
export const INLINE_CONTENT_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'text/plain',
] as const;

export function isInlineType(contentType: string): boolean {
  return (INLINE_CONTENT_TYPES as readonly string[]).includes(contentType);
}

/**
 * The types Jobify names. Anything else is served as a download of unknown bytes, so this list
 * decides what a browser may render, and the browser's own claim about an upload is ignored.
 */
const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  txt: 'text/plain',
  md: 'text/plain',
  csv: 'text/plain',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  rtf: 'application/rtf',
  pages: 'application/octet-stream',
  zip: 'application/zip',
};

/** The content type for a file name. Unknown extensions are unknown bytes, never guessed at. */
export function contentTypeFor(name: string): string {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  return CONTENT_TYPES[extension] ?? 'application/octet-stream';
}
