const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, PageBreak
} = require('docx');

// 共通スタイル定義
const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };
const headerShading = { fill: '1F4E79', type: ShadingType.CLEAR };
const altRowShading = { fill: 'F2F7FB', type: ShadingType.CLEAR };
const accentShading = { fill: 'FFF3CD', type: ShadingType.CLEAR }; // 比較ハイライト用

function headerCell(text, width) {
  return new TableCell({
    borders, width: { size: width, type: WidthType.DXA },
    shading: headerShading, margins: cellMargins,
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
      new TextRun({ text, bold: true, color: 'FFFFFF', font: 'Arial', size: 20 })
    ] })]
  });
}

function cell(text, width, opts = {}) {
  let shading = undefined;
  if (opts.accent) shading = accentShading;
  else if (opts.shaded) shading = altRowShading;
  return new TableCell({
    borders, width: { size: width, type: WidthType.DXA },
    shading, margins: cellMargins,
    children: [new Paragraph({
      alignment: opts.align || AlignmentType.LEFT,
      children: [new TextRun({
        text, font: 'Arial', size: 20,
        bold: opts.bold || false,
        color: opts.color || '333333'
      })]
    })]
  });
}

function moneyCell(text, width, opts = {}) {
  return cell(text, width, { ...opts, align: AlignmentType.RIGHT });
}

function sectionHeading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 360, after: 200 },
    children: [new TextRun({ text, font: 'Arial', size: 28, bold: true, color: '1F4E79' })]
  });
}

function subHeading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, font: 'Arial', size: 24, bold: true, color: '2E75B6' })]
  });
}

function bodyText(text) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, font: 'Arial', size: 20, color: '333333' })]
  });
}

function noteText(text) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, font: 'Arial', size: 18, color: '666666', italics: true })]
  });
}

// 合計行ヘルパー（濃い色の行）
function totalRow(label, usd, jpy) {
  return new TableRow({ children: [
    new TableCell({ borders, width: { size: 3800, type: WidthType.DXA }, shading: { fill: '1F4E79', type: ShadingType.CLEAR }, margins: cellMargins,
      children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, color: 'FFFFFF', font: 'Arial', size: 22 })] })]
    }),
    new TableCell({ borders, width: { size: 1860, type: WidthType.DXA }, shading: { fill: '1F4E79', type: ShadingType.CLEAR }, margins: cellMargins,
      children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: usd, bold: true, color: 'FFFFFF', font: 'Arial', size: 22 })] })]
    }),
    new TableCell({ borders, width: { size: 1860, type: WidthType.DXA }, shading: { fill: '1F4E79', type: ShadingType.CLEAR }, margins: cellMargins,
      children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: '', bold: true, color: 'FFFFFF', font: 'Arial', size: 22 })] })]
    }),
    new TableCell({ borders, width: { size: 1840, type: WidthType.DXA }, shading: { fill: 'E8B828', type: ShadingType.CLEAR }, margins: cellMargins,
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: jpy, bold: true, color: '1F4E79', font: 'Arial', size: 22 })] })]
    }),
  ] });
}

const fullWidth = 9360;

