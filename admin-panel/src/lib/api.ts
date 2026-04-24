/**
 * api.ts
 * -------
 * Centralised HTTP client for all Flask backend calls.
 * The token is stored in localStorage (client-side only).
 * Every request that needs auth picks it up from there.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

// ─── Token helpers ──────────────────────────────────────────────────────────

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

// ─── Base fetch wrapper ──────────────────────────────────────────────────────

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

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

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

// ─── Types ───────────────────────────────────────────────────────────────────

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
  // Charts
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

// ─── Auth ────────────────────────────────────────────────────────────────────

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

// ─── Dashboard ───────────────────────────────────────────────────────────────

export async function getDashboardStats(): Promise<DashboardStats> {
  return apiFetch("/api/admin/stats");
}

// ─── Locations ───────────────────────────────────────────────────────────────

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

// ─── Users ───────────────────────────────────────────────────────────────────

export async function getUsers(params?: {
  page?: number;
  per_page?: number;
  search?: string;
}): Promise<{ users: AdminUser[]; total: number; pages: number }> {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.per_page) q.set("per_page", String(params.per_page));
  if (params?.search) q.set("search", params.search);
  return apiFetch(`/api/admin/users?${q}`);
}

export async function deleteUser(id: number): Promise<void> {
  return apiFetch(`/api/admin/users/${id}`, { method: "DELETE" });
}

// ─── Reviews ─────────────────────────────────────────────────────────────────

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

// ─── Reports ─────────────────────────────────────────────────────────────────

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

// ─── AI Insights ─────────────────────────────────────────────────────────────

export async function getAIInsights(): Promise<AIInsightsResponse> {
  return apiFetch("/api/admin/ai-insights", { method: "POST" });
}

// ─── Photo URL helper ─────────────────────────────────────────────────────────

export function photoUrl(filename: string): string {
  return `${BASE}/api/v1/uploads/${filename}`;
}
