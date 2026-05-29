const BASE = "/api";

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    let msg = "Lỗi không xác định";
    try {
      const j = await res.json();
      if (typeof j.detail === "string") msg = j.detail;
      else if (Array.isArray(j.detail)) msg = j.detail.map((d: { msg?: string }) => d.msg || JSON.stringify(d)).join("; ");
      else if (j.message) msg = String(j.message);
      else msg = JSON.stringify(j);
    } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ---- Auth ----
export type User = { id: number; email: string; created_at: string };
export const register = (email: string, password: string) =>
  req<User>("/auth/register", { method: "POST", body: JSON.stringify({ email, password }) });
export const login = (email: string, password: string) =>
  req<User>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
export const logout = () => req<{ ok: boolean }>("/auth/logout", { method: "POST" });
export const getMe = () => req<User>("/auth/me");

// ---- Sources ----
export type SourceOption = { key: string; label: string; choices: { value: string; label: string }[]; default?: string };
export type Source = { code: string; name: string; base_url: string; description: string; icon_hint: string; highlight: boolean; options?: SourceOption[] };
export const listSources = () => req<Source[]>("/sources");

// ---- Crawl ----
export const startCrawl = (source: string, params?: Record<string, any>) =>
  req<{ job_id: number; source: string; status: string }>(`/crawl/${source}`, {
    method: "POST",
    body: JSON.stringify({ params: params || null }),
  });

// ---- Jobs ----
export type Job = {
  id: number; source: string; status: string;
  total_found: number; total_saved: number;
  error: string | null; started_at: string | null; finished_at: string | null; created_at: string;
  params?: Record<string, any> | null;
};
export const listJobs = () => req<Job[]>("/jobs");
export const getJob = (id: number) => req<Job>(`/jobs/${id}`);

// ---- Programs ----
export type Program = {
  id: number; source: string; external_id: string; name: string;
  url: string | null; signup_url: string | null;
  category: string | null; commission: string | null;
  commission_value: number | null; commission_type: string | null;
  payout: string | null; cookie_duration: string | null;
  description: string | null; tags_json: string | null;
  raw_json: string | null; source_url: string | null;
  directory_traffic: string | null;
  directory_popularity: string | null;
  directory_status: string | null;
  logo_url?: string | null;
  short_description?: string | null;
  directory_network?: string | null;
  directory_approval?: string | null;
  directory_approval_time?: string | null;
  directory_attribution?: string | null;
  directory_tracking?: string | null;
  directory_last_verified_at?: string | null;
  directory_program_age?: string | null;
  payout_min?: number | null;
  payout_currency?: string | null;
  payout_frequency?: string | null;
  payout_methods_json?: string | null;
  commission_duration?: string | null;
  commission_conditions?: string | null;
  restrictions_json?: string | null;
  agents_json?: string | null;
  registrations_open?: number | null;
  traffic_score: number | null;
  traffic_period_month: string | null;
  traffic_details_json: string | null;
  traffic_scanned_at: string | null;
  sms_country_id?: string | null;
  sms_service_id?: string | null;
  sms_profile_id?: string | null;
  crawled_at: string; updated_at: string;
};
export type TrafficGlobalPoint = {
  period_month: string;
  total_visits_monthly: number;
  avg_visits_monthly?: number;
  unique_visits_monthly: number;
  repeat_visits_monthly: number;
  pages_per_visit: number;
  avg_visit_duration: number;
  bounce_rate_percentage: number;
};
export type TrafficCountryRow = {
  country_code: string;
  country_name: string;
  traffic_share_percentage: number;
  total_visits_monthly: number | null;
  pages_per_visit: number;
  avg_visit_duration: number;
  bounce_rate_percentage: number;
};
export type TrafficSourceBreakdown = {
  period_month: string;
  organic_search: number;
  paid_search: number;
  social: number;
  email: number;
  direct: number;
  referrals: number;
  display_ads: number;
};
export type TrafficSocialPoint = { platform_name: string; share_percentage: number | null };
export type TrafficDetails = {
  global?: TrafficGlobalPoint[];
  country?: TrafficCountryRow[];
  source?: TrafficSourceBreakdown | null;
  social?: TrafficSocialPoint[];
};
export type ProgramList = { items: Program[]; total: number; page: number; page_size: number };
export type ProgramFilter = {
  source?: string;
  category?: string;
  search?: string;
  min_commission?: number;
  max_commission?: number;
  min_traffic?: number;
  min_cookie_days?: number;
  has_traffic?: boolean;
  has_signup?: boolean;
  directory_status?: string;
  networks?: string[];
  approval?: string;
  registrations_open?: boolean;
  payout_currency?: string;
  payout_frequency?: string;
};
const toParams = (q: Record<string, any>): URLSearchParams => {
  const params = new URLSearchParams();
  Object.entries(q).forEach(([k, v]) => {
    if (v === undefined || v === "" || v === null) return;
    if (Array.isArray(v)) v.forEach((x) => params.append(k, String(x)));
    else params.set(k, String(v));
  });
  return params;
};
export const listPrograms = (q: ProgramFilter & { page?: number; page_size?: number; sort_by?: string; order?: "asc" | "desc" } = {}) => {
  const qs = toParams(q).toString();
  return req<ProgramList>(`/programs${qs ? "?" + qs : ""}`);
};
export const getProgram = (id: number) => req<Program>(`/programs/${id}`);
export const updateProgramSmsPreset = (id: number, body: { sms_country_id?: string; sms_service_id?: string; sms_profile_id?: string }) =>
  req<Program>(`/programs/${id}/sms-preset`, { method: "PATCH", body: JSON.stringify(body) });
