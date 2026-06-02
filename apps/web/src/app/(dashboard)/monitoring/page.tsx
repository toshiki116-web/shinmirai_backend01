"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Wifi, WifiOff, Box, MapPin } from "lucide-react"
import { mockUnits, mockSites, statusLabels } from "@/lib/mock-data"

function timeSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return "たった今"
  if (min < 60) return `${min}分前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}時間前`
  return `${Math.floor(hr / 24)}日前`
}

export default function MonitoringPage() {
  const siteGroups = mockSites
    .filter((s) => s.status !== "stopped")
    .map((site) => ({
      ...site,
      units: mockUnits.filter((u) => u.siteId === site.siteId),
    }))

  const onlineCount = mockUnits.filter((u) => u.connectionMode === "online").length
  const totalCount = mockUnits.length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">稼働状況</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          全筐体のリアルタイム稼働状況を監視しています
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 pt-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-chart-2/10">
              <Wifi className="h-6 w-6 text-chart-2" />
            </div>
            <div>
              <p className="text-2xl font-bold">{onlineCount}<span className="text-base font-normal text-muted-foreground">/{totalCount}</span></p>
              <p className="text-sm text-muted-foreground">オンライン</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[oklch(0.7_0.15_60)]/10">
              <Box className="h-6 w-6 text-[oklch(0.7_0.15_60)]" />
            </div>
            <div>
              <p className="text-2xl font-bold">{mockUnits.filter((u) => u.status === "warning").length}</p>
              <p className="text-sm text-muted-foreground">警告中</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10">
              <WifiOff className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold">{mockUnits.filter((u) => u.connectionMode === "offline").length}</p>
              <p className="text-sm text-muted-foreground">オフライン</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        {siteGroups.map((site) => (
          <Card key={site.siteId}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">
                  <Link href={`/sites/${site.siteId}`} className="hover:underline">
                    {site.siteName}
                  </Link>
                </CardTitle>
                <Badge variant={statusLabels[site.status]?.variant ?? "secondary"} className="text-[10px]">
                  {statusLabels[site.status]?.label ?? site.status}
                </Badge>
                <span className="ml-auto text-xs text-muted-foreground">{site.siteId}</span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {site.units.map((unit) => {
                  const isOnline = unit.connectionMode === "online"
                  const hasAlert = unit.status === "warning" || unit.status === "stop"
                  return (
                    <Link
                      key={unit.unitId}
                      href={`/units/${unit.unitId}`}
                      className={`rounded-lg border p-4 transition-all hover:shadow-md ${
                        hasAlert
                          ? "border-destructive/30 bg-destructive/5"
                          : unit.status === "maintenance"
                            ? "border-muted-foreground/30 bg-muted/50"
                            : "hover:bg-accent"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`h-2.5 w-2.5 rounded-full ${
                            !isOnline ? "bg-muted-foreground" :
                            unit.status === "normal" ? "bg-chart-2" :
                            unit.status === "warning" ? "bg-[oklch(0.7_0.15_60)]" :
                            unit.status === "stop" ? "bg-destructive" :
                            "bg-muted-foreground"
                          }`} />
                          <span className="text-sm font-semibold">{unit.unitName}</span>
                        </div>
                        <Badge variant={statusLabels[unit.status]?.variant ?? "secondary"} className="text-[10px]">
                          {statusLabels[unit.status]?.label ?? unit.status}
                        </Badge>
                      </div>
                      <div className="mt-2 space-y-1">
                        <p className="font-mono text-[10px] text-muted-foreground">{unit.unitId}</p>
                        {unit.alertMessage && (
                          <p className="text-xs text-destructive">{unit.alertMessage}</p>
                        )}
                        <p className="text-[10px] text-muted-foreground">
                          最終通信: {unit.lastSeenAt ? timeSince(unit.lastSeenAt) : "-"}
                        </p>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
