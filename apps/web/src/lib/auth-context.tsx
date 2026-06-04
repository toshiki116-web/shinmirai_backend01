"use client"

import { createContext, useContext, useState, useEffect, useCallback } from "react"
import { api, setToken, clearToken, isAuthenticated, type AdminRole } from "./api-client"

type Admin = {
  id: string
  loginId: string | null
  email: string
  name: string
  role: AdminRole
}

type AuthContextType = {
  admin: Admin | null
  isLoggedIn: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem("sinmirai_admin")
    if (stored && isAuthenticated()) {
      try {
        const parsed = JSON.parse(stored) as Admin
        if (!parsed.email || !parsed.role) {
          clearToken()
          localStorage.removeItem("sinmirai_admin")
        } else {
          setAdmin(parsed)
        }
      } catch {
        clearToken()
      }
    }
    setIsLoading(false)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.login(email, password)
    setToken(data.access_token)
    setAdmin(data.admin)
    localStorage.setItem("sinmirai_admin", JSON.stringify(data.admin))
  }, [])

  const logout = useCallback(() => {
    clearToken()
    setAdmin(null)
    localStorage.removeItem("sinmirai_admin")
    window.location.href = "/login"
  }, [])

  return (
    <AuthContext.Provider
      value={{ admin, isLoggedIn: !!admin, isLoading, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
