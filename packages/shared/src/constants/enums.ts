/** 拠点のステータス */
export const SiteStatus = {
  /** 正常稼働 */
  ACTIVE: 'active',
  /** 警告あり */
  WARNING: 'warning',
  /** 停止中 */
  STOPPED: 'stopped',
  /** 削除済み（論理削除） */
  DELETED: 'deleted',
} as const;
export type SiteStatus = (typeof SiteStatus)[keyof typeof SiteStatus];

/** 筐体のステータス */
export const UnitStatus = {
  /** 正常稼働 */
  NORMAL: 'normal',
  /** 警告あり（接続不良等） */
  WARNING: 'warning',
  /** 停止中 */
  STOP: 'stop',
  /** 保守中 */
  MAINTENANCE: 'maintenance',
  /** 削除済み（論理削除） */
  DELETED: 'deleted',
} as const;
export type UnitStatus = (typeof UnitStatus)[keyof typeof UnitStatus];

/** 筐体の接続モード */
export const ConnectionMode = {
  /** オンライン */
  ONLINE: 'online',
  /** オフライン */
  OFFLINE: 'offline',
} as const;
export type ConnectionMode = (typeof ConnectionMode)[keyof typeof ConnectionMode];

/** ライセンスのステータス */
export const LicenseStatus = {
  /** 有効 */
  VALID: 'valid',
  /** 期限切れ */
  EXPIRED: 'expired',
  /** 未確認 */
  UNKNOWN: 'unknown',
} as const;
export type LicenseStatus = (typeof LicenseStatus)[keyof typeof LicenseStatus];

/** コンテンツの配信区分 */
export const DeliveryType = {
  /** 一般配信 */
  GENERAL: 'general',
  /** 限定配信 */
  LIMITED: 'limited',
} as const;
export type DeliveryType = (typeof DeliveryType)[keyof typeof DeliveryType];

/** コンテンツの状態カテゴリ */
export const StatusCategory = {
  STATUS1: 'status1',
  STATUS2: 'status2',
  STATUS3: 'status3',
} as const;
export type StatusCategory = (typeof StatusCategory)[keyof typeof StatusCategory];

/** アラートレベル */
export const AlertLevel = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical',
} as const;
export type AlertLevel = (typeof AlertLevel)[keyof typeof AlertLevel];

/** ログレベル */
export const LogLevel = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
} as const;
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

/** ログ種別 */
export const LogType = {
  APPLICATION: 'application',
  ERROR: 'error',
  EVENT: 'event',
} as const;
export type LogType = (typeof LogType)[keyof typeof LogType];
