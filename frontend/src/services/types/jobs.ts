export interface JobSource {
  id: string;
  code: string;
  name: string;
  base_url: string;
  is_enabled: boolean;
  last_scraped_at: string | null;
  last_scrape_status: string | null;
}

export interface JobListItem {
  id: string;
  source_code: string;
  title: string;
  company_name: string;
  location_text: string;
  job_url: string;
  employment_type: string | null;
  salary_text: string | null;
  posted_at: string | null;
  tags: string[];
  fit_score: number | null;
  matched_keywords: string[];
  missing_keywords: string[];
}

export interface JobDetail extends JobListItem {
  description_text: string;
}

export interface JobListResponse {
  items: JobListItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface JobFilters {
  source?: string;
  search?: string;
  min_fit?: number;
  posted_after?: string;
  sort?: "newest" | "oldest" | "best_fit";
  page?: number;
  page_size?: number;
}

export interface UserResume {
  id: string;
  filename: string;
  content_type: string;
  is_default: boolean;
  byte_size: number;
  created_at: string;
}

export interface AtsReport {
  score: number | null;
  warnings: string[];
  missing_keywords: string[];
}

export interface TailoredDocument {
  id: string;
  job_id: string;
  kind: string;
  provider: string;
  content_json: string;
  plain_text: string;
  created_at: string;
  ats_report: AtsReport | null;
}
