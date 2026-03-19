import type { Company } from "@/services/types/applications";

export interface ICompanyService {
  searchCompanies(name: string): Promise<Company[]>;
  createCompany(name: string, url?: string): Promise<Company>;
}
