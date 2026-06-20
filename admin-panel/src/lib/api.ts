export const BACKENDS = {
  production: process.env.NEXT_PUBLIC_API_URL_PRODUCTION ?? "https://joaccess-backend.onrender.com",
  local:      "http://localhost:5000",
} as const;

export type BackendEnv = keyof typeof BACKENDS;

const BACKEND_ENV_KEY = "joaccess_backend_env";
const DEFAULT_ENV = (process.env.NEXT_PUBLIC_API_ENV ?? "production") as BackendEnv;

export function getBackendEnv(): BackendEnv {
  if (typeof window === "undefined") return DEFAULT_ENV;
  const stored = localStorage.getItem(BACKEND_ENV_KEY) as BackendEnv | null;
  return stored && stored in BACKENDS ? stored : DEFAULT_ENV;
}

export function setBackendEnv(env: BackendEnv): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(BACKEND_ENV_KEY, env);
}

function getBase(): string {
  return BACKENDS[getBackendEnv()] ?? BACKENDS.production;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("joaccess_admin_token");
}

export function setToken(token: string): void {
  localStorage.setItem("joaccess_admin_token", token);
}

export function clearToken(): void {
  localStorage.removeItem("joaccess_admin_token");
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  requiresAuth = true
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (requiresAuth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${getBase()}${path}`, { ...options, headers });

  if (res.status === 401 || res.status === 403) {
    clearToken();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.replace("/login");
    }
    throw new Error("Unauthorized");
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.error ?? data?.message ?? `HTTP ${res.status}`);
  }

  return data as T;
}

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  user_type: "individual" | "organization";
  org_name?: string;
  disability?: string;
  is_admin: boolean;
  created_at: string;
  location_count: number;
  review_count: number;
}

export interface Location {
  id: number;
  name: string;
  name_ar: string;
  description?: string;
  category: string;
  latitude: number;
  longitude: number;
  address?: string;
  is_verified: boolean;
  verified_at?: string;
  created_at: string;
  avg_rating: number;
  review_count: number;
  creator: string;
  creator_type: string;
  photos: string[];
  accessibility_features: {
    type: string;
    available: boolean;
    notes?: string;
  }[];
}

export interface Review {
  id: number;
  location_id: number;
  location_name: string;
  user: string;
  user_id: number;
  rating: number;
  comment?: string;
  created_at: string;
}

export interface Report {
  id: number;
  location_id: number;
  location_name: string;
  reporter: string;
  reporter_id: number;
  reason: string;
  description?: string;
  created_at: string;
  resolved: boolean;
}

export interface DashboardStats {
  total_users: number;
  total_locations: number;
  verified_locations: number;
  unverified_locations: number;
  total_reviews: number;
  total_reports: number;
  avg_rating: number;
  verification_rate: number;
  categories: [string, number][];
  monthly_locations: [string, number][];
  monthly_users: [string, number][];
  rating_distribution: [string, number][];
  top_locations: { name: string; review_count: number; avg_rating: number }[];
  recent_locations: Location[];
  recent_reviews: Review[];
}

export interface AIInsightsResponse {
  insights: string;
  recommendations: string[];
  generated_at: string;
}

export interface CVPhotoResult {
  photo_url: string;
  success: boolean;
  predicted_class?: string;
  confidence?: number;
  all_scores?: Record<string, number>;
  inference_ms?: number;
  error?: string;
}

export interface CVAnalysisResponse {
  location_id: number;
  location_name: string;
  claimed_features: string[];
  results: CVPhotoResult[];
  summary: {
    total_photos: number;
    successful: number;
    failed: number;
    feature_match_count: number;
    feature_mismatch_count: number;
  };
  analyzed_at: string;
  message?: string;
}

export async function adminLogin(
  email: string,
  password: string
): Promise<{ access_token: string; user: AdminUser }> {
  return apiFetch("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  }, false);
}

export async function getAdminMe(): Promise<AdminUser> {
  return apiFetch("/api/admin/me");
}

export async function getDashboardStats(): Promise<DashboardStats> {
  return apiFetch("/api/admin/stats");
}

export async function getLocations(params?: {
  page?: number;
  per_page?: number;
  search?: string;
  category?: string;
  verified?: boolean | "";
}): Promise<{ locations: Location[]; total: number; pages: number }> {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.per_page) q.set("per_page", String(params.per_page));
  if (params?.search) q.set("search", params.search);
  if (params?.category) q.set("category", params.category);
  if (params?.verified !== undefined && params.verified !== "")
    q.set("verified", String(params.verified));
  return apiFetch(`/api/admin/locations?${q}`);
}

export async function verifyLocation(id: number): Promise<void> {
  return apiFetch(`/api/admin/locations/${id}/verify`, { method: "POST" });
}

export async function unverifyLocation(id: number): Promise<void> {
  return apiFetch(`/api/admin/locations/${id}/unverify`, { method: "POST" });
}

export async function deleteLocation(id: number): Promise<void> {
  return apiFetch(`/api/admin/locations/${id}`, { method: "DELETE" });
}

export async function getUsers(params?: {
  page?: number;
  per_page?: number;
  search?: string;
  user_type?: "individual" | "organization" | "";
  role?: "admin" | "user" | "";
  sort_by?: "reviews" | "locations" | "";
  sort_order?: "asc" | "desc";
}): Promise<{ users: AdminUser[]; total: number; pages: number }> {
  const q = new URLSearchParams();
  if (params?.page)       q.set("page",       String(params.page));
  if (params?.per_page)   q.set("per_page",   String(params.per_page));
  if (params?.search)     q.set("search",     params.search);
  if (params?.user_type)  q.set("user_type",  params.user_type);
  if (params?.role)       q.set("role",       params.role);
  if (params?.sort_by)    q.set("sort_by",    params.sort_by);
  if (params?.sort_by && params?.sort_order)
                          q.set("sort_order", params.sort_order);
  return apiFetch(`/api/admin/users?${q}`);
}

export async function deleteUser(id: number): Promise<void> {
  return apiFetch(`/api/admin/users/${id}`, { method: "DELETE" });
}

export async function getReviews(params?: {
  page?: number;
  per_page?: number;
}): Promise<{ reviews: Review[]; total: number; pages: number }> {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.per_page) q.set("per_page", String(params.per_page));
  return apiFetch(`/api/admin/reviews?${q}`);
}

export async function deleteReview(id: number): Promise<void> {
  return apiFetch(`/api/admin/reviews/${id}`, { method: "DELETE" });
}

export async function getReports(params?: {
  page?: number;
  per_page?: number;
}): Promise<{ reports: Report[]; total: number; pages: number }> {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.per_page) q.set("per_page", String(params.per_page));
  return apiFetch(`/api/admin/reports?${q}`);
}

export async function resolveReport(id: number): Promise<void> {
  return apiFetch(`/api/admin/reports/${id}/resolve`, { method: "POST" });
}

export async function deleteReport(id: number): Promise<void> {
  return apiFetch(`/api/admin/reports/${id}`, { method: "DELETE" });
}

export async function getAIInsights(): Promise<AIInsightsResponse> {
  return apiFetch("/api/admin/ai-insights", { method: "POST" });
}

export async function analyzeLocationPhotos(locationId: number): Promise<CVAnalysisResponse> {
  return apiFetch(`/api/admin/locations/${locationId}/analyze`, { method: "POST" });
}

export function photoUrl(filename: string): string {
  // supabase urls are stored verbatim; fall back to flask static for legacy filenames
  if (filename.startsWith("http://") || filename.startsWith("https://")) {
    return filename;
  }
  return `${getBase()}/api/v1/uploads/${filename}`;
}