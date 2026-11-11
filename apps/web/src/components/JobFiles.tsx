import { Download, FileText, Paperclip, Trash2, Upload, WandSparkles } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  useDeleteFile,
  useFileText,
  useJobFiles,
  useUpdateFile,
  useUploadFile,
} from '../api/hooks';
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_KINDS,
  ATTACHMENT_MAX_BYTES,
  attachmentUrl,
  type Attachment,
  type AttachmentKind,
  type Job,
} from '../api/types';
import { cn } from '../lib/cn';
import { formatBytes, formatDate } from '../lib/format';
import { PdfThumbnail } from './PdfThumbnail';
import { Button } from './ui/Button';
import { Card, CardHeader } from './ui/Card';
import { Alert, errorText } from './ui/feedback';
import { Select } from './ui/fields';
import { Modal } from './ui/Modal';

const KIND_LABELS: Record<AttachmentKind, string> = {
  resume: 'CV',
  cover_letter: 'Cover letter',
  posting: 'Posting',
  offer: 'Offer',
  other: 'Other',
};

/** Which job field a file of this kind can fill in, and what that field is called. */
const TEXT_TARGETS = {
  resume: { label: 'Use as this job’s CV', field: 'resume' },
  cover_letter: { label: 'Use as this job’s cover letter', field: 'cover letter' },
} as const;

