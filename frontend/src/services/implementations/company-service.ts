import { api } from "@/lib/api-client";
import type {
  CreateCompanyResult,
  ICompanyService,
  NewCompanyPayload,
} from "@/services/interfaces/i-company-service";
import type { Company } from "@/services/types/applications";

export class CompanyService implements ICompanyService {
  searchCompanies(name?: string): Promise<Company[]> {
    const query = name ? `?name=${encodeURIComponent(name)}` : "";
    return api.get<Company[]>(`/companies${query}`).then((r) => r.data);
  }

  create(data: NewCompanyPayload): Promise<CreateCompanyResult> {
    return api
      .post<Company>("/companies", data)
      .then((r) => ({ company: r.data, created: r.status === 201 }));
  }
}
