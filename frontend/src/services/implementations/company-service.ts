import { api } from "@/lib/api-client";
import type {
  ICompanyService,
  NewCompanyPayload,
} from "@/services/interfaces/i-company-service";
import type { Company } from "@/services/types/applications";

export class CompanyService implements ICompanyService {
  searchCompanies(name: string): Promise<Company[]> {
    return api
      .get<Company[]>(`/companies?name=${encodeURIComponent(name)}`)
      .then((r) => r.data);
  }

  create(data: NewCompanyPayload): Promise<Company> {
    return api.post<Company>("/companies", data).then((r) => r.data);
  }
}