export function JobFiles({
  job,
  onUseText,
  saving,
}: {
  job: Job;
  /** Puts a file's text into the job: the tailored CV, or the cover letter that went out. */
  onUseText: (kind: 'resume' | 'cover_letter', text: string) => void;
  saving: boolean;
}) {
  const { data: files, isPending, error } = useJobFiles(job.id);
  const upload = useUploadFile(job.id);
  const remove = useDeleteFile(job.id);
  const [dragging, setDragging] = useState(false);
  const [tooLarge, setTooLarge] = useState<string>();
  const input = useRef<HTMLInputElement>(null);

  const send = (chosen: FileList | null) => {
    const file = chosen?.[0];
    if (!file) return;
    if (file.size > ATTACHMENT_MAX_BYTES) {
      setTooLarge(`${file.name} is larger than ${formatBytes(ATTACHMENT_MAX_BYTES)}.`);
      return;
    }
    setTooLarge(undefined);
    upload.mutate({ file, kind: kindFor(file.name) });
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    send(event.dataTransfer.files);
  };

  return (
    <Card>
      <CardHeader
        title="Files"
        description="The CV and letter you sent, the posting as it was, the offer."
        actions={
          <Button
            icon={<Upload className="size-4" />}
            loading={upload.isPending}
            onClick={() => input.current?.click()}
          >
            Add file
          </Button>
        }
      />
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn('p-5', dragging && 'bg-indigo-50/60 dark:bg-indigo-950/30')}
      >
        <input
          ref={input}
          type="file"
          accept={ATTACHMENT_ACCEPT}
          className="hidden"
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            send(event.target.files);
            event.target.value = '';
          }}
        />

        {tooLarge && <Alert className="mb-3">{tooLarge}</Alert>}
        {upload.isError && <Alert className="mb-3">{errorText(upload.error)}</Alert>}
        {remove.isError && <Alert className="mb-3">{errorText(remove.error)}</Alert>}
        {error && <Alert className="mb-3">{errorText(error)}</Alert>}

        {!isPending && files?.length === 0 ? (
          <p className="py-2 text-sm text-zinc-500 dark:text-zinc-400">
            No files yet. Drop one here, or use <strong>Add file</strong>.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {files?.map((file) => (
              <FileRow
                key={file.id}
                file={file}
                jobId={job.id}
                job={job}
                onUseText={onUseText}
                busy={saving}
                onDelete={() => remove.mutate(file.id)}
                deleting={remove.isPending && remove.variables === file.id}
              />
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function FileRow({
  file,
  jobId,
  job,
  onUseText,
  busy,
  onDelete,
  deleting,
}: {
  file: Attachment;
  jobId: number;
  job: Job;
  onUseText: (kind: 'resume' | 'cover_letter', text: string) => void;
  busy: boolean;
  onDelete: () => void;
  deleting: boolean;
}) {
  const update = useUpdateFile(jobId);
  const read = useFileText();
  const [confirming, setConfirming] = useState(false);
  const url = attachmentUrl(file.id);
  const target = file.kind === 'resume' || file.kind === 'cover_letter' ? file.kind : undefined;
  const existing = target === 'resume' ? job.profile?.resume : job.coverLetter;

  const apply = () => {
    setConfirming(false);
    if (!target) return;
    read.mutate(file.id, { onSuccess: ({ text }) => onUseText(target, text) });
  };

  return (
    <li className="flex items-start gap-3 py-3">
      {file.contentType === 'application/pdf' ? (
        <a href={url} target="_blank" rel="noreferrer" className="shrink-0">
          <PdfThumbnail url={url} width={56} />
        </a>
      ) : (
        <span className="flex size-10 shrink-0 items-center justify-center rounded bg-zinc-100 text-zinc-500 dark:bg-zinc-800">
          <FileText className="size-5" aria-hidden />
        </span>
      )}

      <div className="min-w-0 flex-1">
        <a
          href={url}
          target={file.inline ? '_blank' : undefined}
          rel="noreferrer"
          className="block truncate text-sm font-medium hover:underline"
        >
          {file.name}
        </a>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          {formatBytes(file.size)} · {formatDate(file.createdAt)}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Select
            aria-label={`What ${file.name} is`}
            className="h-8 w-36 py-0 text-xs"
            value={file.kind}
            disabled={update.isPending}
            onChange={(event) =>
              update.mutate({
                id: file.id,
                changes: { kind: event.target.value as AttachmentKind },
              })
            }
          >
            {ATTACHMENT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </Select>
          {target && (
            <Button
              size="sm"
              icon={<WandSparkles className="size-3.5" />}
              loading={read.isPending || busy}
              onClick={() => (existing ? setConfirming(true) : apply())}
            >
              {TEXT_TARGETS[target].label}
            </Button>
          )}
        </div>
        {read.isError && <Alert className="mt-2">{errorText(read.error)}</Alert>}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <a
          href={url}
          download={file.name}
          aria-label={`Download ${file.name}`}
          className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          <Download className="size-4" aria-hidden />
        </a>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Delete ${file.name}`}
          icon={<Trash2 className="size-4" />}
          loading={deleting}
          onClick={onDelete}
        />
      </div>

      {target && (
        <Modal
          open={confirming}
          title={`Replace this job’s ${TEXT_TARGETS[target].field}?`}
          onClose={() => setConfirming(false)}
          footer={
            <>
              <Button onClick={() => setConfirming(false)}>Cancel</Button>
              <Button variant="primary" onClick={apply}>
                Replace
              </Button>
            </>
          }
        >
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            The {TEXT_TARGETS[target].field} saved for this job will be replaced with the text of{' '}
            {file.name}.
          </p>
        </Modal>
      )}
    </li>
  );
}

/** A first guess at what a file is, from its name. The user can always change it. */
function kindFor(name: string): AttachmentKind {
  const lower = name.toLowerCase();
  if (/(^|[^a-z])(cv|resume|resumé|curriculum|lebenslauf)([^a-z]|$)/.test(lower)) return 'resume';
  if (/(cover|motivation|anschreiben|letter)/.test(lower)) return 'cover_letter';
  if (/(offer|contract|angebot|vertrag)/.test(lower)) return 'offer';
  if (/(posting|job|stelle|vacancy)/.test(lower)) return 'posting';
  return 'other';
}

/** Exported for the Files card's own tests. */
export const __test = { kindFor };

export const FilesIcon = Paperclip;
