/**
 * What the share sheet handed over, from `/jobs/new?url=…&text=…&title=…`.
 *
 * Those parameters are the manifest's `share_target`, and the same shape an iOS shortcut uses
 * when it opens Jobify with a shared link (see docs/share-to-jobify.md). Apps are inconsistent
 * about which one carries the link: some set `url`, others put it at the end of `text`, so the
 * link is looked for in both.
 */
export interface SharedPosting {
  url?: string;
  /** Shared text worth keeping, which is to say text that is more than just the link. */
  text?: string;
  title?: string;
}

const LINK = /https?:\/\/[^\s<>"']+/i;

export function sharedPosting(params: URLSearchParams): SharedPosting | undefined {
  const text = params.get('text')?.trim() || undefined;
  const title = params.get('title')?.trim() || undefined;
  const url = params.get('url')?.trim() || text?.match(LINK)?.[0];
  // Sharing a link often repeats it as the text; that is not a posting description.
  const body = text && text !== url ? text : undefined;
  if (!url && !body && !title) return undefined;
  return { url, text: body, title };
}
