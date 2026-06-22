/**
 * API仕様書をdocx形式で生成するスクリプト
 * docs/api-specification.md を読み込み、その内容をそのままdocxに変換する。
 * （Markdownを正本とし、docxは常にMarkdownと一致させる＝二重メンテによるドリフト防止）
 * 実行: node docs/generate-api-spec-docx.js
 */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, LevelFormat, HeadingLevel,
  BorderStyle, WidthType, ShadingType, PageBreak,
} = require('docx'); // ローカルの node_modules から解決（環境非依存）

// ========== 定数 ==========
const FONT = 'Yu Gothic'; // 日本語対応フォント
const FONT_MONO = 'Consolas';
const BORDER_GRAY = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' };
const CELL_BORDERS = { top: BORDER_GRAY, bottom: BORDER_GRAY, left: BORDER_GRAY, right: BORDER_GRAY };
const HEADER_FILL = 'E7EEF7';
const CODE_FILL = 'F5F5F5';
const QUOTE_COLOR = '595959';
const CODE_SHADING = { type: ShadingType.CLEAR, fill: CODE_FILL, color: 'auto' };

// A4
const PAGE_WIDTH = 11906;
const PAGE_HEIGHT = 16838;
const MARGIN = 1134; // 約2cm
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2; // 9638

// ========== インライン整形（**bold** / `code`） ==========
function inlineRuns(text, opts = {}) {
  const { size = 22, color, italic = false } = opts;
  const runs = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      runs.push(new TextRun({ text: text.slice(last, m.index), size, color, italics: italic, font: FONT }));
    }
    if (m[2] !== undefined) {
      runs.push(new TextRun({ text: m[2], size, color, italics: italic, bold: true, font: FONT }));
    } else if (m[3] !== undefined) {
      runs.push(new TextRun({ text: m[3], size, color, italics: italic, font: FONT_MONO, shading: CODE_SHADING }));
    }
    last = re.lastIndex;
  }
  if (last < text.length) {
    runs.push(new TextRun({ text: text.slice(last), size, color, italics: italic, font: FONT }));
  }
  if (runs.length === 0) {
    runs.push(new TextRun({ text: text || ' ', size, color, italics: italic, font: FONT }));
  }
  return runs;
}

// ========== ブロック生成ヘルパ ==========
function para(text, opts = {}) {
  return new Paragraph({
    spacing: opts.spacing ?? { before: 80, after: 80 },
    alignment: opts.alignment,
    children: inlineRuns(text, opts),
  });
}

function headingFor(level, text) {
  // Markdownの ## → 章(H1相当) / ### → 節(H2) / #### → 項(H3) / ##### → H4
  const map = {
    2: { heading: HeadingLevel.HEADING_1, size: 32, color: '1F4E79', before: 360, after: 200 },
    3: { heading: HeadingLevel.HEADING_2, size: 28, color: '2E75B6', before: 280, after: 160 },
    4: { heading: HeadingLevel.HEADING_3, size: 24, color: '2E75B6', before: 220, after: 120 },
    5: { heading: HeadingLevel.HEADING_4, size: 22, color: undefined, before: 180, after: 100 },
    6: { heading: HeadingLevel.HEADING_4, size: 22, color: undefined, before: 160, after: 100 },
  };
  const s = map[level] ?? map[6];
  return new Paragraph({
    heading: s.heading,
    spacing: { before: s.before, after: s.after },
    children: [new TextRun({ text, bold: true, size: s.size, font: FONT, color: s.color })],
  });
}

function code(lines) {
  const arr = Array.isArray(lines) ? lines : lines.split('\n');
  return arr.map((line, i) =>
    new Paragraph({
      spacing: { before: i === 0 ? 80 : 0, after: i === arr.length - 1 ? 120 : 0, line: 260 },
      shading: CODE_SHADING,
      children: [new TextRun({ text: line || ' ', size: 20, font: FONT_MONO })],
    }),
  );
}

function bullet(text) {
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    spacing: { before: 40, after: 40 },
    children: Array.isArray(text) ? text : inlineRuns(text),
  });
}

function quote(text) {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    indent: { left: 360 },
    border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'BFBFBF', space: 8 } },
    children: inlineRuns(text, { italic: true, color: QUOTE_COLOR }),
  });
}