export type SmsOption = { id: string; name: string };
export const listSmsCountries = () => req<SmsOption[]>(`/sms/countries`);
export const listSmsServices = () => req<SmsOption[]>(`/sms/services`);
export const listProgramIds = (q: ProgramFilter & { sort_by?: string; order?: "asc" | "desc" } = {}) => {
  const qs = toParams(q).toString();
  return req<number[]>(`/programs/ids${qs ? "?" + qs : ""}`);
};
export type ProgramFacets = {
  networks: string[];
  currencies: string[];
  frequencies: string[];
  statuses: string[];
  approvals: string[];
};
export const listProgramFacets = (source?: string) => {
  const qs = source ? `?source=${encodeURIComponent(source)}` : "";
  return req<ProgramFacets>(`/programs/facets${qs}`);
};
export const deleteProgram = (id: number) => req<{ ok: boolean }>(`/programs/${id}`, { method: "DELETE" });
export const bulkDeletePrograms = (ids: number[]) =>
  req<{ deleted: number }>(`/programs/bulk-delete`, { method: "POST", body: JSON.stringify({ ids }) });
export const listProgramCategories = (source?: string) => {
  const qs = source ? `?source=${encodeURIComponent(source)}` : "";
  return req<string[]>(`/programs/categories${qs}`);
};
export const exportProgramsCsvUrl = (q: { source?: string; category?: string; search?: string; min_commission?: number; max_commission?: number; min_traffic?: number; min_cookie_days?: number; has_traffic?: boolean; has_signup?: boolean; ids?: number[] } = {}) => {
  const params = new URLSearchParams();
  Object.entries(q).forEach(([k, v]) => {
    if (v === undefined || v === "" || v === null) return;
    if (Array.isArray(v)) { if (v.length) params.set(k, v.join(",")); }
    else params.set(k, String(v));
  });
  const qs = params.toString();
  return `${BASE}/programs/export.csv${qs ? "?" + qs : ""}`;
};
export type ImportProgramsResult = { saved: number; skipped: number; errors: { row: number; error: string }[] };
export const importProgramsCsv = async (file: File): Promise<ImportProgramsResult> => {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${BASE}/programs/import.csv`, {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  if (!res.ok) {
    let msg = "Import thất bại";
    try { const j = await res.json(); msg = j.detail || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
};

// ---- Profiles ----
export type EmailEntry = { label: string; value: string; app_password: string; notes: string; primary: boolean; status: string };
export type PhoneEntry = { label: string; value: string; country: string; sms_provider: string; notes: string; primary: boolean };
export type ProxyEntry = { label: string; url: string; type: string; region: string; notes: string; primary: boolean; status: string };
export type ProfileMeta = {
  id: string; full_name: string; ho: string; ten: string; niche: string[]; country: string; notes: string; updated_at: string;
  tags?: string[];
};
export type Profile = ProfileMeta & {
  password: string; website: string;
  payment: Record<string, any>; created_at: string;
  tags?: string[];
};
export const listProfiles = () => req<ProfileMeta[]>("/profiles");
export const getProfile = (id: string) => req<Profile>(`/profiles/${id}`);
export const createProfile = (data: Partial<Profile> & { id: string }) =>
  req<Profile>("/profiles", { method: "POST", body: JSON.stringify(data) });
export const updateProfile = (id: string, data: Partial<Profile> & { id: string }) =>
  req<Profile>(`/profiles/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteProfile = (id: string) => req<{ ok: boolean }>(`/profiles/${id}`, { method: "DELETE" });
export const duplicateProfile = (id: string) => req<{ id: string }>(`/profiles/${id}/duplicate`, { method: "POST" });

// ---- Instructions ----
export type InstructionMeta = { name: string; size: number; updated_at: string };
export type Instruction = InstructionMeta & { content: string };
export const listInstructions = () => req<InstructionMeta[]>("/instructions");
export const getInstruction = (name: string) => req<Instruction>(`/instructions/${encodeURIComponent(name)}`);
export const createInstruction = (name: string, content: string) =>
  req<Instruction>("/instructions", { method: "POST", body: JSON.stringify({ name, content }) });
export const updateInstruction = (name: string, content: string) =>
  req<Instruction>(`/instructions/${encodeURIComponent(name)}`, { method: "PUT", body: JSON.stringify({ name, content }) });
export const deleteInstruction = (name: string) => req<{ ok: boolean }>(`/instructions/${encodeURIComponent(name)}`, { method: "DELETE" });

// ---- Emails (standalone resource) ----
export type EmailMeta = {
  id: string; address: string; label: string; provider: string;
  has_app_password: boolean; has_totp: boolean;
  recovery_email: string; phone: string; status: string;
  tags: string[]; notes: string;
  last_tested_at: string; last_test_result: string; last_test_error: string;
  updated_at: string;
};
export type EmailItem = EmailMeta & {
  password: string; app_password: string; totp_secret: string;
  otp_link: string; created_at?: string;
};
export const listEmails = () => req<EmailMeta[]>("/emails");
export const getEmail = (id: string) => req<EmailItem>(`/emails/${id}`);
export const createEmail = (data: Partial<EmailItem>) =>
  req<EmailItem>("/emails", { method: "POST", body: JSON.stringify(data) });
export const updateEmail = (id: string, data: Partial<EmailItem>) =>
  req<EmailItem>(`/emails/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteEmail = (id: string) => req<{ ok: boolean }>(`/emails/${id}`, { method: "DELETE" });
export const bulkImportEmails = (raw: string) =>
  req<{ created: number; items: EmailItem[]; skipped: string[] }>(`/emails/bulk-import`, {
    method: "POST", body: JSON.stringify({ raw }),
  });
export const testEmail = (id: string) =>
  req<{ ok: boolean; error: string; elapsed_ms: number; inbox_count: number }>(`/emails/${id}/test`, { method: "POST" });

// ---- SMS OTP provider status ----
export type SmsStatus = {
  provider: string;
  enabled: boolean;
  api_key_masked: string;
  ok: boolean;
  balance: string;
  currency: string;
  error: string;
  default_country: string;
  default_country_name: string;
  default_product: string;
  default_product_name: string;
  default_operator: string;
  timeout_sec: number;
  docs_url: string;
};
export const getSmsStatus = () => req<SmsStatus>("/sms/status");

// ---- SMS Profiles (multi-config sharing 1 API key) ----
export type SmsProfileMeta = {
  id: string; name: string;
  country_id: string; country_name: string;
  service_id: string; service_name: string;
  operator: string; notes: string; tags: string[]; status: string;
  last_tested_at: string; last_test_result: string; last_test_error: string; last_test_phone: string;
  created_at: string; updated_at: string;
};
export type SmsProfileTestOut = {
  ok: boolean; stock?: number; error?: string;
  country_name?: string; service_name?: string;
  balance?: string; currency?: string;
};
export const listSmsProfiles = () => req<SmsProfileMeta[]>("/sms-profiles");
export const getSmsProfile = (id: string) => req<SmsProfileMeta>(`/sms-profiles/${id}`);
export const createSmsProfile = (data: Partial<SmsProfileMeta>) =>
  req<SmsProfileMeta>("/sms-profiles", { method: "POST", body: JSON.stringify(data) });
export const updateSmsProfile = (id: string, data: Partial<SmsProfileMeta>) =>
  req<SmsProfileMeta>(`/sms-profiles/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteSmsProfile = (id: string) => req<{ ok: boolean }>(`/sms-profiles/${id}`, { method: "DELETE" });
export const testSmsProfile = (id: string) =>
  req<SmsProfileTestOut>(`/sms-profiles/${id}/test`, { method: "POST" });
export const checkSmsCombo = (body: { country_id: string; service_id: string }) =>
  req<{ ok: boolean; stock: number; country_name?: string; service_name?: string; error?: string }>(
    `/sms-profiles/check`,
    { method: "POST", body: JSON.stringify(body) },
  );

// ---- Proxies (standalone resource) ----
export type ProxyMeta = {
  id: string; label: string; host: string; port: number; type: string;
  country: string; provider: string; username: string; has_password: boolean;
  url: string; status: string; last_tested_at: string; last_test_result: string;
  last_test_ip: string; tags: string[]; notes: string; updated_at: string;
};
export type ProxyItem = ProxyMeta & { password: string; created_at?: string };
export const listProxies = () => req<ProxyMeta[]>("/proxies");
export const getProxy = (id: string) => req<ProxyItem>(`/proxies/${id}`);
export const createProxy = (data: Partial<ProxyItem>) =>
  req<ProxyItem>("/proxies", { method: "POST", body: JSON.stringify(data) });
export const updateProxy = (id: string, data: Partial<ProxyItem>) =>
  req<ProxyItem>(`/proxies/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteProxy = (id: string) => req<{ ok: boolean }>(`/proxies/${id}`, { method: "DELETE" });
export const bulkImportProxies = (raw: string, default_type = "http") =>
  req<{ created: number; items: ProxyItem[]; skipped: string[] }>(`/proxies/bulk-import`, {
    method: "POST", body: JSON.stringify({ raw, default_type }),
  });
export const testProxy = (id: string) =>
  req<{ ok: boolean; ip: string; error: string; elapsed_ms: number }>(`/proxies/${id}/test`, { method: "POST" });

// ---- Shortlists ----
export type Weights = { traffic: number; commission: number; cookie: number };
export type Thresholds = { min_traffic: number; min_commission: number; min_cookie_days: number };
export type Criteria = {
  weights: Weights;
  thresholds: Thresholds;
  sources: string[];
  categories: string[];
  search: string;
  missing_traffic_policy: "zero" | "ignore" | "include";
};
export const DEFAULT_CRITERIA: Criteria = {
  weights: { traffic: 0.4, commission: 0.3, cookie: 0.3 },
  thresholds: { min_traffic: 300000, min_commission: 15, min_cookie_days: 30 },
  sources: [], categories: [], search: "",
  missing_traffic_policy: "zero",
};
export type Shortlist = {
  id: number; name: string; description: string | null;
  criteria: Criteria; item_count: number;
  created_at: string; updated_at: string;
};
export type ShortlistItem = {
  id: number; program_id: number; added_manually: boolean;
  score: number | null; note: string | null; added_at: string;
  program: Program | null;
};
export type ScoredProgram = { program: Program; score: number; breakdown: { traffic: number; commission: number; cookie: number } };

export const listShortlists = () => req<Shortlist[]>("/shortlists");
export const getShortlist = (id: number) => req<Shortlist>(`/shortlists/${id}`);
export const createShortlist = (body: { name: string; description?: string; criteria: Criteria }) =>
  req<Shortlist>("/shortlists", { method: "POST", body: JSON.stringify(body) });
export const updateShortlist = (id: number, body: { name?: string; description?: string; criteria?: Criteria }) =>
  req<Shortlist>(`/shortlists/${id}`, { method: "PUT", body: JSON.stringify(body) });
export const deleteShortlist = (id: number) => req<void>(`/shortlists/${id}`, { method: "DELETE" });

export const previewCriteria = (criteria: Criteria, limit = 100) =>
  req<{ items: ScoredProgram[]; total: number }>(`/shortlists/preview?limit=${limit}`, {
    method: "POST", body: JSON.stringify(criteria),
  });
export const previewShortlist = (id: number, limit = 100) =>
  req<{ items: ScoredProgram[]; total: number }>(`/shortlists/${id}/preview?limit=${limit}`, { method: "POST" });

export const getShortlistItems = (id: number) => req<ShortlistItem[]>(`/shortlists/${id}/items`);
export const addShortlistItem = (id: number, program_id: number, note = "") =>
  req<ShortlistItem>(`/shortlists/${id}/items`, { method: "POST", body: JSON.stringify({ program_id, note }) });
export const removeShortlistItem = (id: number, program_id: number) =>
  req<void>(`/shortlists/${id}/items/${program_id}`, { method: "DELETE" });
export const autoFillShortlist = (id: number, limit = 50, replace = false) =>
  req<{ added: number }>(`/shortlists/${id}/auto-fill`, { method: "POST", body: JSON.stringify({ limit, replace }) });
export const updateProgramTraffic = (program_id: number, traffic_score: number) =>
  req<{ id: number; traffic_score: number }>(`/shortlists/programs/${program_id}/traffic`, {
    method: "PATCH", body: JSON.stringify({ traffic_score }),
  });
export const scanProgramTraffic = (program_id: number) =>
  req<{ program_id: number; url: string; domain: string; monthly_visits: number; period_month: string; found: boolean; traffic_score: number; has_details: boolean }>(
    `/programs/${program_id}/scan-traffic`, { method: "POST" }
  );

export type BulkScanTrafficResult = {
  total: number;
  matched: number;
  scanned: number;
  found: number;
  skipped: number;
  failed: number;
  items: Array<{
    program_id: number;
    name: string;
    status: "ok" | "empty" | "skipped" | "failed";
    monthly_visits?: number;
    period_month?: string;
    traffic_score?: number;
    error?: string;
  }>;
};
export const bulkScanProgramTraffic = (
  ids: number[],
  skip_existing = true,
  months = 3,
  concurrency = 2,
) =>
  req<BulkScanTrafficResult>(`/programs/bulk-scan-traffic`, {
    method: "POST",
    body: JSON.stringify({ ids, skip_existing, months, concurrency }),
  });

export type TrafficScanJob = {
  id: number;
  status: "pending" | "running" | "success" | "failed";
  total: number;
  scanned: number;
  found: number;
  skipped: number;
  failed: number;
  months: number;
  concurrency: number;
  skip_existing: boolean;
  program_ids: number[];
  results: Array<{
    program_id: number;
    name: string;
    status: "ok" | "empty" | "skipped" | "failed";
    monthly_visits?: number;
    period_month?: string;
    error?: string;
  }>;
  error?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at?: string | null;
};

export const createTrafficScanJob = (
  ids: number[],
  skip_existing = true,
  months = 3,
  concurrency = 2,
) =>
  req<TrafficScanJob>(`/programs/bulk-scan-traffic-job`, {
    method: "POST",
    body: JSON.stringify({ ids, skip_existing, months, concurrency }),
  });

export const getTrafficScanJob = (job_id: number) =>
  req<TrafficScanJob>(`/programs/traffic-jobs/${job_id}`);

// ---- Signup (auto-register) ----
export type SignupAttempt = {
  program_id: number;
  profile_id: string | null;
  status: string;
  message?: string;
  steps?: number;
  final_url?: string;
  screenshot?: string;
  duration_sec?: number;
  started_at?: string;
  finished_at?: string;
};
export type SignupJob = {
  id: number;
  user_id: number | null;
  program_ids: number[];
  profile_ids: string[];
  email_ids: string[];
  proxy_ids: string[];
  instruction_names: string[];
  instruction_name: string | null;
  extra_prompt: string | null;
  headless: boolean;
  status: string;
  total: number;
  succeeded: number;
  failed: number;
  results: SignupAttempt[];
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string | null;
  sms_profile_id?: string | null;
  batch_id?: string | null;
};
export const createSignupJob = (data: {
  program_ids: number[]; profile_ids: string[];
  email_ids?: string[]; proxy_ids?: string[]; instruction_names?: string[];
  instruction_name?: string; extra_prompt?: string; headless?: boolean;
  sms_profile_id?: string;
}) => req<SignupJob>("/signup/jobs", { method: "POST", body: JSON.stringify(data) });
export const createSignupJobBatch = async (data: {
  program_ids_list: number[][];
  profile_ids: string[];
  email_ids?: string[]; proxy_ids?: string[]; instruction_names?: string[];
  instruction_name?: string; extra_prompt?: string; headless?: boolean;
  sms_profile_id?: string;
}): Promise<SignupJob[]> => {
  const batchId = crypto.randomUUID();
  const { program_ids_list, ...rest } = data;
  return Promise.all(
    program_ids_list.map((ids) =>
      req<SignupJob>("/signup/jobs", { method: "POST", body: JSON.stringify({ ...rest, program_ids: ids, batch_id: batchId }) })
    )
  );
};
export const listSignupJobs = () => req<SignupJob[]>("/signup/jobs");
export const getSignupJob = (id: number) => req<SignupJob>(`/signup/jobs/${id}`);

// ---- System status (config / API keys health) ----
export type SystemSubsystem = {
  key: string;
  label: string;
  enabled: boolean;
  value: string;
  required: boolean;
  note: string;
};
export type SystemStatus = {
  app: string;
  ready: boolean;
  fully_configured: boolean;
  subsystems: SystemSubsystem[];
  missing_required: string[];
  missing_optional: string[];
  signup_max_steps: number;
};
export const getSystemStatus = () => req<SystemStatus>("/system/status");

// ---- Connection tests (real ping) ----
export type ConnTestResult = {
  ok: boolean;
  error?: string;
  elapsed_ms?: number;
  // LLM
  provider?: string;
  model?: string;
  // CapSolver / SMS
  balance?: string;
  currency?: string;
  // IMAP
  email?: string;
  inbox_count?: number;
  // Proxy
  ip?: string;
  proxy_name?: string;
};
export type SystemTestAllOut = {
  results: {
    llm: ConnTestResult;
    capsolver: ConnTestResult;
    sms: ConnTestResult;
    imap: ConnTestResult;
    proxy: ConnTestResult;
  };
  total_ms: number;
};
export const testAllConnections = () =>
  req<SystemTestAllOut>("/system/test-all", { method: "POST" });
export type SystemTestOneOut = { key: string; result: ConnTestResult };
export const testOneConnection = (key: "llm" | "capsolver" | "sms" | "imap" | "proxy") =>
  req<SystemTestOneOut>(`/system/test-one?key=${encodeURIComponent(key)}`, { method: "POST" });

// ---- Google Ads Transparency Center (SerpAPI) ----
export type AdCreative = {
  advertiser_id: string;
  advertiser?: string;
  ad_creative_id: string;
  format?: string;             // text | image | video
  link?: string;
  target_domain?: string;
  image?: string;
  total_days_shown?: number;
  first_shown?: number;        // unix ts
  last_shown?: number;         // unix ts
  details_link?: string;
  serpapi_details_link?: string;
  [k: string]: any;
};
export type AdsSearchResult = {
  search_metadata?: any;
  search_parameters?: any;
  search_information?: { total_results?: number };
  ad_creatives?: AdCreative[];
  pagination?: { next?: string; next_page_token?: string };
  serpapi_pagination?: { next_page_token?: string };
  error?: string;
};
export type AdsSearchRequest = {
  text?: string;
  advertiser_id?: string;
  platform?: string;
  creative_format?: string;
  start_date?: string;
  end_date?: string;
  region?: string;
  political_ads?: boolean;
  num?: number;
  next_page_token?: string;
};
export const searchAdsTransparency = (body: AdsSearchRequest) =>
  req<AdsSearchResult>("/ads-transparency/search", { method: "POST", body: JSON.stringify(body) });
export const getAdDetails = (advertiser_id: string, creative_id: string, region = "") =>
  req<any>("/ads-transparency/ad-details", {
    method: "POST",
    body: JSON.stringify({ advertiser_id, creative_id, region }),
  });

export type AdsHistoryItem = {
  id: number;
  text: string;
  advertiser_id: string;
  platform: string;
  creative_format: string;
  region: string;
  start_date: string;
  end_date: string;
  num: number;
  political_ads: boolean;
  result_count: number;
  results_json: string | null;
  created_at: string | null;
};
export const listAdsHistory = (limit = 30) =>
  req<AdsHistoryItem[]>(`/ads-transparency/history?limit=${limit}`);
export const deleteAdsHistory = (id: number) =>
  req<{ ok: boolean }>(`/ads-transparency/history/${id}`, { method: "DELETE" });
export const clearAdsHistory = () =>
  req<{ ok: boolean }>(`/ads-transparency/history`, { method: "DELETE" });
