import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { DocxBlock, DocxSpec } from './specs.js';

const border = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' };
const borders = { top: border, bottom: border, left: border, right: border };

function lines(text: string, options: { bold?: boolean; color?: string; size?: number } = {}): TextRun[] {
  return text.split('\n').map((line, index) => new TextRun({ text: line, break: index === 0 ? 0 : 1, ...options }));
}

function renderBlock(block: DocxBlock, accent: string): Array<Paragraph | Table> {
  switch (block.t) {
    case 'title':
      return [new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { after: 80 }, children: [new TextRun({ text: block.text })] })];
    case 'subtitle':
      return [new Paragraph({ spacing: { after: 240 }, children: lines(block.text, { color: '595959', size: 22 }) })];
    case 'h':
      return [new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 }, children: [new TextRun({ text: block.text })] })];
    case 'p':
      return [new Paragraph({ spacing: { after: 140, line: 300 }, children: lines(block.text) })];
    case 'bullets':
      return block.items.map(
        (item) =>
          new Paragraph({ numbering: { reference: 'bullets', level: 0 }, spacing: { after: 60 }, children: [new TextRun({ text: item })] }),
      );
    case 'table': {
      const columnWidth = Math.floor(9360 / block.header.length);
      const cell = (text: string, header: boolean) =>
        new TableCell({
          borders,
          width: { size: columnWidth, type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          shading: header ? { type: ShadingType.CLEAR, fill: accent, color: 'auto' } : undefined,
          children: [new Paragraph({ children: [new TextRun({ text, bold: header, color: header ? 'FFFFFF' : undefined })] })],
        });
      return [
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: block.header.map(() => columnWidth),
          rows: [
            new TableRow({ tableHeader: true, children: block.header.map((text) => cell(text, true)) }),
            ...block.rows.map((row) => new TableRow({ children: row.map((text) => cell(text, false)) })),
          ],
        }),
        new Paragraph({ spacing: { after: 120 }, children: [] }),
      ];
    }
  }
}

export async function renderDocx(spec: DocxSpec): Promise<Buffer> {
  const document = new Document({
    creator: 'Office Template Library',
    title: spec.name,
    description: spec.description,
    styles: {
      default: { document: { run: { font: 'Calibri', size: 22 } } },
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 52, bold: true, color: spec.accent },
          paragraph: { spacing: { before: 0, after: 80 }, outlineLevel: 0 },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 28, bold: true, color: spec.accent },
          paragraph: { spacing: { before: 240, after: 80 }, outlineLevel: 1 },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: 'bullets',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1200, right: 1440, bottom: 1200, left: 1440 } } },
        children: spec.blocks.flatMap((block) => renderBlock(block, spec.accent)),
      },
    ],
  });
  return Packer.toBuffer(document);
}