function cellParagraphs(cellContent, isHeader) {
  const text = cellContent == null ? '' : String(cellContent);
  return [new Paragraph({
    spacing: { before: 0, after: 0 },
    children: isHeader
      ? [new TextRun({ text, bold: true, size: 20, font: FONT })]
      : inlineRuns(text, { size: 20 }),
  })];
}

function table(rows) {
  const cols = Math.max(...rows.map((r) => r.length));
  const colWidth = Math.floor(CONTENT_WIDTH / cols);
  const colWidths = Array.from({ length: cols }, () => colWidth);
  return new Table({
    width: { size: colWidth * cols, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: rows.map((row, rowIdx) => new TableRow({
      tableHeader: rowIdx === 0,
      children: Array.from({ length: cols }, (_, colIdx) => new TableCell({
        borders: CELL_BORDERS,
        width: { size: colWidths[colIdx], type: WidthType.DXA },
        shading: rowIdx === 0 ? { type: ShadingType.CLEAR, fill: HEADER_FILL, color: 'auto' } : undefined,
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: cellParagraphs(row[colIdx] ?? '', rowIdx === 0),
      })),
    })),
  });
}

// パイプ表の1行をセル配列へ（エスケープされた \| はリテラルとして扱う）
function splitTableRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim());
}

function isSeparatorRow(cells) {
  return cells.every((c) => /^:?-{3,}:?$/.test(c.replace(/\s/g, '')));
}

// ========== Markdown → docx ブロック列 ==========
function titlePage(title, metaLines) {
  const blocks = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 2600, after: 240 },
      children: [new TextRun({ text: title, bold: true, size: 44, font: FONT, color: '1F4E79' })],
    }),
  ];
  metaLines.forEach((line, i) => {
    blocks.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: i === 0 ? 800 : 80, after: 80 },
      children: [new TextRun({ text: line, size: 24, font: FONT })],
    }));
  });
  blocks.push(new Paragraph({ children: [new PageBreak()] }));
  return blocks;
}

function buildChildren(md) {
  const lines = md.split(/\r?\n/);
  const children = [];
  let i = 0;
  let titleDone = false;

  while (i < lines.length) {
    const line = lines[i];

    // コードフェンス
    if (line.trimStart().startsWith('```')) {
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        buf.push(lines[i]);
        i++;
      }
      i++; // 閉じフェンス
      children.push(...code(buf));
      continue;
    }

    // 表
    if (line.trim().startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = splitTableRow(lines[i]);
        if (!isSeparatorRow(cells)) rows.push(cells);
        i++;
      }
      if (rows.length > 0) children.push(table(rows));
      continue;
    }

    // 見出し
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const txt = h[2].trim();
      if (level === 1 && !titleDone) {
        i++;
        const meta = [];
        while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
          meta.push(lines[i].replace(/^\s*-\s+/, '').replace(/\*\*/g, ''));
          i++;
        }
        children.push(...titlePage(txt, meta));
        titleDone = true;
        continue;
      }
      children.push(headingFor(level, txt));
      i++;
      continue;
    }

    // 水平線（章区切り）は見出しで表現済みのため省略
    if (line.trim() === '---') { i++; continue; }

    // 引用（注記）
    if (line.trimStart().startsWith('>')) {
      const t = line.replace(/^\s*>\s?/, '');
      children.push(quote(t));
      i++;
      continue;
    }

    // 箇条書き
    if (/^\s*-\s+/.test(line)) {
      children.push(bullet(line.replace(/^\s*-\s+/, '')));
      i++;
      continue;
    }

    // 空行
    if (line.trim() === '') { i++; continue; }

    // 段落
    children.push(para(line));
    i++;
  }

  return children;
}

// ========== ドキュメント生成 ==========
// 入力Markdown・出力docxはコマンドライン引数で指定可能（未指定時はメインAPI仕様書）
//   node docs/generate-api-spec-docx.js [入力.md] [出力.docx]
const inputArg = process.argv[2];
const outputArg = process.argv[3];
const mdPath = inputArg
  ? path.resolve(process.cwd(), inputArg)
  : path.resolve(__dirname, 'api-specification.md');
const md = fs.readFileSync(mdPath, 'utf8');
const children = buildChildren(md);

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

const outPath = outputArg
  ? path.resolve(process.cwd(), outputArg)
  : path.resolve(__dirname, '新・ミライ人間洗濯機_API仕様書.docx');
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outPath, buf);
  console.log('生成完了:', outPath);
});
