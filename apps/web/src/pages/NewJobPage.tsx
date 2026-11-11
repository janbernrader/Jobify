import { useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { useCreateJob, useViewedHunt } from '../api/hooks';
import type { JobDraft, JobInput } from '../api/types';
import { DuplicateJobDialog, duplicatesFromError } from '../components/DuplicateJobDialog';
import { ImportPanel } from '../components/ImportPanel';
import { JobForm } from '../components/JobForm';
import { PageHeader } from '../components/PageHeader';
import { errorText } from '../components/ui/feedback';
import { sharedPosting } from '../lib/sharedPosting';

export function NewJobPage() {
  const navigate = useNavigate();
  const createJob = useCreateJob();
  // The job joins the hunt on screen. Without one, the server starts a hunt for it.
  const { hunt } = useViewedHunt();
  // The Find jobs page hands over the posting to review through the router state.
  const handed = (useLocation().state as { draft?: JobDraft } | null)?.draft;
  // The share sheet (and the iOS shortcut) hands one over in the query string instead.
  const [params] = useSearchParams();
  const shared = useMemo(() => sharedPosting(params), [params]);
  const [draft, setDraft] = useState<{ values: JobDraft; version: number }>({
    // What was shared fills the form straight away, so a posting that cannot be imported —
    // a login wall, a dead link — is still one tap from saved.
    values: handed ?? { title: shared?.title, url: shared?.url, description: shared?.text },
    version: 0,
  });
  // The input the server refused as a duplicate, kept so "Add anyway" can resend it.
  const [pending, setPending] = useState<JobInput | null>(null);
  const duplicates = pending ? duplicatesFromError(createJob.error) : null;

  const save = (input: JobInput) =>
    createJob.mutate(input, {
      onSuccess: (job) => navigate(`/jobs/${job.id}`, { replace: true }),
      onError: (error) => setPending(duplicatesFromError(error) ? input : null),
    });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Add job"
        description={
          hunt?.endedOn
            ? `This job will be added to ${hunt.name}, which is finished.`
            : 'Import a posting or enter the details yourself.'
        }
      />
      <div className="flex flex-col gap-6">
        <ImportPanel
          shared={shared}
          onImported={({ draft: values }) =>
            setDraft((current) => ({ values, version: current.version + 1 }))
          }
        />
        <JobForm
          // Remount with fresh values after each import.
          key={draft.version}
          initial={draft.values}
          submitLabel="Save job"
          submitting={createJob.isPending}
          error={
            createJob.isError && !duplicatesFromError(createJob.error)
              ? errorText(createJob.error)
              : undefined
          }
          onSubmit={(input) => save({ ...input, huntId: hunt?.id })}
          onCancel={() => navigate(-1)}
        />
      </div>
      {pending && duplicates && (
        <DuplicateJobDialog
          duplicates={duplicates}
          saving={createJob.isPending}
          onCancel={() => {
            setPending(null);
            createJob.reset();
          }}
          onConfirm={() => save({ ...pending, allowDuplicate: true })}
        />
      )}
    </div>
  );
}
