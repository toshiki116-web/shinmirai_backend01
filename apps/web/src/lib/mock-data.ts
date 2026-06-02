export type Site = {
  siteId: string
  siteName: string
  address: string | null
  phoneNumber: string | null
  note: string | null
  status: "active" | "warning" | "stopped"
  createdAt: string
  updatedAt: string
  unitCount: number
}

export type Unit = {
  unitId: string
  siteId: string | null
  unitName: string
  pcUuid: string | null
  connectionMode: "online" | "offline"
  status: "normal" | "warning" | "stop" | "maintenance"
  alertMessage: string | null
  licenseStatus: "valid" | "expired" | "unknown"
  licenseExpiredAt: string | null
  lastSeenAt: string | null
  createdAt: string
  updatedAt: string
  site: { siteId: string; siteName: string } | null
}

export type Content = {
  contentId: string
  contentName: string
  language: string
  deliveryType: "general" | "limited"
  statusCategory: "status1" | "status2" | "status3"
  filePath: string | null
  fileSize: string | null
  checksum: string | null
  version: number
  isActive: boolean
  createdAt: string
  updatedAt: string
  assignedSiteCount: number
}

export type DeviceAlert = {
  id: string
  unitId: string
  alertType: string
  deviceName: string | null
  detail: string | null
  level: "info" | "warning" | "error" | "critical"
  occurredAt: string
  createdAt: string
  unit: { unitId: string; unitName: string; site: { siteName: string } | null }
}

export type DailyAnalytics = {
  id: string
  unitId: string
  targetDate: string
  useCount: number
  unit: { unitId: string; unitName: string; site: { siteId: string; siteName: string } | null }
}

