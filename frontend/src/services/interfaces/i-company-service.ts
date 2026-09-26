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
  searchCompanies(name: string): Promise<Company[]>;
  /** `POST /companies` — 201 new, or 200 reusing an existing visible name+url match. */
  create(data: NewCompanyPayload): Promise<CreateCompanyResult>;
}
