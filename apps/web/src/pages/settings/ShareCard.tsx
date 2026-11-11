import { Check, Copy, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useApiTokens, useCreateApiToken, useRevokeApiToken } from '../../api/hooks';
import type { ApiToken } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Alert, errorText } from '../../components/ui/feedback';
import { Input } from '../../components/ui/fields';
import { formatDate } from '../../lib/format';

/**
 * Sharing a posting to Jobify from a phone. iOS has no way for an installed web app to appear
 * in the share sheet, so the share sheet entry is a shortcut, and this is where the user gets
 * the address and the token it needs. The addresses are built from the browser's own origin,
 * which is the one the phone has to reach.
 */
export function ShareCard() {
  const origin = window.location.origin;
  return (
    <Card>
      <CardHeader
        title="Add jobs from your phone"
        description="Share a posting from any app and let Jobify read it."
      />
      <div className="flex flex-col gap-5 p-5">
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Open Jobify with the posting</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            A shortcut that opens this address imports the posting and leaves the form ready to
            save. Nothing else to set up.
          </p>
          <CopyRow value={`${origin}/jobs/new?url=`} suffix="[Shortcut Input]" />
        </section>

        <section className="flex flex-col gap-2 border-t border-zinc-200 pt-5 dark:border-zinc-800">
          <h3 className="text-sm font-semibold">Save it without opening Jobify</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            A shortcut that posts to this address saves the job and shows a notification. It signs
            in with a token below instead of your browser session.
          </p>
          <CopyRow value={`${origin}/api/share`} />
          <ol className="ml-4 list-decimal text-sm text-zinc-500 marker:text-zinc-400 dark:text-zinc-400">
            <li>
              In Shortcuts, add <strong>Get contents of URL</strong> with that address, method{' '}
              <strong>POST</strong>.
            </li>
            <li>
              Request body <strong>JSON</strong>, one text field <code className={CODE}>url</code>{' '}
              set to <strong>Shortcut Input</strong>.
            </li>
            <li>
              One header: <code className={CODE}>Authorization</code> set to{' '}
              <code className={CODE}>Bearer your-token</code>.
            </li>
            <li>
              Add <strong>Show notification</strong> with the <code className={CODE}>message</code>{' '}
              from the response.
            </li>
            <li>
              In the shortcut’s details, turn on <strong>Show in Share Sheet</strong> and accept
              URLs and text.
            </li>
          </ol>
        </section>

        <section className="flex flex-col gap-3 border-t border-zinc-200 pt-5 dark:border-zinc-800">
          <h3 className="text-sm font-semibold">Access tokens</h3>
          <TokenList />
        </section>
      </div>
    </Card>
  );
}

const CODE = 'rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs dark:bg-zinc-800';

function TokenList() {
  const tokens = useApiTokens();
  const create = useCreateApiToken();
  const revoke = useRevokeApiToken();
  const [name, setName] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate(name.trim() || 'Phone shortcut', { onSuccess: () => setName('') });
  };

  return (
    <>
      {create.data && (
        <Alert tone="success">
          <p>Copy it now: this is the only time it is shown.</p>
          <div className="mt-2">
            <CopyRow value={create.data.token} />
          </div>
        </Alert>
      )}
      {tokens.data && tokens.data.length > 0 && (
        <ul className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
          {tokens.data.map((token) => (
            <TokenRow
              key={token.id}
              token={token}
              onRevoke={() => revoke.mutate(token.id)}
              revoking={revoke.isPending && revoke.variables === token.id}
            />
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
        <Input
          className="w-56"
          maxLength={100}
          placeholder="iPhone shortcut"
          aria-label="Token name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button type="submit" loading={create.isPending}>
          New token
        </Button>
      </form>
      {create.isError && <Alert>{errorText(create.error)}</Alert>}
      {revoke.isError && <Alert>{errorText(revoke.error)}</Alert>}
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        A token can do everything you can. Revoke it if the phone it is on goes missing.
      </p>
    </>
  );
}

function TokenRow({
  token,
  onRevoke,
  revoking,
}: {
  token: ApiToken;
  onRevoke: () => void;
  revoking: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="truncate font-medium">{token.name}</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Added {formatDate(token.createdAt)} ·{' '}
          {token.lastUsedAt ? `last used ${formatDate(token.lastUsedAt)}` : 'never used'}
        </p>
      </div>
      <Button
        variant="ghost"
        icon={<Trash2 className="size-4" />}
        loading={revoking}
        onClick={onRevoke}
      >
        Revoke
      </Button>
    </li>
  );
}

/** A value to copy, shown as it has to be typed into the shortcut. */
function CopyRow({ value, suffix }: { value: string; suffix?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the text is on screen to copy by hand.
    }
  };

  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-zinc-100 px-3 py-2 font-mono text-xs whitespace-nowrap dark:bg-zinc-800">
        {value}
        {suffix && <span className="text-zinc-400 dark:text-zinc-500">{suffix}</span>}
      </code>
      <Button
        variant="ghost"
        icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        onClick={() => void copy()}
      >
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}
