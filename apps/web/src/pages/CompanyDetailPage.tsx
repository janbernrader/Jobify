import { ArrowLeft, Building2, ExternalLink, Handshake, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useCompany, useDeleteCompany } from '../api/hooks';
import type { CompanyJob } from '../api/types';
import { CompanyDialog } from '../components/CompanyDialog';
import { Markdown } from '../components/Markdown';
import { StatusBadge } from '../components/StatusBadge';
import { Button, ButtonLink } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { Alert, EmptyState, errorText } from '../components/ui/feedback';
import { Modal } from '../components/ui/Modal';
import { PageSpinner } from '../components/ui/Spinner';
import { formatDate } from '../lib/format';

export function CompanyDetailPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const { data: company, isPending, error } = useCompany(id);
  const remove = useDeleteCompany();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (isPending) return <PageSpinner />;
  if (error) {
    return (
      <EmptyState
        icon={<Building2 className="size-6" />}
        title="Company not found"
        description={errorText(error)}
        action={<ButtonLink to="/companies">All companies</ButtonLink>}
      />
    );
  }

  // One list per hunt, newest hunt first, so a company's history reads in order.
  const byHunt = new Map<string, CompanyJob[]>();
  for (const job of company.jobs) {
    const key = job.hunt?.name ?? 'No hunt';
    byHunt.set(key, [...(byHunt.get(key) ?? []), job]);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        to="/companies"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All companies
      </Link>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            {company.name}
            {company.isAgency && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                <Handshake className="size-3" aria-hidden />
                Agency
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {company.jobCount} {company.jobCount === 1 ? 'job' : 'jobs'}
            {company.openCount > 0 && <> · {company.openCount} still open</>}
          </p>
          {company.website && (
            <a
              href={company.website}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-1 inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline dark:text-indigo-400"
            >
              <ExternalLink className="size-3.5" aria-hidden />
              {company.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
            </a>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button
            variant="ghost"
            aria-label={`Delete ${company.name}`}
            icon={<Trash2 className="size-4" />}
            onClick={() => setConfirming(true)}
          />
        </div>
      </header>

      {remove.isError && <Alert className="mb-4">{errorText(remove.error)}</Alert>}

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader title="Jobs" description="Every role here, from every hunt." />
          {company.jobs.length === 0 ? (
            <p className="p-5 text-sm text-zinc-500 dark:text-zinc-400">
              No jobs here yet. A job joins a company when you type its name on the job.
            </p>
          ) : (
            <div className="flex flex-col gap-4 p-5">
              {[...byHunt].map(([hunt, jobs]) => (
                <section key={hunt}>
                  <h3 className="mb-1 text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                    {hunt}
                  </h3>
                  <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {jobs.map((job) => (
                      <li key={job.id} className="flex items-center justify-between gap-3 py-2">
                        <Link
                          to={`/jobs/${job.id}`}
                          className="min-w-0 truncate text-sm font-medium hover:underline"
                        >
                          {job.title}
                          {job.archived && (
                            <span className="ml-2 text-xs text-zinc-400">archived</span>
                          )}
                        </Link>
                        <div className="flex shrink-0 items-center gap-3">
                          {job.appliedOn && (
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">
                              {formatDate(job.appliedOn)}
                            </span>
                          )}
                          <StatusBadge status={job.status} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="About" description="What you know about them." />
          <div className="p-5">
            {company.about ? (
              <Markdown>{company.about}</Markdown>
            ) : (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Nothing yet.{' '}
                <button
                  type="button"
                  className="text-indigo-600 hover:underline dark:text-indigo-400"
                  onClick={() => setEditing(true)}
                >
                  Add something
                </button>{' '}
                worth remembering: what they do, who you spoke to, how the process went.
              </p>
            )}
          </div>
        </Card>
      </div>

      <CompanyDialog open={editing} company={company} onClose={() => setEditing(false)} />
      <Modal
        open={confirming}
        title={`Delete ${company.name}?`}
        onClose={() => setConfirming(false)}
        footer={
          <>
            <Button onClick={() => setConfirming(false)}>Cancel</Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() =>
                remove.mutate(company.id, {
                  onSuccess: () => navigate('/companies', { replace: true }),
                  onError: () => setConfirming(false),
                })
              }
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          {company.jobCount > 0
            ? `${company.name} still has ${company.jobCount} job(s). Move or delete them first.`
            : 'This only deletes the company. Nothing else is affected.'}
        </p>
      </Modal>
    </div>
  );
}
