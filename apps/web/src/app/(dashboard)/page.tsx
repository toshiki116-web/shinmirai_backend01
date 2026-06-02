import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MapPin, Box, Film, AlertTriangle } from "lucide-react"

const stats = [
  {
    title: "稼働拠点",
    value: "12",
    description: "全拠点中",
    icon: MapPin,
    trend: "+2 今月",
  },
  {
    title: "稼働筐体",
    value: "34",
    description: "正常稼働中",
    icon: Box,
    trend: "96% 稼働率",
  },
  {
    title: "配信コンテンツ",
    value: "8",
    description: "アクティブ",
    icon: Film,
    trend: "3 配信待ち",
  },
  {
    title: "アラート",
    value: "2",
    description: "未対応",
    icon: AlertTriangle,
    trend: "要確認",
    alert: true,
  },
]

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">ダッシュボード</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          システム全体の稼働状況を確認できます
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="relative overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stat.value}</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {stat.description}
                </span>
                <Badge
                  variant={stat.alert ? "destructive" : "secondary"}
                  className="text-[10px]"
                >
                  {stat.trend}
                </Badge>
              </div>
            </CardContent>
            {stat.alert && (
              <div className="absolute inset-x-0 bottom-0 h-0.5 bg-destructive" />
            )}
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">最近のアラート</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-lg border p-3">
                <div className="mt-0.5 h-2 w-2 rounded-full bg-destructive" />
                <div className="flex-1">
                  <p className="text-sm font-medium">UNIT-A3F2B1C0 接続断</p>
                  <p className="text-xs text-muted-foreground">
                    渋谷拠点 · 5分前
                  </p>
                </div>
                <Badge variant="destructive" className="text-[10px]">
                  ERROR
                </Badge>
              </div>
              <div className="flex items-start gap-3 rounded-lg border p-3">
                <div className="mt-0.5 h-2 w-2 rounded-full bg-[oklch(0.7_0.15_60)]" />
                <div className="flex-1">
                  <p className="text-sm font-medium">UNIT-D9E4F5A2 温度警告</p>
                  <p className="text-xs text-muted-foreground">
                    新宿拠点 · 23分前
                  </p>
                </div>
                <Badge variant="secondary" className="text-[10px]">
                  WARNING
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">本日の利用状況</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">総利用回数</span>
                <span className="text-2xl font-bold">247</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">渋谷拠点</span>
                  <span className="font-medium">89回</span>
                </div>
                <div className="h-2 rounded-full bg-secondary">
                  <div className="h-2 rounded-full bg-primary" style={{ width: "36%" }} />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">新宿拠点</span>
                  <span className="font-medium">72回</span>
                </div>
                <div className="h-2 rounded-full bg-secondary">
                  <div className="h-2 rounded-full bg-chart-2" style={{ width: "29%" }} />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">池袋拠点</span>
                  <span className="font-medium">86回</span>
                </div>
                <div className="h-2 rounded-full bg-secondary">
                  <div className="h-2 rounded-full bg-chart-3" style={{ width: "35%" }} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
