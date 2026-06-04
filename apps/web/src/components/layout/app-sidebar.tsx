"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar"
import {
  LayoutDashboard,
  MapPin,
  Box,
  Film,
  Activity,
  AlertTriangle,
  BarChart3,
  Droplets,
  LogOut,
  Users,
} from "lucide-react"
import { useAuth } from "@/lib/auth-context"

const navMain = [
  { title: "ダッシュボード", href: "/", icon: LayoutDashboard },
  { title: "拠点管理", href: "/sites", icon: MapPin },
  { title: "筐体管理", href: "/units", icon: Box },
  { title: "コンテンツ管理", href: "/contents", icon: Film },
]

const navMonitor = [
  { title: "稼働状況", href: "/monitoring", icon: Activity },
  { title: "アラート", href: "/alerts", icon: AlertTriangle },
  { title: "利用統計", href: "/analytics", icon: BarChart3 },
]

export function AppSidebar() {
  const pathname = usePathname()
  const { admin, logout } = useAuth()
  const canManageUsers = admin?.role === "master"

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border px-4 py-5">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[oklch(0.6_0.15_180)] to-[oklch(0.5_0.12_200)]">
            <Droplets className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight text-sidebar-foreground">
              シン・ミライ
            </p>
            <p className="text-[11px] text-sidebar-foreground/50">
              管理コンソール
            </p>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-sidebar-foreground/40">
            管理
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navMain.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={pathname === item.href}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {canManageUsers && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link href="/users" />}
                    isActive={pathname === "/users"}
                  >
                    <Users className="h-4 w-4" />
                    <span>ユーザー管理</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-sidebar-foreground/40">
            モニタリング
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navMonitor.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={pathname === item.href}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="text-sidebar-foreground/60 hover:text-sidebar-foreground"
              onClick={() => { void logout() }}
            >
              <LogOut className="h-4 w-4" />
              <span>ログアウト</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
