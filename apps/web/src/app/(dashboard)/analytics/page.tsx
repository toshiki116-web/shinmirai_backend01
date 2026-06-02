"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BarChart3, TrendingUp, MapPin } from "lucide-react"
import { mockAnalytics, mockSites } from "@/lib/mock-data"

export default function AnalyticsPage() {
  const siteStats = mockSites
    .filter((s) => s.status !== "stopped")
    .map((site) => {
      const siteData = mockAnalytics.filter((a) => a.unit.site?.siteId === site.siteId)
      const totalUse = siteData.reduce((sum, a) => sum + a.useCount, 0)
      const last7 = siteData.filter((a) => {
        const d = new Date(a.targetDate)
        const now = new Date("2026-06-01")
        return (now.getTime() - d.getTime()) / 86400000 <= 7
      })
      const last7Total = last7.reduce((sum, a) => sum + a.useCount, 0)
      return { ...site, totalUse, last7Total }
    })
    .sort((a, b) => b.last7Total - a.last7Total)

  const totalUsage = mockAnalytics.reduce((sum, a) => sum + a.useCount, 0)
  const last7Usage = mockAnalytics
    .filter((a) => {
      const d = new Date(a.targetDate)
      const now = new Date("2026-06-01")
      return (now.getTime() - d.getTime()) / 86400000 <= 7
    })
    .reduce((sum, a) => sum + a.useCount, 0)

  const dateRange: string[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(2026, 4, 19 + (13 - i))
    dateRange.push(d.toISOString().split("T")[0])
  }

  const dailyTotals = dateRange.map((date) => ({
    date,
    label: `${new Date(date).getMonth() + 1}/${new Date(date).getDate()}`,
    total: mockAnalytics
      .filter((a) => a.targetDate === date)
      .reduce((sum, a) => sum + a.useCount, 0),
  }))

  const maxDaily = Math.max(...dailyTotals.map((d) => d.total), 1)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">利用統計</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          筐体の利用状況をグラフで確認できます
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 pt-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <BarChart3 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalUsage.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">総利用回数（14日間）</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-chart-2/10">
              <TrendingUp className="h-6 w-6 text-chart-2" />
            </div>
            <div>
              <p className="text-2xl font-bold">{last7Usage.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">直近7日間</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-chart-4/10">
              <BarChart3 className="h-6 w-6 text-chart-4" />
            </div>
            <div>
              <p className="text-2xl font-bold">{Math.round(last7Usage / 7)}</p>
              <p className="text-sm text-muted-foreground">日平均（7日間）</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">日別利用回数（14日間）</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-1.5" style={{ height: "200px" }}>
            {dailyTotals.map((day) => (
              <div key={day.date} className="group relative flex flex-1 flex-col items-center justify-end h-full">
                <div className="absolute -top-6 hidden rounded bg-foreground px-2 py-1 text-xs text-background group-hover:block">
                  {day.total}回
                </div>
                <div
                  className="w-full rounded-t bg-primary/80 transition-colors group-hover:bg-primary"
                  style={{ height: `${(day.total / maxDaily) * 100}%`, minHeight: "4px" }}
                />
                <span className="mt-2 text-[10px] text-muted-foreground">{day.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">拠点別利用状況</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {siteStats.map((site, i) => {
              const maxVal = Math.max(...siteStats.map((s) => s.last7Total), 1)
              const barColors = [
                "bg-primary",
                "bg-chart-2",
                "bg-chart-3",
                "bg-chart-4",
                "bg-chart-5",
                "bg-chart-1",
              ]
              return (
                <div key={site.siteId} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{site.siteName}</span>
                      {i === 0 && (
                        <Badge variant="default" className="text-[10px]">1位</Badge>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold">{site.last7Total.toLocaleString()}</span>
                      <span className="ml-1 text-xs text-muted-foreground">回/7日</span>
                    </div>
                  </div>
                  <div className="h-3 rounded-full bg-secondary">
                    <div
                      className={`h-3 rounded-full transition-all ${barColors[i % barColors.length]}`}
                      style={{ width: `${(site.last7Total / maxVal) * 100}%` }}
                    />
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
