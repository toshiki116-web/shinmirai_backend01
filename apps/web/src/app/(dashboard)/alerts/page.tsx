"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { AlertTriangle, Search, Box } from "lucide-react"
import { mockAlerts, statusLabels, formatDateTime } from "@/lib/mock-data"

export default function AlertsPage() {
  const criticalCount = mockAlerts.filter((a) => a.level === "critical").length
  const errorCount = mockAlerts.filter((a) => a.level === "error").length
  const warningCount = mockAlerts.filter((a) => a.level === "warning").length
  const infoCount = mockAlerts.filter((a) => a.level === "info").length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">アラート</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          全{mockAlerts.length}件のアラートを表示しています
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="border-l-4 border-l-destructive">
          <CardContent className="flex items-center justify-between pt-4">
            <div>
              <p className="text-xs text-muted-foreground">CRITICAL</p>
              <p className="text-2xl font-bold text-destructive">{criticalCount}</p>
            </div>
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-destructive/70">
          <CardContent className="flex items-center justify-between pt-4">
            <div>
              <p className="text-xs text-muted-foreground">ERROR</p>
              <p className="text-2xl font-bold">{errorCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-[oklch(0.7_0.15_60)]">
          <CardContent className="flex items-center justify-between pt-4">
            <div>
              <p className="text-xs text-muted-foreground">WARNING</p>
              <p className="text-2xl font-bold">{warningCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-muted-foreground">
          <CardContent className="flex items-center justify-between pt-4">
            <div>
              <p className="text-xs text-muted-foreground">INFO</p>
              <p className="text-2xl font-bold">{infoCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="アラート内容・筐体IDで検索" className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {mockAlerts.map((alert) => {
              const levelColor =
                alert.level === "critical" ? "bg-destructive" :
                alert.level === "error" ? "bg-destructive/80" :
                alert.level === "warning" ? "bg-[oklch(0.7_0.15_60)]" :
                "bg-muted-foreground"

              return (
                <div
                  key={alert.id}
                  className={`rounded-lg border p-4 transition-colors ${
                    alert.level === "critical" || alert.level === "error"
                      ? "border-destructive/20 bg-destructive/5"
                      : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${levelColor}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{alert.alertType}</span>
                        <Badge variant={statusLabels[alert.level]?.variant ?? "secondary"} className="text-[10px]">
                          {statusLabels[alert.level]?.label ?? alert.level.toUpperCase()}
                        </Badge>
                      </div>
                      {alert.detail && (
                        <p className="mt-1 text-sm text-muted-foreground">{alert.detail}</p>
                      )}
                      <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                        <Link
                          href={`/units/${alert.unitId}`}
                          className="flex items-center gap-1 hover:text-primary hover:underline"
                        >
                          <Box className="h-3 w-3" />
                          {alert.unit.unitName}
                        </Link>
                        {alert.unit.site && (
                          <span>{alert.unit.site.siteName}</span>
                        )}
                        {alert.deviceName && (
                          <span className="font-mono">{alert.deviceName}</span>
                        )}
                        <span>{formatDateTime(alert.occurredAt)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