export const mockSites: Site[] = [
  { siteId: "LOC-0001", siteName: "渋谷スクランブルスクエア店", address: "東京都渋谷区渋谷2-24-12", phoneNumber: "03-1234-5678", note: "B1Fエントランス横", status: "active", createdAt: "2026-03-01T00:00:00.000Z", updatedAt: "2026-05-15T00:00:00.000Z", unitCount: 4 },
  { siteId: "LOC-0002", siteName: "新宿ミロード店", address: "東京都新宿区西新宿1-1-3", phoneNumber: "03-2345-6789", note: null, status: "active", createdAt: "2026-03-10T00:00:00.000Z", updatedAt: "2026-05-20T00:00:00.000Z", unitCount: 3 },
  { siteId: "LOC-0003", siteName: "池袋サンシャイン店", address: "東京都豊島区東池袋3-1-1", phoneNumber: "03-3456-7890", note: "3F噴水広場付近", status: "active", createdAt: "2026-03-15T00:00:00.000Z", updatedAt: "2026-05-18T00:00:00.000Z", unitCount: 3 },
  { siteId: "LOC-0004", siteName: "大阪梅田グランフロント店", address: "大阪府大阪市北区大深町4-1", phoneNumber: "06-1234-5678", note: "北館2F", status: "warning", createdAt: "2026-04-01T00:00:00.000Z", updatedAt: "2026-05-28T00:00:00.000Z", unitCount: 2 },
  { siteId: "LOC-0005", siteName: "名古屋栄オアシス21店", address: "愛知県名古屋市東区東桜1-11-1", phoneNumber: "052-123-4567", note: null, status: "active", createdAt: "2026-04-10T00:00:00.000Z", updatedAt: "2026-05-25T00:00:00.000Z", unitCount: 2 },
  { siteId: "LOC-0006", siteName: "福岡キャナルシティ店", address: "福岡県福岡市博多区住吉1-2", phoneNumber: "092-123-4567", note: "サウスビル1F", status: "active", createdAt: "2026-04-15T00:00:00.000Z", updatedAt: "2026-05-22T00:00:00.000Z", unitCount: 2 },
  { siteId: "LOC-0007", siteName: "札幌ステラプレイス店", address: "北海道札幌市中央区北5条西2", phoneNumber: "011-123-4567", note: null, status: "stopped", createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-05-30T00:00:00.000Z", unitCount: 1 },
]

export const mockUnits: Unit[] = [
  { unitId: "UNIT-A3F2B1C0", siteId: "LOC-0001", unitName: "渋谷1号機", pcUuid: "550e8400-e29b-41d4-a716-446655440001", connectionMode: "online", status: "normal", alertMessage: null, licenseStatus: "valid", licenseExpiredAt: "2027-06-01T00:00:00.000Z", lastSeenAt: "2026-06-01T10:55:00.000Z", createdAt: "2026-03-01T00:00:00.000Z", updatedAt: "2026-06-01T10:55:00.000Z", site: { siteId: "LOC-0001", siteName: "渋谷スクランブルスクエア店" } },
  { unitId: "UNIT-B4E3C2D1", siteId: "LOC-0001", unitName: "渋谷2号機", pcUuid: "550e8400-e29b-41d4-a716-446655440002", connectionMode: "online", status: "normal", alertMessage: null, licenseStatus: "valid", licenseExpiredAt: "2027-06-01T00:00:00.000Z", lastSeenAt: "2026-06-01T10:54:00.000Z", createdAt: "2026-03-01T00:00:00.000Z", updatedAt: "2026-06-01T10:54:00.000Z", site: { siteId: "LOC-0001", siteName: "渋谷スクランブルスクエア店" } },
  { unitId: "UNIT-C5F4D3E2", siteId: "LOC-0001", unitName: "渋谷3号機", pcUuid: "550e8400-e29b-41d4-a716-446655440003", connectionMode: "offline", status: "stop", alertMessage: "電源断検出", licenseStatus: "valid", licenseExpiredAt: "2027-06-01T00:00:00.000Z", lastSeenAt: "2026-05-31T18:30:00.000Z", createdAt: "2026-03-05T00:00:00.000Z", updatedAt: "2026-05-31T18:30:00.000Z", site: { siteId: "LOC-0001", siteName: "渋谷スクランブルスクエア店" } },
  { unitId: "UNIT-D6A5E4F3", siteId: "LOC-0001", unitName: "渋谷4号機", pcUuid: "550e8400-e29b-41d4-a716-446655440004", connectionMode: "online", status: "maintenance", alertMessage: null, licenseStatus: "valid", licenseExpiredAt: "2027-06-01T00:00:00.000Z", lastSeenAt: "2026-06-01T08:00:00.000Z", createdAt: "2026-04-01T00:00:00.000Z", updatedAt: "2026-06-01T08:00:00.000Z", site: { siteId: "LOC-0001", siteName: "渋谷スクランブルスクエア店" } },
  { unitId: "UNIT-E7B6F5A4", siteId: "LOC-0002", unitName: "新宿1号機", pcUuid: "550e8400-e29b-41d4-a716-446655440005", connectionMode: "online", status: "normal", alertMessage: null, licenseStatus: "valid", licenseExpiredAt: "2027-04-01T00:00:00.000Z", lastSeenAt: "2026-06-01T10:50:00.000Z", createdAt: "2026-03-10T00:00:00.000Z", updatedAt: "2026-06-01T10:50:00.000Z", site: { siteId: "LOC-0002", siteName: "新宿ミロード店" } },
  { unitId: "UNIT-F8C7A6B5", siteId: "LOC-0002", unitName: "新宿2号機", pcUuid: "550e8400-e29b-41d4-a716-446655440006", connectionMode: "online", status: "warning", alertMessage: "温度異常検知", licenseStatus: "valid", licenseExpiredAt: "2027-04-01T00:00:00.000Z", lastSeenAt: "2026-06-01T10:48:00.000Z", createdAt: "2026-03-10T00:00:00.000Z", updatedAt: "2026-06-01T10:48:00.000Z", site: { siteId: "LOC-0002", siteName: "新宿ミロード店" } },
  { unitId: "UNIT-A9D8B7C6", siteId: "LOC-0002", unitName: "新宿3号機", pcUuid: "550e8400-e29b-41d4-a716-446655440007", connectionMode: "online", status: "normal", alertMessage: null, licenseStatus: "expired", licenseExpiredAt: "2026-05-01T00:00:00.000Z", lastSeenAt: "2026-06-01T10:52:00.000Z", createdAt: "2026-03-15T00:00:00.000Z", updatedAt: "2026-06-01T10:52:00.000Z", site: { siteId: "LOC-0002", siteName: "新宿ミロード店" } },
  { unitId: "UNIT-B1E9C8D7", siteId: "LOC-0003", unitName: "池袋1号機", pcUuid: "550e8400-e29b-41d4-a716-446655440008", connectionMode: "online", status: "normal", alertMessage: null, licenseStatus: "valid", licenseExpiredAt: "2027-03-01T00:00:00.000Z", lastSeenAt: "2026-06-01T10:45:00.000Z", createdAt: "2026-03-15T00:00:00.000Z", updatedAt: "2026-06-01T10:45:00.000Z", site: { siteId: "LOC-0003", siteName: "池袋サンシャイン店" } },
  { unitId: "UNIT-C2F1D9E8", siteId: "LOC-0004", unitName: "梅田1号機", pcUuid: "550e8400-e29b-41d4-a716-446655440009", connectionMode: "online", status: "warning", alertMessage: "HDD使用率90%超過", licenseStatus: "valid", licenseExpiredAt: "2027-04-01T00:00:00.000Z", lastSeenAt: "2026-06-01T10:30:00.000Z", createdAt: "2026-04-01T00:00:00.000Z", updatedAt: "2026-06-01T10:30:00.000Z", site: { siteId: "LOC-0004", siteName: "大阪梅田グランフロント店" } },
  { unitId: "UNIT-D3A2E1F9", siteId: "LOC-0005", unitName: "名古屋1号機", pcUuid: "550e8400-e29b-41d4-a716-446655440010", connectionMode: "online", status: "normal", alertMessage: null, licenseStatus: "valid", licenseExpiredAt: "2027-04-01T00:00:00.000Z", lastSeenAt: "2026-06-01T10:40:00.000Z", createdAt: "2026-04-10T00:00:00.000Z", updatedAt: "2026-06-01T10:40:00.000Z", site: { siteId: "LOC-0005", siteName: "名古屋栄オアシス21店" } },
]

export const mockContents: Content[] = [
  { contentId: "CNT-00001", contentName: "リラクゼーション映像 Vol.1", language: "ja", deliveryType: "general", statusCategory: "status1", filePath: "/contents/2026/03/relax_vol1.mp4", fileSize: "1073741824", checksum: "a1b2c3d4e5f6", version: 3, isActive: true, createdAt: "2026-03-01T00:00:00.000Z", updatedAt: "2026-05-20T00:00:00.000Z", assignedSiteCount: 5 },
  { contentId: "CNT-00002", contentName: "アクアセラピー映像 Vol.1", language: "ja", deliveryType: "general", statusCategory: "status1", filePath: "/contents/2026/03/aqua_vol1.mp4", fileSize: "2147483648", checksum: "b2c3d4e5f6a7", version: 2, isActive: true, createdAt: "2026-03-10T00:00:00.000Z", updatedAt: "2026-05-15T00:00:00.000Z", assignedSiteCount: 7 },
  { contentId: "CNT-00003", contentName: "季節限定：桜スペシャル", language: "ja", deliveryType: "limited", statusCategory: "status2", filePath: "/contents/2026/03/sakura_sp.mp4", fileSize: "536870912", checksum: "c3d4e5f6a7b8", version: 1, isActive: true, createdAt: "2026-03-20T00:00:00.000Z", updatedAt: "2026-03-20T00:00:00.000Z", assignedSiteCount: 3 },
  { contentId: "CNT-00004", contentName: "Relaxation Movie Vol.1", language: "en", deliveryType: "general", statusCategory: "status1", filePath: "/contents/2026/04/relax_en_vol1.mp4", fileSize: "1073741824", checksum: "d4e5f6a7b8c9", version: 1, isActive: true, createdAt: "2026-04-01T00:00:00.000Z", updatedAt: "2026-04-01T00:00:00.000Z", assignedSiteCount: 2 },
  { contentId: "CNT-00005", contentName: "メンテナンスガイド映像", language: "ja", deliveryType: "general", statusCategory: "status3", filePath: "/contents/2026/04/maintenance.mp4", fileSize: "268435456", checksum: "e5f6a7b8c9d0", version: 1, isActive: true, createdAt: "2026-04-15T00:00:00.000Z", updatedAt: "2026-04-15T00:00:00.000Z", assignedSiteCount: 7 },
  { contentId: "CNT-00006", contentName: "夏季限定：マリンブルー", language: "ja", deliveryType: "limited", statusCategory: "status1", filePath: null, fileSize: null, checksum: null, version: 1, isActive: true, createdAt: "2026-05-25T00:00:00.000Z", updatedAt: "2026-05-25T00:00:00.000Z", assignedSiteCount: 0 },
]

export const mockAlerts: DeviceAlert[] = [
  { id: "alt-001", unitId: "UNIT-C5F4D3E2", alertType: "device_disconnected", deviceName: null, detail: "ハートビート未受信が5分を超過しました", level: "error", occurredAt: "2026-06-01T10:55:00.000Z", createdAt: "2026-06-01T10:55:00.000Z", unit: { unitId: "UNIT-C5F4D3E2", unitName: "渋谷3号機", site: { siteName: "渋谷スクランブルスクエア店" } } },
  { id: "alt-002", unitId: "UNIT-F8C7A6B5", alertType: "temperature_warning", deviceName: "main_sensor", detail: "内部温度が45℃を超過しました（現在47.2℃）", level: "warning", occurredAt: "2026-06-01T10:32:00.000Z", createdAt: "2026-06-01T10:32:00.000Z", unit: { unitId: "UNIT-F8C7A6B5", unitName: "新宿2号機", site: { siteName: "新宿ミロード店" } } },
  { id: "alt-003", unitId: "UNIT-C2F1D9E8", alertType: "disk_usage_high", deviceName: null, detail: "HDD使用率が90%を超過しました（現在92.3%）", level: "warning", occurredAt: "2026-06-01T09:15:00.000Z", createdAt: "2026-06-01T09:15:00.000Z", unit: { unitId: "UNIT-C2F1D9E8", unitName: "梅田1号機", site: { siteName: "大阪梅田グランフロント店" } } },
  { id: "alt-004", unitId: "UNIT-A3F2B1C0", alertType: "content_download_failed", deviceName: null, detail: "CNT-00003のダウンロードに失敗しました（タイムアウト）", level: "info", occurredAt: "2026-06-01T08:20:00.000Z", createdAt: "2026-06-01T08:20:00.000Z", unit: { unitId: "UNIT-A3F2B1C0", unitName: "渋谷1号機", site: { siteName: "渋谷スクランブルスクエア店" } } },
  { id: "alt-005", unitId: "UNIT-D6A5E4F3", alertType: "license_expiring", deviceName: null, detail: "ライセンスの有効期限が30日以内です", level: "info", occurredAt: "2026-05-31T00:00:00.000Z", createdAt: "2026-05-31T00:00:00.000Z", unit: { unitId: "UNIT-D6A5E4F3", unitName: "渋谷4号機", site: { siteName: "渋谷スクランブルスクエア店" } } },
  { id: "alt-006", unitId: "UNIT-E7B6F5A4", alertType: "device_error", deviceName: "water_pump", detail: "ウォーターポンプの異常を検知しました", level: "critical", occurredAt: "2026-05-30T14:22:00.000Z", createdAt: "2026-05-30T14:22:00.000Z", unit: { unitId: "UNIT-E7B6F5A4", unitName: "新宿1号機", site: { siteName: "新宿ミロード店" } } },
]

export const mockAnalytics: DailyAnalytics[] = (() => {
  const data: DailyAnalytics[] = []
  const units = [
    { unitId: "UNIT-A3F2B1C0", unitName: "渋谷1号機", siteId: "LOC-0001", siteName: "渋谷スクランブルスクエア店" },
    { unitId: "UNIT-B4E3C2D1", unitName: "渋谷2号機", siteId: "LOC-0001", siteName: "渋谷スクランブルスクエア店" },
    { unitId: "UNIT-E7B6F5A4", unitName: "新宿1号機", siteId: "LOC-0002", siteName: "新宿ミロード店" },
    { unitId: "UNIT-B1E9C8D7", unitName: "池袋1号機", siteId: "LOC-0003", siteName: "池袋サンシャイン店" },
  ]
  const baseCounts = [85, 72, 65, 78]
  for (let d = 0; d < 14; d++) {
    const date = new Date(2026, 4, 19 + d)
    const dateStr = date.toISOString().split("T")[0]
    units.forEach((u, i) => {
      const variance = Math.floor(Math.sin(d * 3 + i * 7) * 20 + baseCounts[i])
      data.push({
        id: `ana-${d}-${i}`,
        unitId: u.unitId,
        targetDate: dateStr,
        useCount: Math.max(30, variance),
        unit: { unitId: u.unitId, unitName: u.unitName, site: { siteId: u.siteId, siteName: u.siteName } },
      })
    })
  }
  return data
})()

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" })
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}

export function formatFileSize(bytes: string | null): string {
  if (!bytes) return "-"
  const n = Number(bytes)
  if (n < 1024) return `${n} B`
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`
  return `${(n / 1073741824).toFixed(2)} GB`
}

export const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "稼働中", variant: "default" },
  warning: { label: "警告", variant: "destructive" },
  stopped: { label: "停止", variant: "secondary" },
  normal: { label: "正常", variant: "default" },
  stop: { label: "停止", variant: "secondary" },
  maintenance: { label: "保守中", variant: "outline" },
  valid: { label: "有効", variant: "default" },
  expired: { label: "期限切れ", variant: "destructive" },
  unknown: { label: "未確認", variant: "secondary" },
  online: { label: "オンライン", variant: "default" },
  offline: { label: "オフライン", variant: "secondary" },
  general: { label: "一般配信", variant: "default" },
  limited: { label: "限定配信", variant: "outline" },
  status1: { label: "ステータス1", variant: "default" },
  status2: { label: "ステータス2", variant: "secondary" },
  status3: { label: "ステータス3", variant: "outline" },
  info: { label: "INFO", variant: "secondary" },
  error: { label: "ERROR", variant: "destructive" },
  critical: { label: "CRITICAL", variant: "destructive" },
}
