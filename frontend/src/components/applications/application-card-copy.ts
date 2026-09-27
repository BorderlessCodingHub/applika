export const APPLICATIONS_PAGE_COPY = {
  title: "Applications",
  subtitle: "Manage and track all applications in your organization.",
  newApplication: "New Application",
  newWithCv: "New with CV",
  applicationsTab: "Applications",
  draftsTab: "Drafts",
  archivedSubtitle: "Viewing archived cycle",
  searchPlaceholder: "Search company or role…",
  searchLabel: "Search company or role",
  statusFilterLabel: "Status",
  allStatuses: "All statuses",
  advancedFilters: "Advanced filters",
  clearFilters: "Clear all",
  emptyTitle: "No applications found",
  emptyAction: "Create your first application",
} as const;

export function foundApplicationsLabel(count: number): string {
  return `Found ${count} application${count === 1 ? "" : "s"}`;
}

export const APPLICATION_ACTIVE_LABEL = "Active";

export const APPLICATION_STATUS_SR_PREFIX = "Status";

export const APPLICATION_ACTION_COPY = {
  edit: "Edit",
  delete: "Delete",
  cv: "CV",
  details: "Details",
} as const;

export function applicationName(role: string, company: string): string {
  return `${role} at ${company}`;
}

export const APPLICATION_DETAIL_LABELS = {
  platform: "Platform",
  source: "Source",
  date: "Date",
  experience: "Experience",
  workMode: "Work Mode",
  country: "Country",
  salaryRange: "Salary Range",
  expectedSalary: "Expected Salary",
  jobPosting: "Job posting",
  jobPostingLink: "View job posting",
  notes: "Notes",
} as const;
