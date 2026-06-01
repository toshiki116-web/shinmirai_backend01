/**
 * API仕様書をdocx形式で生成するスクリプト
 * docs/api-specification.md の内容をdocxに変換
 * 実行: node docs/generate-api-spec-docx.js
 */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, PageOrientation, LevelFormat, HeadingLevel,
  BorderStyle, WidthType, ShadingType, PageBreak, TabStopType, TabStopPosition,
} = require('/Users/naganotoshiki/claude/node_modules/docx');

// ========== 定数 ==========
const FONT = 'Yu Gothic'; // 日本語対応フォント
const FONT_MONO = 'Consolas';
const BORDER_GRAY = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' };
const CELL_BORDERS = { top: BORDER_GRAY, bottom: BORDER_GRAY, left: BORDER_GRAY, right: BORDER_GRAY };
const HEADER_FILL = 'E7EEF7';
const CODE_FILL = 'F5F5F5';

// US Letter相当（A4でなくUSを指定してもよいが日本のビジネス慣習に合わせA4）
const PAGE_WIDTH = 11906;  // A4
const PAGE_HEIGHT = 16838;
const MARGIN = 1134; // 約2cm
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2; // 9638

// ========== ヘルパ関数 ==========
function p(text, opts = {}) {
  const { bold = false, italic = false, size = 22, color, spacing, heading, alignment, mono = false } = opts;
  return new Paragraph({
    heading,
    alignment,
    spacing: spacing ?? { before: 80, after: 80 },
    children: [new TextRun({ text, bold, italics: italic, size, color, font: mono ? FONT_MONO : FONT })],
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 200 },
    children: [new TextRun({ text, bold: true, size: 32, font: FONT, color: '1F4E79' })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 160 },
    children: [new TextRun({ text, bold: true, size: 28, font: FONT, color: '2E75B6' })],
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 220, after: 120 },
    children: [new TextRun({ text, bold: true, size: 24, font: FONT, color: '2E75B6' })],
  });
}

function h4(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_4,
    spacing: { before: 180, after: 100 },
    children: [new TextRun({ text, bold: true, size: 22, font: FONT })],
  });
}

// コードブロック（複数行）
function code(lines) {
  const arr = Array.isArray(lines) ? lines : lines.split('\n');
  return arr.map((line, i) =>
    new Paragraph({
      spacing: { before: i === 0 ? 80 : 0, after: i === arr.length - 1 ? 120 : 0, line: 260 },
      shading: { type: ShadingType.CLEAR, fill: CODE_FILL, color: 'auto' },
      children: [new TextRun({ text: line || ' ', size: 20, font: FONT_MONO })],
    }),
  );
}

// インラインコード
function inlineCode(text) {
  return new TextRun({ text, size: 22, font: FONT_MONO, shading: { type: ShadingType.CLEAR, fill: CODE_FILL, color: 'auto' } });
}

// テーブル生成（最初の行がヘッダ）
function table(rows, colWidths) {
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: rows.map((row, rowIdx) => new TableRow({
      tableHeader: rowIdx === 0,
      children: row.map((cell, colIdx) => new TableCell({
        borders: CELL_BORDERS,
        width: { size: colWidths[colIdx], type: WidthType.DXA },
        shading: rowIdx === 0
          ? { type: ShadingType.CLEAR, fill: HEADER_FILL, color: 'auto' }
          : undefined,
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: cellToParagraphs(cell, rowIdx === 0),
      })),
    })),
  });
}

