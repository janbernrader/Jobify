/** The cards on the dashboard. Users can reorder and hide them; the order here is the default. */
export const DASHBOARD_CARDS = [
  'active',
  'applied',
  'response_rate',
  'offers',
  'pipeline',
  'weekly',
  'upcoming',
  'activity',
] as const;
export type DashboardCard = (typeof DASHBOARD_CARDS)[number];

export interface DashboardLayout {
  /** Every card, visible or not, in display order. */
  order: DashboardCard[];
  hidden: DashboardCard[];
}

/** The optional columns of the Jobs table. The role column always shows. */
export const JOB_COLUMNS = [
  'status',
  'location',
  'salary',
  'tags',
  'interest',
  'applied',
  'updated',
] as const;
export type JobColumn = (typeof JOB_COLUMNS)[number];

/** Per-user UI settings. Kept in the database so they follow the user between browsers. */
export interface UserPreferences {
  dashboard: DashboardLayout;
  /** Stored as the hidden ones so columns added later show up by default. */
  hiddenJobColumns: JobColumn[];
  /**
   * The currency a new job starts with, as a three-letter code, or empty for none. A posting
   * that names its own currency keeps it; this only fills the gap.
   */
  defaultCurrency: string;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  dashboard: { order: [...DASHBOARD_CARDS], hidden: [] },
  hiddenJobColumns: [],
  defaultCurrency: '',
};

/** Currency codes are stored as the job form writes them: upper case, three letters at most. */
export function normalizeCurrency(value: string | undefined): string {
  return (value ?? '').trim().toUpperCase().slice(0, 3);
}

/**
 * Cleans up a stored layout: drops cards that no longer exist, removes duplicates and appends
 * any card that was added since the layout was saved so it does not vanish silently.
 */
export function normalizeDashboard(layout: Partial<DashboardLayout> | undefined): DashboardLayout {
  const known = (cards: DashboardCard[] | undefined) =>
    (cards ?? []).filter(
      (card, index, all) => DASHBOARD_CARDS.includes(card) && all.indexOf(card) === index,
    );
  const order = known(layout?.order);
  for (const card of DASHBOARD_CARDS) if (!order.includes(card)) order.push(card);
  return { order, hidden: known(layout?.hidden) };
}