const doc = new Document({
  styles: {
    default: { document: { run: { font: 'Arial', size: 20 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 36, bold: true, font: 'Arial', color: '1F4E79' },
        paragraph: { spacing: { before: 240, after: 240 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 28, bold: true, font: 'Arial', color: '1F4E79' },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 24, bold: true, font: 'Arial', color: '2E75B6' },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 2 } },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 },
        margin: { top: 1440, right: 1200, bottom: 1440, left: 1200 }
      }
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: '新・ミライ人間洗濯機 AWS構成コスト見積書', font: 'Arial', size: 16, color: '999999' })]
        })]
      })
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: '- ', font: 'Arial', size: 16, color: '999999' }),
            new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 16, color: '999999' }),
            new TextRun({ text: ' -', font: 'Arial', size: 16, color: '999999' }),
          ]
        })]
      })
    },
    children: [
      // ===== タイトル =====
      new Paragraph({ spacing: { after: 100 }, children: [] }),
      new Paragraph({
        alignment: AlignmentType.CENTER, spacing: { after: 80 },
        children: [new TextRun({ text: '新・ミライ人間洗濯機', font: 'Arial', size: 40, bold: true, color: '1F4E79' })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER, spacing: { after: 200 },
        children: [new TextRun({ text: 'AWS構成コスト見積書', font: 'Arial', size: 36, bold: true, color: '2E75B6' })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER, spacing: { after: 80 },
        children: [new TextRun({ text: 'ECS Fargate 最小構成 / 全冗長化構成 比較', font: 'Arial', size: 24, color: '666666' })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER, spacing: { after: 400 },
        children: [new TextRun({ text: '2026年4月16日', font: 'Arial', size: 22, color: '666666' })]
      }),
      new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '2E75B6', space: 1 } }, spacing: { after: 400 }, children: [] }),

      // ===== 1. 構成概要 =====
      sectionHeading('1. 構成概要'),
      bodyText('本見積書は、新・ミライ人間洗濯機の管理基盤システムをAWS上で稼働させる場合の月額コストを算出したものです。'),
      bodyText('リージョン: ap-northeast-1（東京）、24時間365日稼働を前提に、2つの構成パターンを比較します。'),

      subHeading('1.1 構成パターン'),
      new Table({
        width: { size: fullWidth, type: WidthType.DXA },
        columnWidths: [2000, 3680, 3680],
        rows: [
          new TableRow({ children: [headerCell('', 2000), headerCell('A. 最小構成', 3680), headerCell('B. 全冗長化構成', 3680)] }),
          new TableRow({ children: [cell('Fargate API', 2000, { bold: true }), cell('0.25vCPU / 0.5GB × 1タスク', 3680), cell('0.25vCPU / 0.5GB × 2タスク（2AZ分散）', 3680)] }),
          new TableRow({ children: [cell('Fargate Web', 2000, { bold: true, shaded: true }), cell('0.25vCPU / 0.5GB × 1タスク', 3680, { shaded: true }), cell('0.25vCPU / 0.5GB × 2タスク（2AZ分散）', 3680, { shaded: true })] }),
          new TableRow({ children: [cell('RDS', 2000, { bold: true }), cell('db.t4g.micro シングルAZ', 3680), cell('db.t4g.micro マルチAZ', 3680)] }),
          new TableRow({ children: [cell('ALB', 2000, { bold: true, shaded: true }), cell('マルチAZ（AWS管理）', 3680, { shaded: true }), cell('マルチAZ（AWS管理）', 3680, { shaded: true })] }),
          new TableRow({ children: [cell('S3', 2000, { bold: true }), cell('50GB（3AZ自動複製）', 3680), cell('50GB（3AZ自動複製）', 3680)] }),
          new TableRow({ children: [cell('CloudFront', 2000, { bold: true, shaded: true }), cell('無料枠（グローバル分散）', 3680, { shaded: true }), cell('無料枠（グローバル分散）', 3680, { shaded: true })] }),
        ]
      }),

      // ===== 2. 最小構成 内訳 =====
      new Paragraph({ children: [new PageBreak()] }),
      sectionHeading('2. 構成A: 最小構成 月額内訳'),

      subHeading('2.1 ECS Fargate（API × 1 + Web × 1）'),
      new Table({
        width: { size: fullWidth, type: WidthType.DXA },
        columnWidths: [2600, 2600, 2400, 1760],
        rows: [
          new TableRow({ children: [headerCell('計算項目', 2600), headerCell('単価（東京）', 2600), headerCell('計算式', 2400), headerCell('月額', 1760)] }),
          new TableRow({ children: [cell('vCPU料金', 2600), cell('$0.05056/vCPU/時', 2600), cell('× 0.25 × 730h × 2', 2400), moneyCell('$18.50', 1760)] }),
          new TableRow({ children: [cell('メモリ料金', 2600, { shaded: true }), cell('$0.00553/GB/時', 2600, { shaded: true }), cell('× 0.5 × 730h × 2', 2400, { shaded: true }), moneyCell('$4.00', 1760, { shaded: true })] }),
          new TableRow({ children: [cell('', 2600), cell('', 2600), cell('小計', 2400, { bold: true }), moneyCell('$22.50', 1760, { bold: true })] }),
        ]
      }),

      subHeading('2.2 RDS PostgreSQL（シングルAZ）'),
      new Table({
        width: { size: fullWidth, type: WidthType.DXA },
        columnWidths: [2600, 3860, 1140, 1760],
        rows: [
          new TableRow({ children: [headerCell('項目', 2600), headerCell('詳細', 3860), headerCell('', 1140), headerCell('月額', 1760)] }),
          new TableRow({ children: [cell('インスタンス', 2600), cell('db.t4g.micro（2vCPU / 1GB RAM）', 3860), cell('', 1140), moneyCell('$18.40', 1760)] }),
          new TableRow({ children: [cell('ストレージ', 2600, { shaded: true }), cell('gp3 20GB × $0.096/GB', 3860, { shaded: true }), cell('', 1140, { shaded: true }), moneyCell('$1.90', 1760, { shaded: true })] }),
          new TableRow({ children: [cell('', 2600), cell('', 3860), cell('小計', 1140, { bold: true }), moneyCell('$20.30', 1760, { bold: true })] }),
        ]
      }),

      subHeading('2.3 ALB + S3 + CloudFront + データ転送'),
      new Table({
        width: { size: fullWidth, type: WidthType.DXA },
        columnWidths: [2600, 3860, 1140, 1760],
        rows: [
          new TableRow({ children: [headerCell('項目', 2600), headerCell('詳細', 3860), headerCell('', 1140), headerCell('月額', 1760)] }),
          new TableRow({ children: [cell('ALB固定料金', 2600), cell('$0.0243/時 × 730時間', 3860), cell('', 1140), moneyCell('$17.70', 1760)] }),
          new TableRow({ children: [cell('ALB LCU', 2600, { shaded: true }), cell('処理量課金（軽量想定）', 3860, { shaded: true }), cell('', 1140, { shaded: true }), moneyCell('$3.00', 1760, { shaded: true })] }),
          new TableRow({ children: [cell('S3ストレージ', 2600), cell('50GB × $0.025/GB', 3860), cell('', 1140), moneyCell('$1.25', 1760)] }),
          new TableRow({ children: [cell('S3リクエスト', 2600, { shaded: true }), cell('PUT/GET 少量', 3860, { shaded: true }), cell('', 1140, { shaded: true }), moneyCell('$0.10', 1760, { shaded: true })] }),
          new TableRow({ children: [cell('CloudFront', 2600), cell('無料枠内（100GB/月）', 3860), cell('', 1140), moneyCell('$0.00', 1760)] }),
          new TableRow({ children: [cell('データ転送', 2600, { shaded: true }), cell('インターネットへの送信', 3860, { shaded: true }), cell('', 1140, { shaded: true }), moneyCell('$5.00', 1760, { shaded: true })] }),
          new TableRow({ children: [cell('', 2600), cell('', 3860), cell('小計', 1140, { bold: true }), moneyCell('$27.05', 1760, { bold: true })] }),
        ]
      }),

      subHeading('2.4 構成A 月額合計'),
      new Table({
        width: { size: fullWidth, type: WidthType.DXA },
        columnWidths: [3800, 1860, 1860, 1840],
        rows: [
          new TableRow({ children: [headerCell('カテゴリ', 3800), headerCell('月額（USD）', 1860), headerCell('', 1860), headerCell('月額（円）', 1840)] }),
          new TableRow({ children: [cell('ECS Fargate', 3800), moneyCell('$22.50', 1860), cell('', 1860), moneyCell('', 1840)] }),
          new TableRow({ children: [cell('RDS PostgreSQL', 3800, { shaded: true }), moneyCell('$20.30', 1860, { shaded: true }), cell('', 1860, { shaded: true }), moneyCell('', 1840, { shaded: true })] }),
          new TableRow({ children: [cell('ALB + S3 + CloudFront + 転送', 3800), moneyCell('$27.05', 1860), cell('', 1860), moneyCell('', 1840)] }),
          totalRow('構成A 合計', '$69.85', '約10,500円/月'),
        ]
      }),

      // ===== 3. 全冗長化構成 内訳 =====
      new Paragraph({ children: [new PageBreak()] }),
      sectionHeading('3. 構成B: 全冗長化構成 月額内訳'),
      bodyText('全コンポーネントを冗長化し、単一障害点（SPOF）を排除した構成です。'),

      subHeading('3.1 ECS Fargate（API × 2 + Web × 2 / マルチAZ分散）'),
      new Table({
        width: { size: fullWidth, type: WidthType.DXA },
        columnWidths: [2600, 2600, 2400, 1760],
        rows: [
          new TableRow({ children: [headerCell('計算項目', 2600), headerCell('単価（東京）', 2600), headerCell('計算式', 2400), headerCell('月額', 1760)] }),
          new TableRow({ children: [cell('vCPU料金', 2600), cell('$0.05056/vCPU/時', 2600), cell('× 0.25 × 730h × 4タスク', 2400), moneyCell('$37.00', 1760)] }),
          new TableRow({ children: [cell('メモリ料金', 2600, { shaded: true }), cell('$0.00553/GB/時', 2600, { shaded: true }), cell('× 0.5 × 730h × 4タスク', 2400, { shaded: true }), moneyCell('$8.10', 1760, { shaded: true })] }),
          new TableRow({ children: [cell('', 2600), cell('', 2600), cell('小計', 2400, { bold: true }), moneyCell('$45.10', 1760, { bold: true })] }),
        ]
      }),
      noteText('※ APIタスク2つ + Webタスク2つ = 計4タスクを2つのAZに分散配置'),

      subHeading('3.2 RDS PostgreSQL（マルチAZ）'),
      new Table({
        width: { size: fullWidth, type: WidthType.DXA },
        columnWidths: [2600, 3860, 1140, 1760],
        rows: [
          new TableRow({ children: [headerCell('項目', 2600), headerCell('詳細', 3860), headerCell('', 1140), headerCell('月額', 1760)] }),
          new TableRow({ children: [cell('インスタンス', 2600), cell('db.t4g.micro マルチAZ（プライマリ + スタンバイ）', 3860), cell('', 1140), moneyCell('$36.80', 1760)] }),
          new TableRow({ children: [cell('ストレージ', 2600, { shaded: true }), cell('gp3 20GB × $0.192/GB（マルチAZ 2倍）', 3860, { shaded: true }), cell('', 1140, { shaded: true }), moneyCell('$3.84', 1760, { shaded: true })] }),
          new TableRow({ children: [cell('', 2600), cell('', 3860), cell('小計', 1140, { bold: true }), moneyCell('$40.64', 1760, { bold: true })] }),
        ]
      }),
      noteText('※ マルチAZはインスタンス料金が約2倍。別AZにスタンバイが常時起動し、障害時に自動フェイルオーバー'),

      subHeading('3.3 ALB + S3 + CloudFront + データ転送'),
      new Table({
        width: { size: fullWidth, type: WidthType.DXA },
        columnWidths: [2600, 3860, 1140, 1760],
        rows: [
          new TableRow({ children: [headerCell('項目', 2600), headerCell('詳細', 3860), headerCell('', 1140), headerCell('月額', 1760)] }),
          new TableRow({ children: [cell('ALB固定料金', 2600), cell('$0.0243/時 × 730時間', 3860), cell('', 1140), moneyCell('$17.70', 1760)] }),
          new TableRow({ children: [cell('ALB LCU', 2600, { shaded: true }), cell('処理量課金（軽量想定）', 3860, { shaded: true }), cell('', 1140, { shaded: true }), moneyCell('$3.00', 1760, { shaded: true })] }),
          new TableRow({ children: [cell('S3ストレージ', 2600), cell('50GB × $0.025/GB', 3860), cell('', 1140), moneyCell('$1.25', 1760)] }),
          new TableRow({ children: [cell('S3リクエスト', 2600, { shaded: true }), cell('PUT/GET 少量', 3860, { shaded: true }), cell('', 1140, { shaded: true }), moneyCell('$0.10', 1760, { shaded: true })] }),
          new TableRow({ children: [cell('CloudFront', 2600), cell('無料枠内（100GB/月）', 3860), cell('', 1140), moneyCell('$0.00', 1760)] }),
          new TableRow({ children: [cell('データ転送', 2600, { shaded: true }), cell('インターネットへの送信', 3860, { shaded: true }), cell('', 1140, { shaded: true }), moneyCell('$5.00', 1760, { shaded: true })] }),
          new TableRow({ children: [cell('', 2600), cell('', 3860), cell('小計', 1140, { bold: true }), moneyCell('$27.05', 1760, { bold: true })] }),
        ]
      }),
      noteText('※ ALB / S3 / CloudFrontはAWS側で元々冗長化済みのため、最小構成と同額'),

      subHeading('3.4 構成B 月額合計'),
      new Table({
        width: { size: fullWidth, type: WidthType.DXA },
        columnWidths: [3800, 1860, 1860, 1840],
        rows: [
          new TableRow({ children: [headerCell('カテゴリ', 3800), headerCell('月額（USD）', 1860), headerCell('', 1860), headerCell('月額（円）', 1840)] }),
          new TableRow({ children: [cell('ECS Fargate（4タスク）', 3800), moneyCell('$45.10', 1860), cell('', 1860), moneyCell('', 1840)] }),
          new TableRow({ children: [cell('RDS PostgreSQL（マルチAZ）', 3800, { shaded: true }), moneyCell('$40.64', 1860, { shaded: true }), cell('', 1860, { shaded: true }), moneyCell('', 1840, { shaded: true })] }),
          new TableRow({ children: [cell('ALB + S3 + CloudFront + 転送', 3800), moneyCell('$27.05', 1860), cell('', 1860), moneyCell('', 1840)] }),
          totalRow('構成B 合計', '$112.79', '約16,900円/月'),
        ]
      }),

      // ===== 4. 構成比較 =====
      new Paragraph({ children: [new PageBreak()] }),
      sectionHeading('4. 構成A / 構成B 比較'),

      subHeading('4.1 コスト比較'),
      new Table({
        width: { size: fullWidth, type: WidthType.DXA },
        columnWidths: [2800, 2200, 2200, 2160],
        rows: [
          new TableRow({ children: [headerCell('カテゴリ', 2800), headerCell('A. 最小構成', 2200), headerCell('B. 全冗長化', 2200), headerCell('差額', 2160)] }),
          new TableRow({ children: [cell('ECS Fargate', 2800, { bold: true }), moneyCell('$22.50', 2200), moneyCell('$45.10', 2200), moneyCell('+$22.60', 2160, { color: 'CC0000' })] }),
          new TableRow({ children: [cell('RDS PostgreSQL', 2800, { bold: true, shaded: true }), moneyCell('$20.30', 2200, { shaded: true }), moneyCell('$40.64', 2200, { shaded: true }), moneyCell('+$20.34', 2160, { shaded: true, color: 'CC0000' })] }),
          new TableRow({ children: [cell('ALB + S3 + CF + 転送', 2800, { bold: true }), moneyCell('$27.05', 2200), moneyCell('$27.05', 2200), moneyCell('$0.00', 2160)] }),
        ]
      }),
      new Paragraph({ spacing: { before: 120 }, children: [] }),
      new Table({
        width: { size: fullWidth, type: WidthType.DXA },
        columnWidths: [2800, 2200, 2200, 2160],
        rows: [
          new TableRow({ children: [
            new TableCell({ borders, width: { size: 2800, type: WidthType.DXA }, shading: { fill: '1F4E79', type: ShadingType.CLEAR }, margins: cellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: '月額合計', bold: true, color: 'FFFFFF', font: 'Arial', size: 22 })] })]
            }),
            new TableCell({ borders, width: { size: 2200, type: WidthType.DXA }, shading: { fill: '2E75B6', type: ShadingType.CLEAR }, margins: cellMargins,
              children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: '$69.85', bold: true, color: 'FFFFFF', font: 'Arial', size: 22 })] })]
            }),
            new TableCell({ borders, width: { size: 2200, type: WidthType.DXA }, shading: { fill: '2E75B6', type: ShadingType.CLEAR }, margins: cellMargins,
              children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: '$112.79', bold: true, color: 'FFFFFF', font: 'Arial', size: 22 })] })]
            }),
            new TableCell({ borders, width: { size: 2160, type: WidthType.DXA }, shading: { fill: 'E8B828', type: ShadingType.CLEAR }, margins: cellMargins,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '+$42.94', bold: true, color: '1F4E79', font: 'Arial', size: 22 })] })]
            }),
          ] }),
          new TableRow({ children: [
            new TableCell({ borders, width: { size: 2800, type: WidthType.DXA }, shading: { fill: '1F4E79', type: ShadingType.CLEAR }, margins: cellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: '日本円換算', bold: true, color: 'FFFFFF', font: 'Arial', size: 22 })] })]
            }),
            new TableCell({ borders, width: { size: 2200, type: WidthType.DXA }, shading: { fill: '2E75B6', type: ShadingType.CLEAR }, margins: cellMargins,
              children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: '約10,500円', bold: true, color: 'FFFFFF', font: 'Arial', size: 22 })] })]
            }),
            new TableCell({ borders, width: { size: 2200, type: WidthType.DXA }, shading: { fill: '2E75B6', type: ShadingType.CLEAR }, margins: cellMargins,
              children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: '約16,900円', bold: true, color: 'FFFFFF', font: 'Arial', size: 22 })] })]
            }),
            new TableCell({ borders, width: { size: 2160, type: WidthType.DXA }, shading: { fill: 'E8B828', type: ShadingType.CLEAR }, margins: cellMargins,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '+約6,400円', bold: true, color: '1F4E79', font: 'Arial', size: 22 })] })]
            }),
          ] }),
        ]
      }),

      subHeading('4.2 冗長性比較'),
      new Table({
        width: { size: fullWidth, type: WidthType.DXA },
        columnWidths: [2800, 2200, 2200, 2160],
        rows: [
          new TableRow({ children: [headerCell('コンポーネント', 2800), headerCell('A. 最小構成', 2200), headerCell('B. 全冗長化', 2200), headerCell('障害時の復旧', 2160)] }),
          new TableRow({ children: [cell('Fargate API', 2800, { bold: true }), cell('1タスク / 1AZ', 2200), cell('2タスク / 2AZ', 2200), cell('即時（自動）', 2160)] }),
          new TableRow({ children: [cell('Fargate Web', 2800, { bold: true, shaded: true }), cell('1タスク / 1AZ', 2200, { shaded: true }), cell('2タスク / 2AZ', 2200, { shaded: true }), cell('即時（自動）', 2160, { shaded: true })] }),
          new TableRow({ children: [cell('RDS', 2800, { bold: true }), cell('シングルAZ', 2200), cell('マルチAZ', 2200), cell('60〜120秒', 2160)] }),
          new TableRow({ children: [cell('ALB', 2800, { bold: true, shaded: true }), cell('マルチAZ', 2200, { shaded: true }), cell('マルチAZ', 2200, { shaded: true }), cell('自動（変更なし）', 2160, { shaded: true })] }),
          new TableRow({ children: [cell('S3', 2800, { bold: true }), cell('3AZ複製', 2200), cell('3AZ複製', 2200), cell('自動（変更なし）', 2160)] }),
          new TableRow({ children: [cell('CloudFront', 2800, { bold: true, shaded: true }), cell('グローバル分散', 2200, { shaded: true }), cell('グローバル分散', 2200, { shaded: true }), cell('自動（変更なし）', 2160, { shaded: true })] }),
        ]
      }),

      subHeading('4.3 障害シナリオ比較'),
      new Table({
        width: { size: fullWidth, type: WidthType.DXA },
        columnWidths: [3200, 3080, 3080],
        rows: [
          new TableRow({ children: [headerCell('障害シナリオ', 3200), headerCell('A. 最小構成', 3080), headerCell('B. 全冗長化', 3080)] }),
          new TableRow({ children: [cell('APIタスクがクラッシュ', 3200, { bold: true }), cell('全停止（30秒〜2分で自動復旧）', 3080), cell('残りの1タスクで継続稼働', 3080)] }),
          new TableRow({ children: [cell('Webタスクがクラッシュ', 3200, { bold: true, shaded: true }), cell('管理画面停止（30秒〜2分）', 3080, { shaded: true }), cell('残りの1タスクで継続稼働', 3080, { shaded: true })] }),
          new TableRow({ children: [cell('RDS障害', 3200, { bold: true }), cell('全サービス停止（10〜30分）', 3080), cell('自動フェイルオーバー（60〜120秒）', 3080)] }),
          new TableRow({ children: [cell('AZ障害', 3200, { bold: true, shaded: true }), cell('全サービス停止（数時間）', 3080, { shaded: true }), cell('別AZで継続稼働（ダウンタイムなし）', 3080, { shaded: true })] }),
        ]
      }),

      // ===== 5. メリット・デメリット =====
      new Paragraph({ children: [new PageBreak()] }),
      sectionHeading('5. 各構成のメリット・デメリット'),

      subHeading('5.1 構成A: 最小構成'),
      new Table({
        width: { size: fullWidth, type: WidthType.DXA },
        columnWidths: [1400, 3980, 3980],
        rows: [
          new TableRow({ children: [headerCell('', 1400), headerCell('メリット', 3980), headerCell('デメリット', 3980)] }),
          new TableRow({ children: [cell('コスト', 1400, { bold: true }), cell('月約1万円で低コスト', 3980), cell('コスト削減余地がほぼない', 3980)] }),
          new TableRow({ children: [cell('運用', 1400, { bold: true, shaded: true }), cell('構成がシンプルで管理しやすい', 3980, { shaded: true }), cell('障害時の手動対応が必要', 3980, { shaded: true })] }),
          new TableRow({ children: [cell('可用性', 1400, { bold: true }), cell('ECS自動再起動で短時間復旧', 3980), cell('AZ障害で全停止のリスク', 3980)] }),
          new TableRow({ children: [cell('拡張性', 1400, { bold: true, shaded: true }), cell('全冗長化への移行が容易', 3980, { shaded: true }), cell('高負荷時にスペック不足の可能性', 3980, { shaded: true })] }),
        ]
      }),

      subHeading('5.2 構成B: 全冗長化構成'),
      new Table({
        width: { size: fullWidth, type: WidthType.DXA },
        columnWidths: [1400, 3980, 3980],
        rows: [
          new TableRow({ children: [headerCell('', 1400), headerCell('メリット', 3980), headerCell('デメリット', 3980)] }),
          new TableRow({ children: [cell('コスト', 1400, { bold: true }), cell('月約1.7万円で本番運用に対応', 3980), cell('最小構成比+約6,400円/月', 3980)] }),
          new TableRow({ children: [cell('運用', 1400, { bold: true, shaded: true }), cell('障害時も自動フェイルオーバー', 3980, { shaded: true }), cell('構成がやや複雑', 3980, { shaded: true })] }),
          new TableRow({ children: [cell('可用性', 1400, { bold: true }), cell('AZ障害でもダウンタイムなし', 3980), cell('-', 3980)] }),
          new TableRow({ children: [cell('拡張性', 1400, { bold: true, shaded: true }), cell('そのまま本番拡張可能', 3980, { shaded: true }), cell('-', 3980, { shaded: true })] }),
        ]
      }),

      // ===== 6. 動画ストレージ =====
      sectionHeading('6. 動画ストレージ（S3）'),
      bodyText('動画コンテンツの保存にはAmazon S3を使用します。S3は容量無制限の従量課金型で、両構成共通です。'),

      subHeading('6.1 容量別 月額料金'),
      new Table({
        width: { size: fullWidth, type: WidthType.DXA },
        columnWidths: [3120, 3120, 3120],
        rows: [
          new TableRow({ children: [headerCell('保存容量', 3120), headerCell('月額（USD）', 3120), headerCell('月額（円）', 3120)] }),
          new TableRow({ children: [cell('50GB', 3120), moneyCell('$1.25', 3120), moneyCell('約190円', 3120)] }),
          new TableRow({ children: [cell('100GB', 3120, { shaded: true }), moneyCell('$2.50', 3120, { shaded: true }), moneyCell('約375円', 3120, { shaded: true })] }),
          new TableRow({ children: [cell('500GB', 3120), moneyCell('$12.50', 3120), moneyCell('約1,875円', 3120)] }),
          new TableRow({ children: [cell('1TB', 3120, { shaded: true }), moneyCell('$25.00', 3120, { shaded: true }), moneyCell('約3,750円', 3120, { shaded: true })] }),
          new TableRow({ children: [cell('5TB', 3120), moneyCell('$115.00', 3120), moneyCell('約17,250円', 3120)] }),
        ]
      }),

      subHeading('6.2 動画ファイルの容量目安'),
      new Table({
        width: { size: fullWidth, type: WidthType.DXA },
        columnWidths: [2600, 2600, 2080, 2080],
        rows: [
          new TableRow({ children: [headerCell('動画の品質', 2600), headerCell('1本あたり（5分）', 2600), headerCell('50GBに入る本数', 2080), headerCell('100GBに入る本数', 2080)] }),
          new TableRow({ children: [cell('SD画質（720p）', 2600), cell('約 150MB', 2600), cell('約330本', 2080, { align: AlignmentType.CENTER }), cell('約660本', 2080, { align: AlignmentType.CENTER })] }),
          new TableRow({ children: [cell('HD画質（1080p）', 2600, { shaded: true }), cell('約 400MB', 2600, { shaded: true }), cell('約125本', 2080, { shaded: true, align: AlignmentType.CENTER }), cell('約250本', 2080, { shaded: true, align: AlignmentType.CENTER })] }),
          new TableRow({ children: [cell('4K画質', 2600), cell('約 1.5GB', 2600), cell('約33本', 2080, { align: AlignmentType.CENTER }), cell('約66本', 2080, { align: AlignmentType.CENTER })] }),
        ]
      }),

      // ===== 7. 補足事項 =====
      new Paragraph({ children: [new PageBreak()] }),
      sectionHeading('7. 補足事項'),
      bodyText('・本見積もりは2026年4月時点のAWS公開料金に基づく概算です。'),
      bodyText('・為替レートは$1 = 150円で換算しています。'),
      bodyText('・CloudWatch Logs等の監視コストは含まれていません（月$5〜10程度追加の見込み）。'),
      bodyText('・動画ストレージ（S3）は50GB想定です。実際の動画本数・品質に応じて変動します。'),
      bodyText('・CloudFrontの無料枠（100GB/月）を超える配信がある場合は別途課金が発生します。'),
      bodyText('・初期構築費用（ドメイン取得、ACM証明書等）は本見積もりに含まれていません。'),
      bodyText('・Fargate SpotやRDSリザーブドインスタンス（1年）を活用すると30〜50%のコスト削減が可能です。'),

      sectionHeading('8. 推奨'),
      bodyText('開発・検証段階では構成A（最小構成）で開始し、本番運用開始時に構成B（全冗長化）へ移行することを推奨します。'),
      bodyText('構成Aから構成Bへの移行は、ECSタスク数の変更とRDSのマルチAZ有効化のみで完了します。アプリケーションの変更は不要です。'),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  const outputPath = '/Users/naganotoshiki/claude/sinmirai_ningensentakuki/docs/新ミライ人間洗濯機_AWSコスト見積書.docx';
  fs.writeFileSync(outputPath, buffer);
  console.log('Word文書を生成しました: ' + outputPath);
});
