import type { Company } from "@/services/types/applications";

export interface NewCompanyPayload {
  name: string;
  url: string;
}

export interface CreateCompanyResult {
  company: Company;
  /** `true` on a 201 (new row); `false` on a 200 (reused an existing visible name+url match, R-021). */
  created: boolean;
}

export interface ICompanyService {
  /**
   * `GET /companies?name=` — visible companies (public + the caller's
   * private ones), searched by name. `name` omitted or blank hits
   * `GET /companies` with no query (KODI-035): every visible company, so
   * the picker can list them on open (AC1), the same as `IPlatformService.list`.
   */
  searchCompanies(name?: string): Promise<Company[]>;
  /** `POST /companies` — 201 new, or 200 reusing an existing visible name+url match. */
  create(data: NewCompanyPayload): Promise<CreateCompanyResult>;
}
