import { Building2, ExternalLink, Handshake, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useCompanies } from '../api/hooks';
import type { Company } from '../api/types';
import { CompanyDialog } from '../components/CompanyDialog';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Alert, EmptyState, errorText } from '../components/ui/feedback';
import { Input, Select } from '../components/ui/fields';
import { PageSpinner } from '../components/ui/Spinner';
import { cn } from '../lib/cn';
import { formatRelative } from '../lib/format';

type Filter = 'all' | 'open' | 'agencies';
type Sort = 'name' | 'jobs' | 'recent';

export function CompaniesPage() {
  const { data: companies, isPending, error } = useCompanies();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('name');
  const [adding, setAdding] = useState(false);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = (companies ?? []).filter((company) => {
      if (filter === 'open' && company.openCount === 0) return false;
      if (filter === 'agencies' && !company.isAgency) return false;
      if (!needle) return true;
      return `${company.name} ${company.website ?? ''}`.toLowerCase().includes(needle);
    });
    return matches.sort((a, b) => {
      if (sort === 'jobs') return b.jobCount - a.jobCount || a.name.localeCompare(b.name);
      if (sort === 'recent') {
        return (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? '');
      }
      return a.name.localeCompare(b.name);
    });
  }, [companies, query, filter, sort]);

  if (isPending) return <PageSpinner />;
  if (error) return <Alert>{errorText(error)}</Alert>;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Companies"
        description="Everyone you have a job with, across every hunt, and the agencies in between."
        actions={
          <Button
            variant="primary"
            icon={<Plus className="size-4" />}
            onClick={() => setAdding(true)}
          >
            Add company
          </Button>
        }
      />

      {companies.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Building2 className="size-6" />}
            title="No companies yet"
            description="Every job you add brings its company with it, and they show up here."
          />
        </Card>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-56 flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400"
                aria-hidden
              />
              <Input
                className="pl-9"
                placeholder="Search companies"
                aria-label="Search companies"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <Select
              aria-label="Which companies"
              className="w-40"
              value={filter}
              onChange={(event) => setFilter(event.target.value as Filter)}
            >
              <option value="all">All</option>
              <option value="open">With open jobs</option>
              <option value="agencies">Agencies</option>
            </Select>
            <Select
              aria-label="Sort companies"
              className="w-40"
              value={sort}
              onChange={(event) => setSort(event.target.value as Sort)}
            >
              <option value="name">By name</option>
              <option value="jobs">Most jobs</option>
              <option value="recent">Recently active</option>
            </Select>
          </div>

          {shown.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Search className="size-6" />}
                title="Nothing matches"
                description="Try another search, or widen the filter."
              />
            </Card>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((company) => (
                <CompanyCard key={company.id} company={company} />
              ))}
            </ul>
          )}
        </>
      )}

      <CompanyDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function CompanyCard({ company }: { company: Company }) {
  return (
    <li>
      <Card className="h-full p-4 transition-colors hover:border-indigo-300 dark:hover:border-indigo-700">
        <div className="flex items-start justify-between gap-2">
          <Link
            to={`/companies/${company.id}`}
            className="min-w-0 text-sm font-semibold hover:underline"
          >
            {company.name}
          </Link>
          {company.isAgency && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
              <Handshake className="size-3" aria-hidden />
              Agency
            </span>
          )}
        </div>

        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          <span className={cn(company.openCount > 0 && 'text-zinc-700 dark:text-zinc-200')}>
            {company.jobCount} {company.jobCount === 1 ? 'job' : 'jobs'}
          </span>
          {company.openCount > 0 && <> · {company.openCount} open</>}
          {company.lastActivityAt && <> · {formatRelative(company.lastActivityAt)}</>}
        </p>

        {company.website && (
          <a
            href={company.website}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-2 inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline dark:text-indigo-400"
          >
            <ExternalLink className="size-3" aria-hidden />
            {company.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
          </a>
        )}
      </Card>
    </li>
  );
}