function cellToParagraphs(cellContent, isHeader) {
  if (cellContent == null) cellContent = '';
  const text = String(cellContent);
  // モノスペース扱いする値を検出
  const isCode = /^[`]/.test(text);
  const clean = text.replace(/^`|`$/g, '');
  return [new Paragraph({
    spacing: { before: 0, after: 0 },
    children: [new TextRun({
      text: clean,
      bold: isHeader,
      size: 20,
      font: isCode ? FONT_MONO : FONT,
    })],
  })];
}

function hr() {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'BFBFBF', space: 1 } },
    children: [new TextRun({ text: '' })],
  });
}

function bullet(text) {
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    spacing: { before: 40, after: 40 },
    children: Array.isArray(text) ? text : [new TextRun({ text, size: 22, font: FONT })],
  });
}

// ========== 本文構築 ==========
const children = [];

// タイトルページ
children.push(
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 2400, after: 200 },
    children: [new TextRun({ text: '新・ミライ人間洗濯機', bold: true, size: 40, font: FONT, color: '1F4E79' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 200 },
    children: [new TextRun({ text: 'API 仕様書', bold: true, size: 48, font: FONT, color: '1F4E79' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 1200, after: 100 },
    children: [new TextRun({ text: 'バージョン 0.1.0', size: 24, font: FONT })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 100 },
    children: [new TextRun({ text: '最終更新: 2026-04-20', size: 24, font: FONT })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 100 },
    children: [new TextRun({ text: '対象読者: フロントエンド開発者', size: 24, font: FONT })],
  }),
  new Paragraph({ children: [new PageBreak()] }),
);

// ===== 1. 概要 =====
children.push(h1('1. 概要'));
children.push(p('拠点・筐体・動画コンテンツの管理基盤 API。用途別に2系統を提供する。'));
children.push(table([
  ['系統', 'プレフィックス', '認証', '利用者'],
  ['管理画面系', '/api/admin/*、/api/auth/*', 'JWT Bearer', '管理画面（Next.js）'],
  ['筐体系', '/api/device/*', 'device_token Bearer', '筐体端末（PC）'],
  ['共通', '/api/health', '不要', '監視・L7ヘルスチェック'],
], [1800, 3200, 2200, 2438]));

// ===== 2. 共通仕様 =====
children.push(h1('2. 共通仕様'));

children.push(h2('2.1 ベース情報'));
children.push(table([
  ['項目', '値'],
  ['Base URL（開発）', 'http://localhost:3000/api'],
  ['Swagger UI', 'http://localhost:3000/api/docs'],
  ['Content-Type', 'application/json; charset=utf-8'],
  ['タイムゾーン', 'レスポンス日時は ISO 8601（UTC）'],
  ['CORS', 'CORS_ORIGIN（未設定時は *）、credentials: true'],
], [3000, 6638]));

children.push(h2('2.2 統一レスポンス形式'));
children.push(h4('成功レスポンス（TransformInterceptor が付与）'));
children.push(...code([
  '{',
  '  "result": "ok",',
  '  "data": { /* エンドポイント固有のデータ */ },',
  '  "message": ""',
  '}',
]));
children.push(p('data が null/undefined の場合は {} に正規化される。HTTP ステータスは NestJS 既定（GET=200、POST=201、PATCH/DELETE=200）。'));

children.push(h4('失敗レスポンス（GlobalHttpExceptionFilter が付与）'));
children.push(...code([
  '{',
  '  "result": "ng",',
  '  "error_code": "BAD_REQUEST",',
  '  "message": "エラー内容（日本語）"',
  '}',
]));
children.push(p('class-validator のバリデーションエラーは配列メッセージをカンマ区切り文字列に変換して message に格納。'));

children.push(h2('2.3 エラーコード一覧'));
children.push(table([
  ['HTTP', 'error_code', '発生例'],
  ['400', 'BAD_REQUEST', '不正なパラメータ'],
  ['401', 'UNAUTHORIZED', '認証失敗、トークン無効・失効'],
  ['403', 'FORBIDDEN', '権限なし'],
  ['404', 'NOT_FOUND', 'リソースなし・論理削除済み'],
  ['409', 'CONFLICT', '既に紐付け済みなどの競合'],
  ['422', 'UNPROCESSABLE_ENTITY', 'バリデーション失敗'],
  ['429', 'TOO_MANY_REQUESTS', 'レート制限'],
  ['500', 'INTERNAL_ERROR', 'サーバー内部エラー'],
], [1200, 3000, 5438]));

children.push(h2('2.4 認証'));
children.push(h3('管理画面系: JWT Bearer'));
children.push(...code(['Authorization: Bearer <access_token>']));
children.push(bullet('POST /api/auth/login で発行。'));
children.push(bullet('JWT ペイロード: { sub: adminId, loginId, iat, exp }。'));
children.push(bullet('無効・失効時は 401。'));

children.push(h3('筐体系: device_token Bearer'));
children.push(...code(['Authorization: Bearer <device_token>']));
children.push(bullet('筐体登録時（POST /api/admin/units）に一度だけレスポンスで返却される。'));
children.push(bullet('以降の筐体取得系レスポンスには含まれない（再発行は管理画面操作が必要）。'));
children.push(bullet('無効・筐体削除済みは 401。'));

children.push(h2('2.5 ページネーション（管理画面系共通）'));
children.push(h4('リクエスト（クエリ）'));
children.push(table([
  ['パラメータ', '型', '既定値', '範囲'],
  ['page', 'number', '1', '>=1、整数'],
  ['limit', 'number', '20', '1〜100、整数'],
], [2400, 2000, 2000, 3238]));
children.push(h4('レスポンス'));
children.push(...code([
  '{',
  '  "items": [ /* ... */ ],',
  '  "total": 100,',
  '  "page": 1,',
  '  "limit": 20',
  '}',
]));
children.push(p('論理削除済みレコードは自動除外（Sites/Units は status != \'deleted\'、Contents は isActive = true）。'));

children.push(h2('2.6 バリデーション'));
children.push(bullet('ValidationPipe を全ルートに適用。'));
children.push(bullet('whitelist: true + forbidNonWhitelisted: true → DTO 未定義プロパティは 400。'));
children.push(bullet('transform: true + enableImplicitConversion: true → クエリ文字列を number/boolean に自動変換。'));

// ===== 3. 管理画面系 API =====
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(h1('3. 管理画面系 API'));

children.push(h2('3.1 認証'));
children.push(h3('POST /api/auth/login'));
children.push(p('管理者ログイン（JWT 発行）。認証不要。', { italic: true }));
children.push(h4('リクエストボディ'));
children.push(table([
  ['フィールド', '型', '必須', '説明'],
  ['loginId', 'string', '○', 'ログインID'],
  ['password', 'string', '○', 'パスワード'],
], [2200, 1800, 1200, 4438]));
children.push(h4('レスポンス 201'));
children.push(...code([
  '{',
  '  "result": "ok",',
  '  "data": {',
  '    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",',
  '    "admin": {',
  '      "id": "<uuid>",',
  '      "loginId": "admin",',
  '      "name": "Administrator"',
  '    }',
  '  },',
  '  "message": ""',
  '}',
]));
children.push(h4('エラー'));
children.push(bullet('401: ログインIDまたはパスワードが正しくありません'));

// 3.2 ヘルスチェック
children.push(h2('3.2 ヘルスチェック'));
children.push(h3('GET /api/health'));
children.push(p('認証不要。DB 疎通確認付き。', { italic: true }));
children.push(h4('レスポンス 200'));
children.push(...code([
  '{',
  '  "result": "ok",',
  '  "data": {',
  '    "status": "ok",',
  '    "details": { "database": { "status": "up" } }',
  '  },',
  '  "message": ""',
  '}',
]));

// 3.3 拠点管理
children.push(h2('3.3 拠点管理（Sites）'));
children.push(p('siteId フォーマット: LOC-0001（4桁ゼロ埋め自動採番）。'));

children.push(h3('GET /api/admin/sites'));
children.push(p('拠点一覧取得。'));
children.push(h4('クエリ'));
children.push(table([
  ['パラメータ', '型', '説明'],
  ['page / limit', 'number', 'ページネーション（共通）'],
  ['keyword', 'string', '拠点名・拠点ID の部分一致（大小区別なし）'],
  ['status', "'active' | 'warning' | 'stopped'", 'ステータス絞り込み'],
], [2200, 3000, 4438]));
children.push(h4('レスポンス 200（items[] の要素例）'));
children.push(...code([
  '{',
  '  "siteId": "LOC-0001",',
  '  "siteName": "大阪梅田店",',
  '  "address": "大阪府大阪市北区梅田1-1-1",',
  '  "phoneNumber": "06-1234-5678",',
  '  "note": "保守窓口あり",',
  '  "status": "active",',
  '  "createdAt": "2026-04-01T00:00:00.000Z",',
  '  "updatedAt": "2026-04-01T00:00:00.000Z",',
  '  "unitCount": 3',
  '}',
]));

children.push(h3('GET /api/admin/sites/:siteId'));
children.push(p('拠点詳細（配下の筐体一覧 units を含む）。'));
children.push(p('エラー: 404（未存在・削除済み）。'));

children.push(h3('POST /api/admin/sites'));
children.push(h4('リクエストボディ'));
children.push(table([
  ['フィールド', '型', '必須', '説明'],
  ['siteName', 'string', '○', '拠点名'],
  ['address', 'string', '-', '住所'],
  ['phoneNumber', 'string', '-', '電話番号'],
  ['note', 'string', '-', '備考'],
], [2200, 1800, 1200, 4438]));
children.push(p('レスポンス 201: 作成された拠点オブジェクト。'));

children.push(h3('PATCH /api/admin/sites/:siteId'));
children.push(p('部分更新（全フィールド任意）。レスポンスは更新後オブジェクト。'));

children.push(h3('DELETE /api/admin/sites/:siteId'));
children.push(p('論理削除（status = \'deleted\'）。レスポンスは削除後オブジェクト。'));

// 3.4 筐体管理
children.push(h2('3.4 筐体管理（Units）'));
children.push(p('unitId フォーマット: UNIT-XXXXXXXX（UUID 先頭8桁の大文字、自動採番）。'));

children.push(h3('GET /api/admin/units'));
children.push(h4('クエリ'));
children.push(table([
  ['パラメータ', '型', '説明'],
  ['page / limit', 'number', 'ページネーション'],
  ['keyword', 'string', '筐体ID・PC UUID・筐体名で部分一致'],
  ['siteId', 'string', '所属拠点で絞り込み'],
  ['status', "'normal' | 'warning' | 'stop' | 'maintenance'", 'ステータス絞り込み'],
], [2000, 3400, 4238]));
children.push(h4('レスポンス 200（items[] の要素例）'));
children.push(...code([
  '{',
  '  "unitId": "UNIT-A0B1C2D3",',
  '  "siteId": "LOC-0001",',
  '  "unitName": "1号機",',
  '  "pcUuid": "550e8400-e29b-41d4-a716-446655440000",',
  '  "connectionMode": "online",',
  '  "status": "normal",',
  '  "alertMessage": null,',
  '  "licenseStatus": "valid",',
  '  "licenseExpiredAt": "2027-04-01T00:00:00.000Z",',
  '  "lastSeenAt": "2026-04-06T10:30:00.000Z",',
  '  "createdAt": "2026-04-01T00:00:00.000Z",',
  '  "updatedAt": "2026-04-01T00:00:00.000Z",',
  '  "site": { "siteId": "LOC-0001", "siteName": "大阪梅田店" }',
  '}',
]));
children.push(p('※ deviceToken はこのレスポンスには含まれない（作成時レスポンスのみ返却）。', { italic: true, color: 'C00000' }));

children.push(h3('GET /api/admin/units/:unitId'));
children.push(p('詳細取得。deviceAlerts（直近10件）、deviceLogs（直近20件）を含む。'));

children.push(h3('POST /api/admin/units'));
children.push(h4('リクエストボディ'));
children.push(table([
  ['フィールド', '型', '必須', '既定', '説明'],
  ['siteId', 'string', '○', '-', '所属拠点ID'],
  ['unitName', 'string', '○', '-', '筐体名'],
  ['pcUuid', 'string (UUID v4)', '-', '-', 'PC端末UUID'],
  ['connectionMode', "'online' | 'offline'", '-', "'online'", '接続モード'],
], [2200, 2600, 900, 1200, 2738]));
children.push(h4('レスポンス 201'));
children.push(...code([
  '{',
  '  "unitId": "UNIT-A0B1C2D3",',
  '  "siteId": "LOC-0001",',
  '  "unitName": "1号機",',
  '  "deviceToken": "550e8400-e29b-41d4-a716-446655440000",',
  '  "connectionMode": "online",',
  '  "status": "normal",',
  '  "licenseStatus": "unknown",',
  '  "createdAt": "2026-04-20T00:00:00.000Z",',
  '  "updatedAt": "2026-04-20T00:00:00.000Z"',
  '}',
]));
children.push(p('※ 重要: deviceToken はここでのみ返却される。フロント側で筐体管理者に確実に提示・控えさせること。', { italic: true, color: 'C00000', bold: true }));

children.push(h3('PATCH /api/admin/units/:unitId'));
children.push(h4('リクエストボディ（すべて任意）'));
children.push(table([
  ['フィールド', '型'],
  ['siteId', 'string'],
  ['unitName', 'string'],
  ['pcUuid', 'string'],
  ['connectionMode', "'online' | 'offline'"],
  ['note', 'string'],
], [3000, 6638]));

children.push(h3('DELETE /api/admin/units/:unitId'));
children.push(p('論理削除（status = \'deleted\'）。'));

// 3.5 コンテンツ管理
children.push(h2('3.5 コンテンツ管理（Contents）'));
children.push(p('contentId フォーマット: CNT-00001（5桁ゼロ埋め自動採番）。'));

children.push(h3('GET /api/admin/contents'));
children.push(h4('クエリ'));
children.push(table([
  ['パラメータ', '型', '説明'],
  ['page / limit', 'number', 'ページネーション'],
  ['keyword', 'string', 'コンテンツ名・コンテンツIDで部分一致'],
  ['statusCategory', 'string', "'status1' | 'status2' | 'status3'"],
  ['deliveryType', "'general' | 'limited'", '配信区分'],
  ['language', 'string', '言語コード（例 ja）'],
], [2200, 3000, 4438]));
children.push(h4('レスポンス 200（items[] の要素例）'));
children.push(...code([
  '{',
  '  "contentId": "CNT-00001",',
  '  "contentName": "臨床試験ガイダンス映像 #04",',
  '  "language": "ja",',
  '  "deliveryType": "general",',
  '  "statusCategory": "status1",',
  '  "filePath": "/contents/2026/04/video.mp4",',
  '  "fileSize": "1234567890",',
  '  "checksum": "abc123def456",',
  '  "version": 1,',
  '  "isActive": true,',
  '  "createdAt": "2026-04-01T00:00:00.000Z",',
  '  "updatedAt": "2026-04-01T00:00:00.000Z",',
  '  "assignedSiteCount": 2',
  '}',
]));
children.push(p('※ fileSize は BigInt のため文字列で返却される。フロント側で BigInt/数値変換時に注意。', { italic: true, color: 'C00000' }));

children.push(h3('GET /api/admin/contents/:contentId'));
children.push(p('詳細取得。assignedSites: [{ siteId, siteName }] を含む。'));

children.push(h3('POST /api/admin/contents'));
children.push(h4('リクエストボディ'));
children.push(table([
  ['フィールド', '型', '必須', '既定', '説明'],
  ['contentName', 'string', '○', '-', 'コンテンツ名'],
  ['language', 'string', '-', "'ja'", '言語コード'],
  ['deliveryType', "'general' | 'limited'", '-', "'general'", '配信区分'],
  ['statusCategory', 'string', '-', "'status1'", '状態カテゴリ'],
  ['siteIds', 'string[]', '-', '-', '配信対象拠点ID'],
], [2200, 2600, 900, 1200, 2738]));
children.push(p('レスポンス 201: 作成後オブジェクト（assignedSites 含む）。'));

children.push(h3('PATCH /api/admin/contents/:contentId'));
children.push(p('POST と同じフィールドを部分的に指定可能。siteIds を含めると既存の割り当てをすべて置換（トランザクション処理）。version は自動インクリメント。'));

children.push(h3('DELETE /api/admin/contents/:contentId'));
children.push(p('論理削除（isActive = false）。'));

children.push(h3('POST /api/admin/contents/:contentId/assign'));
children.push(p('配信対象拠点の一括置換。'));
children.push(h4('リクエストボディ'));
children.push(table([
  ['フィールド', '型', '必須', '説明'],
  ['siteIds', 'string[]', '○', '1要素以上。既存割り当てを全削除→再作成'],
], [2200, 1800, 1200, 4438]));
children.push(h4('レスポンス 200'));
children.push(...code([
  '{',
  '  "contentId": "CNT-00001",',
  '  "assignedSiteIds": ["LOC-0001", "LOC-0002"]',
  '}',
]));

// ===== 4. 筐体系 API =====
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(h1('4. 筐体系 API'));
children.push(p('すべて DeviceAuthGuard 保護。Authorization: Bearer <device_token> が必須。'));

children.push(h2('4.1 GET /api/device/master/sites-units'));
children.push(p('初回設定画面用の拠点・筐体マスタ取得。'));
children.push(h4('レスポンス 200'));
children.push(...code([
  '{',
  '  "sites": [',
  '    {',
  '      "siteId": "LOC-0001",',
  '      "siteName": "大阪梅田店",',
  '      "units": [',
  '        { "unitId": "UNIT-A0B1C2D3", "unitName": "1号機" }',
  '      ]',
  '    }',
  '  ]',
  '}',
]));

children.push(h2('4.2 POST /api/device/activate'));
children.push(p('筐体を拠点・筐体IDに紐付け、PC UUID を登録。'));
children.push(h4('リクエストボディ'));
children.push(table([
  ['フィールド', '型', '必須', '説明'],
  ['siteId', 'string', '○', '拠点ID'],
  ['unitId', 'string', '○', '筐体ID'],
  ['pcUuid', 'string (UUID v4)', '○', 'PC端末UUID'],
], [2200, 2600, 1200, 3638]));
children.push(h4('レスポンス 200'));
children.push(...code([
  '{',
  '  "unitId": "UNIT-A0B1C2D3",',
  '  "siteId": "LOC-0001",',
  '  "pcUuid": "550e8400-e29b-41d4-a716-446655440000",',
  '  "deviceToken": "550e8400-e29b-41d4-a716-446655440000"',
  '}',
]));
children.push(h4('エラー'));
children.push(bullet('409: この筐体は既に紐付け済みです。管理画面から解除してください'));

children.push(h2('4.3 GET /api/device/contents'));
children.push(p('当該筐体の拠点に配信可能なコンテンツ一覧。'));
children.push(h4('クエリ'));
children.push(table([
  ['パラメータ', '型', '説明'],
  ['language', 'string', '省略可。言語コードで絞り込み'],
], [2200, 2000, 5438]));
children.push(h4('レスポンス 200'));
children.push(...code([
  '{',
  '  "items": [',
  '    {',
  '      "contentId": "CNT-00001",',
  '      "contentName": "臨床試験ガイダンス映像 #04",',
  '      "statusCategory": "status1",',
  '      "downloadUrl": "/contents/2026/04/video.mp4",',
  '      "version": 1,',
  '      "checksum": "abc123def456"',
  '    }',
  '  ]',
  '}',
]));
children.push(p('※ 現段階では downloadUrl は filePath をそのまま返却。Phase 5 で CloudFront 署名付き URL に置き換え予定。', { italic: true, color: 'C00000' }));

children.push(h2('4.4 GET /api/device/license-check'));
children.push(h4('レスポンス 200'));
children.push(...code([
  '{',
  '  "licenseValid": true,',
  '  "expiredAt": "2027-04-01T00:00:00.000Z",',
  '  "plan": "standard"',
  '}',
]));
children.push(bullet("判定: licenseStatus === 'valid' かつ licenseExpiredAt 未経過（または未設定）。"));

children.push(h2('4.5 POST /api/device/heartbeat'));
children.push(p('稼働状況と各デバイスステータスを送信。unit.status と unit.lastSeenAt を更新。'));
children.push(h4('リクエストボディ'));
children.push(table([
  ['フィールド', '型', '必須', '説明'],
  ['status', "'normal' | 'warning' | 'stop' | 'maintenance'", '○', '筐体ステータス'],
  ['devices', '{ name, status }[]', '-', '各デバイスの状態'],
  ['sentAt', 'string (ISO 8601)', '○', '送信日時'],
], [1800, 3400, 900, 3538]));
children.push(h4('レスポンス 200'));
children.push(...code(['{ "received": true }']));

children.push(h2('4.6 POST /api/device/alerts'));
children.push(h4('リクエストボディ'));
children.push(table([
  ['フィールド', '型', '必須', '説明'],
  ['alertType', 'string', '○', '例 device_disconnected'],
  ['deviceName', 'string', '-', '例 heart_sensor'],
  ['detail', 'string', '-', '詳細メッセージ'],
  ['level', "'info' | 'warning' | 'error' | 'critical'", '○', 'アラートレベル'],
  ['occurredAt', 'string (ISO 8601)', '○', '発生日時'],
], [2000, 3400, 900, 3338]));
children.push(h4('レスポンス 200'));
children.push(...code(['{ "alertId": "<uuid>" }']));
children.push(p("※ level が error または critical の場合、unit.alertMessage を更新し unit.status = 'warning' に遷移。", { italic: true }));

children.push(h2('4.7 POST /api/device/analytics/daily'));
children.push(p('日次利用回数を UPSERT（(unitId, targetDate) をキー）。'));
children.push(h4('リクエストボディ'));
children.push(table([
  ['フィールド', '型', '必須', '説明'],
  ['targetDate', 'string (ISO 8601 日付)', '○', '対象日'],
  ['useCount', 'integer', '○', '>= 0'],
], [2200, 3400, 900, 3138]));
children.push(h4('レスポンス 200'));
children.push(...code(['{ "received": true }']));

children.push(h2('4.8 POST /api/device/logs'));
children.push(h4('リクエストボディ'));
children.push(table([
  ['フィールド', '型', '必須', '説明'],
  ['logType', "'application' | 'error' | 'event'", '○', 'ログ種別'],
  ['logs', 'LogEntry[]', '○', '最大100件'],
], [2200, 3400, 900, 3138]));
children.push(h4('LogEntry'));
children.push(table([
  ['フィールド', '型', '必須', '説明'],
  ['timestamp', 'string (ISO 8601)', '○', '発生時刻'],
  ['level', "'DEBUG' | 'INFO' | 'WARN' | 'ERROR'", '○', 'ログレベル'],
  ['message', 'string', '○', '本文'],
], [2200, 3400, 900, 3138]));
children.push(h4('レスポンス 200'));
children.push(...code(['{ "receivedCount": 5 }']));

// ===== 5. Enum一覧 =====
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(h1('5. Enum / 定数一覧'));
children.push(table([
  ['Enum', '値'],
  ['SiteStatus', 'active, warning, stopped, deleted'],
  ['UnitStatus', 'normal, warning, stop, maintenance, deleted'],
  ['ConnectionMode', 'online, offline'],
  ['LicenseStatus', 'valid, expired, unknown'],
  ['DeliveryType', 'general, limited'],
  ['StatusCategory', 'status1, status2, status3'],
  ['AlertLevel', 'info, warning, error, critical'],
  ['LogLevel', 'DEBUG, INFO, WARN, ERROR'],
  ['LogType', 'application, error, event'],
], [3000, 6638]));

// ===== 6. 注意事項 =====
children.push(h1('6. 実装上の注意・未確定事項'));
children.push(bullet('コンテンツファイルアップロード: POST /api/admin/contents でメタデータのみ登録。実ファイルアップロード API は Phase 5 で S3 直接アップロード（署名付きURL方式）に切り出す予定。'));
children.push(bullet('CloudFront 署名付きURL: 現段階の downloadUrl は filePath をそのまま返却。Phase 5 で置換予定のため、フロント実装では URL をそのまま <video> の src に渡す前提で問題ないが、将来 URL 形式が変わる点に留意。'));
children.push(bullet('fileSize: BigInt のため文字列返却。'));
children.push(bullet('論理削除: 一覧取得では自動除外される。管理画面で「削除済みを含めて表示」する機能が必要な場合は API 拡張が必要（現状未対応）。'));
children.push(bullet('Swagger UI: GET /api/docs で OpenAPI 3 の対話型ドキュメントが参照可能。最新仕様はこちらが正となる。'));

children.push(hr());
children.push(p('仕様疑義・追加要望はサーバーサイド担当まで。', { italic: true, alignment: AlignmentType.CENTER }));

// ========== ドキュメント生成 ==========
const doc = new Document({
  creator: 'sinmirai API Team',
  title: '新・ミライ人間洗濯機 API 仕様書',
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 32, bold: true, font: FONT, color: '1F4E79' },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 28, bold: true, font: FONT, color: '2E75B6' },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 24, bold: true, font: FONT, color: '2E75B6' },
        paragraph: { spacing: { before: 220, after: 120 }, outlineLevel: 2 } },
      { id: 'Heading4', name: 'Heading 4', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 22, bold: true, font: FONT },
        paragraph: { spacing: { before: 180, after: 100 }, outlineLevel: 3 } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
        margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
      },
    },
    children,
  }],
});

const outPath = path.resolve(__dirname, '新・ミライ人間洗濯機_API仕様書.docx');
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outPath, buf);
  console.log('生成完了:', outPath);
});
