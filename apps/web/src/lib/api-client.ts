const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api"

type ApiResponse<T> = {
  result: "ok"
  data: T
  message: string
}

type ApiError = {
  result: "ng"
  error_code: string
  message: string
}

export type AdminRole = "master" | "editor" | "viewer"

export type AdminUser = {
  id: string
  loginId: string | null
  email: string
  name: string
  role: AdminRole
  note: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public errorCode: string,
    message: string,
  ) {
    super(message)
    this.name = "ApiClientError"
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem("sinmirai_token")
}

export function setToken(token: string) {
  localStorage.setItem("sinmirai_token", token)
  document.cookie = `sinmirai_token=${token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`
}

export function clearToken() {
  localStorage.removeItem("sinmirai_token")
  document.cookie = "sinmirai_token=; path=/; max-age=0"
}

export function isAuthenticated(): boolean {
  return !!getToken()
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) ?? {}),
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  })

  if (res.status === 401) {
    clearToken()
    if (typeof window !== "undefined") {
      window.location.href = "/login"
    }
    throw new ApiClientError(401, "UNAUTHORIZED", "認証が無効です。再ログインしてください。")
  }

  const body = await res.json()

  if (!res.ok || body.result === "ng") {
    const err = body as ApiError
    throw new ApiClientError(res.status, err.error_code ?? "UNKNOWN", err.message ?? "エラーが発生しました")
  }

  return (body as ApiResponse<T>).data
}

export const api = {
  // 認証
  login: (email: string, password: string) =>
    request<{ access_token: string; admin: { id: string; loginId: string | null; email: string; name: string; role: AdminRole } }>(
      "/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) },
    ),

  // ユーザー管理
  getUsers: (params?: { page?: number; limit?: number; keyword?: string; role?: string; isActive?: boolean }) => {
    const q = new URLSearchParams()
    if (params?.page) q.set("page", String(params.page))
    if (params?.limit) q.set("limit", String(params.limit))
    if (params?.keyword) q.set("keyword", params.keyword)
    if (params?.role) q.set("role", params.role)
    if (params?.isActive !== undefined) q.set("isActive", String(params.isActive))
    return request<{ items: AdminUser[]; total: number; page: number; limit: number }>(`/admin/users?${q}`)
  },
  getUser: (id: string) => request<AdminUser>(`/admin/users/${id}`),
  createUser: (data: { email: string; name: string; password: string; role: AdminRole; note?: string }) =>
    request<AdminUser>("/admin/users", { method: "POST", body: JSON.stringify(data) }),
  updateUser: (id: string, data: Partial<{ email: string; name: string; role: AdminRole; note: string; isActive: boolean }>) =>
    request<AdminUser>(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  resetUserPassword: (id: string, password: string) =>
    request<AdminUser>(`/admin/users/${id}/password`, { method: "PATCH", body: JSON.stringify({ password }) }),
  deleteUser: (id: string) =>
    request<AdminUser>(`/admin/users/${id}`, { method: "DELETE" }),

  // 拠点
  getSites: (params?: { page?: number; limit?: number; keyword?: string; status?: string }) => {
    const q = new URLSearchParams()
    if (params?.page) q.set("page", String(params.page))
    if (params?.limit) q.set("limit", String(params.limit))
    if (params?.keyword) q.set("keyword", params.keyword)
    if (params?.status) q.set("status", params.status)
    return request<{ items: any[]; total: number; page: number; limit: number }>(`/admin/sites?${q}`)
  },
  getSite: (siteId: string) => request<any>(`/admin/sites/${siteId}`),
  createSite: (data: { siteName: string; address?: string; phoneNumber?: string; note?: string }) =>
    request<any>("/admin/sites", { method: "POST", body: JSON.stringify(data) }),
  updateSite: (siteId: string, data: Partial<{ siteName: string; address: string; phoneNumber: string; note: string }>) =>
    request<any>(`/admin/sites/${siteId}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteSite: (siteId: string) =>
    request<any>(`/admin/sites/${siteId}`, { method: "DELETE" }),

  // 筐体
  getUnits: (params?: { page?: number; limit?: number; keyword?: string; siteId?: string; status?: string }) => {
    const q = new URLSearchParams()
    if (params?.page) q.set("page", String(params.page))
    if (params?.limit) q.set("limit", String(params.limit))
    if (params?.keyword) q.set("keyword", params.keyword)
    if (params?.siteId) q.set("siteId", params.siteId)
    if (params?.status) q.set("status", params.status)
    return request<{ items: any[]; total: number; page: number; limit: number }>(`/admin/units?${q}`)
  },
  getUnit: (unitId: string) => request<any>(`/admin/units/${unitId}`),
  createUnit: (data: { siteId: string; unitName: string; connectionMode?: string }) =>
    request<any>("/admin/units", { method: "POST", body: JSON.stringify(data) }),
  updateUnit: (unitId: string, data: Partial<{ siteId: string; unitName: string; connectionMode: string }>) =>
    request<any>(`/admin/units/${unitId}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteUnit: (unitId: string) =>
    request<any>(`/admin/units/${unitId}`, { method: "DELETE" }),

  // コンテンツ
  getContents: (params?: { page?: number; limit?: number; keyword?: string; deliveryType?: string; statusCategory?: string }) => {
    const q = new URLSearchParams()
    if (params?.page) q.set("page", String(params.page))
    if (params?.limit) q.set("limit", String(params.limit))
    if (params?.keyword) q.set("keyword", params.keyword)
    if (params?.deliveryType) q.set("deliveryType", params.deliveryType)
    if (params?.statusCategory) q.set("statusCategory", params.statusCategory)
    return request<{ items: any[]; total: number; page: number; limit: number }>(`/admin/contents?${q}`)
  },
  getContent: (contentId: string) => request<any>(`/admin/contents/${contentId}`),
  createContent: (data: { contentName: string; language?: string; deliveryType?: string; statusCategory?: string; siteIds?: string[] }) =>
    request<any>("/admin/contents", { method: "POST", body: JSON.stringify(data) }),
  updateContent: (contentId: string, data: Partial<{ contentName: string; language: string; deliveryType: string; statusCategory: string; siteIds: string[] }>) =>
    request<any>(`/admin/contents/${contentId}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteContent: (contentId: string) =>
    request<any>(`/admin/contents/${contentId}`, { method: "DELETE" }),
  assignSites: (contentId: string, siteIds: string[]) =>
    request<any>(`/admin/contents/${contentId}/assign`, { method: "POST", body: JSON.stringify({ siteIds }) }),
}
