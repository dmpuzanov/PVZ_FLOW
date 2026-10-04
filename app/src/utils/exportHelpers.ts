import { ALL_ARTICLES, ARTICLE_MAP } from '../constants/initialData';
import {
  ArrivalRecord,
  CapsuleItem,
  DailyStockRow,
  OperatorFulfillment,
  SellerTariff,
  Settings,
  ShipmentRecord,
} from '../types/pvz';
import { formatDateRu } from './calculations';

/**
 * Escapes CSV field value according to RFC 4180 (handles semicolons, quotes, newlines)
 */
function escapeCsv(val: any): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(';') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Downloads string content as a file with UTF-8 BOM so Excel opens Cyrillic without garbled characters
 */
export function downloadFile(content: string, filename: string, mimeType = 'text/csv;charset=utf-8;') {
  const blob = new Blob(['\uFEFF' + content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 1. Matrix in normalized vertical format (Дата;Артикул;Категория;Было;Поставка;Отгрузка;Осталось)
 */
export function generateMatrixCsv(matrix: DailyStockRow[]): string {
  const lines: string[] = [
    ['Дата', 'Артикул', 'Категория', 'Было', 'Поставка', 'Отгрузка', 'Осталось'].join(';'),
  ];

  matrix.forEach((row) => {
    ALL_ARTICLES.forEach((art) => {
      const cell = row.byArticle[art];
      const cat = ARTICLE_MAP.get(art)?.category || '';
      if (cell) {
        lines.push(
          [
            escapeCsv(formatDateRu(row.date)),
            escapeCsv(art),
            escapeCsv(cat),
            cell.balanceStart,
            cell.arrival,
            cell.shipment,
            cell.balanceEnd,
          ].join(';')
        );
      }
    });
  });

  return lines.join('\r\n');
}

/**
 * 2. Matrix in wide spreadsheet format (Date as rows, 4 subcolumns per article - exactly like on screen)
 */
export function generateMatrixWideCsv(matrix: DailyStockRow[]): string {
  // Row 1: Header with article names spanning 4 cols
  const header1 = ['Дата'];
  ALL_ARTICLES.forEach((art) => {
    header1.push(art, '', '', '');
  });

  // Row 2: Sub-headers
  const header2 = [''];
  ALL_ARTICLES.forEach(() => {
    header2.push('Было', 'Поставка', 'Отгрузка', 'Осталось');
  });

  const lines: string[] = [
    header1.map(escapeCsv).join(';'),
    header2.map(escapeCsv).join(';'),
  ];

  matrix.forEach((row) => {
    const rowCells = [formatDateRu(row.date)];
    ALL_ARTICLES.forEach((art) => {
      const cell = row.byArticle[art] || { balanceStart: 0, arrival: 0, shipment: 0, balanceEnd: 0 };
      rowCells.push(
        String(cell.balanceStart),
        String(cell.arrival),
        String(cell.shipment),
        String(cell.balanceEnd)
      );
    });
    lines.push(rowCells.map(escapeCsv).join(';'));
  });

  return lines.join('\r\n');
}

/**
 * 3. Arrivals & Returns journal CSV
 */
export function generateArrivalsCsv(arrivals: ArrivalRecord[]): string {
  const lines: string[] = [
    ['ID', 'Дата', 'Тип операции', 'Артикул', 'Категория', 'Количество (шт)', 'Примечание', 'Время регистрации'].join(';'),
  ];

  const sorted = [...arrivals].sort((a, b) => b.date.localeCompare(a.date));

  sorted.forEach((item) => {
    const info = ARTICLE_MAP.get(item.article);
    const typeLabel = item.type === 'return' ? 'Возврат (невыкуп)' : 'Приёмка от селлера';
    lines.push(
      [
        escapeCsv(item.id),
        escapeCsv(formatDateRu(item.date)),
        escapeCsv(typeLabel),
        escapeCsv(item.article),
        escapeCsv(info?.category || ''),
        item.quantity,
        escapeCsv(item.note || ''),
        escapeCsv(item.createdAt),
      ].join(';')
    );
  });

  return lines.join('\r\n');
}

/**
 * 4. Shipments journal CSV
 */
export function generateShipmentsCsv(shipments: ShipmentRecord[]): string {
  const lines: string[] = [
    ['ID', 'Дата отгрузки', 'Артикул', 'Категория', 'Брендирование', 'Количество (шт)', 'Время регистрации'].join(';'),
  ];

  const sorted = [...shipments].sort((a, b) => b.date.localeCompare(a.date));

  sorted.forEach((item) => {
    const info = ARTICLE_MAP.get(item.article);
    const brandingLabel = info?.hasBranding ? 'Да' : 'Нет (Ми)';
    lines.push(
      [
        escapeCsv(item.id),
        escapeCsv(formatDateRu(item.date)),
        escapeCsv(item.article),
        escapeCsv(info?.category || ''),
        escapeCsv(brandingLabel),
        item.quantity,
        escapeCsv(item.createdAt),
      ].join(';')
    );
  });

  return lines.join('\r\n');
}

/**
 * 5. Full Excel XML Workbook (.xls format) with multiple native worksheets:
 * - "Матрица остатков"
 * - "Журнал приёмки и возвратов"
 * - "Журнал отгрузок"
 * - "Капсулы FIFO"
 * - "Фулфилмент селлера"
 * 
 * Microsoft Excel, LibreOffice Calc, Apple Numbers open this multi-sheet workbook natively without warning.
 */
export function generateExcelWorkbookXml(params: {
  matrix: DailyStockRow[];
  arrivals: ArrivalRecord[];
  shipments: ShipmentRecord[];
  capsules: CapsuleItem[];
  settings: Settings;
  sellerTariffs: Record<string, SellerTariff>;
}): string {
  const { matrix, arrivals, shipments, capsules, settings, sellerTariffs } = params;

  const escapeXml = (str: any) => {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  const xmlParts: string[] = [];

  xmlParts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  xmlParts.push(`<?mso-application progid="Excel.Sheet"?>`);
  xmlParts.push(`<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Title>PVZ.FLOW Экспорт данных</Title>
  <Author>PVZ.FLOW</Author>
  <Created>${new Date().toISOString()}</Created>
 </DocumentProperties>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Borders/>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#333333"/>
   <Interior/>
   <NumberFormat/>
   <Protection/>
  </Style>
  <Style ss:ID="Header">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#BD995A"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E0E0E0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E0E0E0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#BD995A"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#FFFFFF" ss:Bold="1"/>
   <Interior ss:Color="#5A081E" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="SubHeader">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#BD995A"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E0E0E0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E0E0E0"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#333333" ss:Bold="1"/>
   <Interior ss:Color="#EEE5D6" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="DateCell">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAEAEA"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAEAEA"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAEAEA"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1"/>
  </Style>
  <Style ss:ID="NumCell">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAEAEA"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAEAEA"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAEAEA"/>
   </Borders>
   <NumberFormat ss:Format="#,##0"/>
  </Style>
  <Style ss:ID="ArrivalCell">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAEAEA"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAEAEA"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAEAEA"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#107C41" ss:Bold="1"/>
   <NumberFormat ss:Format="#,##0"/>
  </Style>
  <Style ss:ID="ShipmentCell">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAEAEA"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAEAEA"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAEAEA"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#5A081E" ss:Bold="1"/>
   <NumberFormat ss:Format="#,##0"/>
  </Style>
  <Style ss:ID="NegativeCell">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAEAEA"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAEAEA"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAEAEA"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#DC2626" ss:Bold="1"/>
   <Interior ss:Color="#FEE2E2" ss:Pattern="Solid"/>
   <NumberFormat ss:Format="#,##0"/>
  </Style>
  <Style ss:ID="TotalCell">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#5A081E"/>
    <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#5A081E"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#5A081E"/>
   <Interior ss:Color="#EEDDB0" ss:Pattern="Solid"/>
   <NumberFormat ss:Format="#,##0"/>
  </Style>
  <Style ss:ID="MoneyCell">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAEAEA"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAEAEA"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAEAEA"/>
   </Borders>
   <NumberFormat ss:Format="#,##0.00\ &quot;₽&quot;"/>
  </Style>
 </Styles>`);

  // --- SHEET 1: МАТРИЦА ОСТАТКОВ ---
  xmlParts.push(` <Worksheet ss:Name="Матрица остатков">`);
  xmlParts.push(`  <Table>`);
  xmlParts.push(`   <Column ss:Width="90"/>`); // Date column
  for (let i = 0; i < ALL_ARTICLES.length * 4; i++) {
    xmlParts.push(`   <Column ss:Width="65"/>`);
  }

  // Row 1: Article headers spanning 4 cells
  xmlParts.push(`   <Row ss:Height="26">`);
  xmlParts.push(`    <Cell ss:StyleID="Header"><Data ss:Type="String">Дата</Data></Cell>`);
  ALL_ARTICLES.forEach((art) => {
    xmlParts.push(`    <Cell ss:MergeAcross="3" ss:StyleID="Header"><Data ss:Type="String">${escapeXml(art)}</Data></Cell>`);
  });
  xmlParts.push(`   </Row>`);

  // Row 2: Sub-headers
  xmlParts.push(`   <Row ss:Height="20">`);
  xmlParts.push(`    <Cell ss:StyleID="SubHeader"><Data ss:Type="String">ДД.ММ.ГГГГ</Data></Cell>`);
  ALL_ARTICLES.forEach(() => {
    xmlParts.push(`    <Cell ss:StyleID="SubHeader"><Data ss:Type="String">Было</Data></Cell>`);
    xmlParts.push(`    <Cell ss:StyleID="SubHeader"><Data ss:Type="String">Поставка</Data></Cell>`);
    xmlParts.push(`    <Cell ss:StyleID="SubHeader"><Data ss:Type="String">Отгрузка</Data></Cell>`);
    xmlParts.push(`    <Cell ss:StyleID="SubHeader"><Data ss:Type="String">Осталось</Data></Cell>`);
  });
  xmlParts.push(`   </Row>`);

  // Data rows
  matrix.forEach((row) => {
    xmlParts.push(`   <Row ss:Height="19">`);
    xmlParts.push(`    <Cell ss:StyleID="DateCell"><Data ss:Type="String">${escapeXml(formatDateRu(row.date))}</Data></Cell>`);
    ALL_ARTICLES.forEach((art) => {
      const cell = row.byArticle[art] || { balanceStart: 0, arrival: 0, shipment: 0, balanceEnd: 0 };
      const endStyle = cell.balanceEnd < 0 ? 'NegativeCell' : 'NumCell';
      const arrStyle = cell.arrival > 0 ? 'ArrivalCell' : 'NumCell';
      const shpStyle = cell.shipment > 0 ? 'ShipmentCell' : 'NumCell';

      xmlParts.push(`    <Cell ss:StyleID="NumCell"><Data ss:Type="Number">${cell.balanceStart}</Data></Cell>`);
      xmlParts.push(`    <Cell ss:StyleID="${arrStyle}"><Data ss:Type="Number">${cell.arrival}</Data></Cell>`);
      xmlParts.push(`    <Cell ss:StyleID="${shpStyle}"><Data ss:Type="Number">${cell.shipment}</Data></Cell>`);
      xmlParts.push(`    <Cell ss:StyleID="${endStyle}"><Data ss:Type="Number">${cell.balanceEnd}</Data></Cell>`);
    });
    xmlParts.push(`   </Row>`);
  });

  xmlParts.push(`  </Table>`);
  xmlParts.push(` </Worksheet>`);

  // --- SHEET 2: ЖУРНАЛ ПРИЁМКИ И ВОЗВРАТОВ ---
  xmlParts.push(` <Worksheet ss:Name="Приёмка и возвраты">`);
  xmlParts.push(`  <Table>`);
  xmlParts.push(`   <Column ss:Width="80"/>`); // ID
  xmlParts.push(`   <Column ss:Width="90"/>`); // Дата
  xmlParts.push(`   <Column ss:Width="130"/>`); // Тип
  xmlParts.push(`   <Column ss:Width="80"/>`); // Артикул
  xmlParts.push(`   <Column ss:Width="80"/>`); // Категория
  xmlParts.push(`   <Column ss:Width="100"/>`); // Количество
  xmlParts.push(`   <Column ss:Width="200"/>`); // Примечание

  xmlParts.push(`   <Row ss:Height="24">`);
  xmlParts.push(`    <Cell ss:StyleID="Header"><Data ss:Type="String">ID</Data></Cell>`);
  xmlParts.push(`    <Cell ss:StyleID="Header"><Data ss:Type="String">Дата</Data></Cell>`);
  xmlParts.push(`    <Cell ss:StyleID="Header"><Data ss:Type="String">Тип операции</Data></Cell>`);
  xmlParts.push(`    <Cell ss:StyleID="Header"><Data ss:Type="String">Артикул</Data></Cell>`);
  xmlParts.push(`    <Cell ss:StyleID="Header"><Data ss:Type="String">Категория</Data></Cell>`);
  xmlParts.push(`    <Cell ss:StyleID="Header"><Data ss:Type="String">Количество (шт)</Data></Cell>`);
  xmlParts.push(`    <Cell ss:StyleID="Header"><Data ss:Type="String">Примечание</Data></Cell>`);
  xmlParts.push(`   </Row>`);

  const sortedArrivals = [...arrivals].sort((a, b) => b.date.localeCompare(a.date));
  sortedArrivals.forEach((item) => {
    const info = ARTICLE_MAP.get(item.article);
    const typeLabel = item.type === 'return' ? 'Возврат (невыкуп)' : 'Приёмка от селлера';
    xmlParts.push(`   <Row ss:Height="19">`);
    xmlParts.push(`    <Cell ss:StyleID="NumCell"><Data ss:Type="String">${escapeXml(item.id)}</Data></Cell>`);
    xmlParts.push(`    <Cell ss:StyleID="DateCell"><Data ss:Type="String">${escapeXml(formatDateRu(item.date))}</Data></Cell>`);
    xmlParts.push(`    <Cell ss:StyleID="DateCell"><Data ss:Type="String">${escapeXml(typeLabel)}</Data></Cell>`);
    xmlParts.push(`    <Cell ss:StyleID="DateCell"><Data ss:Type="String">${escapeXml(item.article)}</Data></Cell>`);
    xmlParts.push(`    <Cell ss:StyleID="DateCell"><Data ss:Type="String">${escapeXml(info?.category || '')}</Data></Cell>`);
    xmlParts.push(`    <Cell ss:StyleID="ArrivalCell"><Data ss:Type="Number">${item.quantity}</Data></Cell>`);
    xmlParts.push(`    <Cell ss:StyleID="NumCell"><Data ss:Type="String">${escapeXml(item.note || '')}</Data></Cell>`);
    xmlParts.push(`   </Row>`);
  });

  xmlParts.push(`  </Table>`);
  xmlParts.push(` </Worksheet>`);

  // --- SHEET 3: ЖУРНАЛ ОТГРУЗОК ---
  xmlParts.push(` <Worksheet ss:Name="Отгрузка в WB">`);
  xmlParts.push(`  <Table>`);
  xmlParts.push(`   <Column ss:Width="80"/>`);
  xmlParts.push(`   <Column ss:Width="90"/>`);
  xmlParts.push(`   <Column ss:Width="90"/>`);
  xmlParts.push(`   <Column ss:Width="80"/>`);
  xmlParts.push(`   <Column ss:Width="100"/>`);
  xmlParts.push(`   <Column ss:Width="100"/>`);

  xmlParts.push(`   <Row ss:Height="24">`);
  xmlParts.push(`    <Cell ss:StyleID="Header"><Data ss:Type="String">ID</Data></Cell>`);
  xmlParts.push(`    <Cell ss:StyleID="Header"><Data ss:Type="String">Дата отгрузки</Data></Cell>`);
  xmlParts.push(`    <Cell ss:StyleID="Header"><Data ss:Type="String">Артикул</Data></Cell>`);
  xmlParts.push(`    <Cell ss:StyleID="Header"><Data ss:Type="String">Категория</Data></Cell>`);
  xmlParts.push(`    <Cell ss:StyleID="Header"><Data ss:Type="String">Брендирование</Data></Cell>`);
  xmlParts.push(`    <Cell ss:StyleID="Header"><Data ss:Type="String">Количество (шт)</Data></Cell>`);
  xmlParts.push(`   </Row>`);

  const sortedShipments = [...shipments].sort((a, b) => b.date.localeCompare(a.date));
  sortedShipments.forEach((item) => {
    const info = ARTICLE_MAP.get(item.article);
    const brandingLabel = info?.hasBranding ? 'Да' : 'Нет (Ми)';
    xmlParts.push(`   <Row ss:Height="19">`);
    xmlParts.push(`    <Cell ss:StyleID="NumCell"><Data ss:Type="String">${escapeXml(item.id)}</Data></Cell>`);
    xmlParts.push(`    <Cell ss:StyleID="DateCell"><Data ss:Type="String">${escapeXml(formatDateRu(item.date))}</Data></Cell>`);
    xmlParts.push(`    <Cell ss:StyleID="DateCell"><Data ss:Type="String">${escapeXml(item.article)}</Data></Cell>`);
    xmlParts.push(`    <Cell ss:StyleID="DateCell"><Data ss:Type="String">${escapeXml(info?.category || '')}</Data></Cell>`);
    xmlParts.push(`    <Cell ss:StyleID="DateCell"><Data ss:Type="String">${escapeXml(brandingLabel)}</Data></Cell>`);
    xmlParts.push(`    <Cell ss:StyleID="ShipmentCell"><Data ss:Type="Number">${item.quantity}</Data></Cell>`);
    xmlParts.push(`   </Row>`);
  });

  xmlParts.push(`  </Table>`);
  xmlParts.push(` </Worksheet>`);

  // --- SHEET 4: КАПСУЛЫ ХРАНЕНИЯ (FIFO) ---
  xmlParts.push(` <Worksheet ss:Name="Капсулы хранения (FIFO)">`);
  xmlParts.push(`  <Table>`);
  xmlParts.push(`   <Column ss:Width="90"/>`);
  xmlParts.push(`   <Column ss:Width="80"/>`);
  xmlParts.push(`   <Column ss:Width="90"/>`);
  xmlParts.push(`   <Column ss:Width="90"/>`);
  xmlParts.push(`   <Column ss:Width="90"/>`);
  xmlParts.push(`   <Column ss:Width="90"/>`);
  xmlParts.push(`   <Column ss:Width="90"/>`);

  xmlParts.push(`   <Row ss:Height="24">`);
  xmlParts.push(`    <Cell ss:StyleID="Header"><Data ss:Type="String">Дата партии</Data></Cell>`);
  xmlParts.push(`    <Cell ss:StyleID="Header"><Data ss:Type="String">Артикул</Data></Cell>`);
  xmlParts.push(`    <Cell ss:StyleID="Header"><Data ss:Type="String">Тип партии</Data></Cell>`);
  xmlParts.push(`    <Cell ss:StyleID="Header"><Data ss:Type="String">Приход (шт)</Data></Cell>`);
  xmlParts.push(`    <Cell ss:StyleID="Header"><Data ss:Type="String">Списано (шт)</Data></Cell>`);
  xmlParts.push(`    <Cell ss:StyleID="Header"><Data ss:Type="String">Шт-дни в периоде</Data></Cell>`);
  xmlParts.push(`    <Cell ss:StyleID="Header"><Data ss:Type="String">Стоимость (₽)</Data></Cell>`);
  xmlParts.push(`   </Row>`);

  capsules.forEach((cap) => {
    xmlParts.push(`   <Row ss:Height="19">`);
    xmlParts.push(`    <Cell ss:StyleID="DateCell"><Data ss:Type="String">${escapeXml(formatDateRu(cap.date))}</Data></Cell>`);
    xmlParts.push(`    <Cell ss:StyleID="DateCell"><Data ss:Type="String">${escapeXml(cap.article)}</Data></Cell>`);
    xmlParts.push(`    <Cell ss:StyleID="DateCell"><Data ss:Type="String">${cap.type === 'return' ? 'Возврат' : 'Приёмка'}</Data></Cell>`);
    xmlParts.push(`    <Cell ss:StyleID="NumCell"><Data ss:Type="Number">${cap.initialQuantity}</Data></Cell>`);
    xmlParts.push(`    <Cell ss:StyleID="NumCell"><Data ss:Type="Number">${cap.shippedQuantity}</Data></Cell>`);
    xmlParts.push(`    <Cell ss:StyleID="NumCell"><Data ss:Type="Number">${cap.unitDaysInPeriod}</Data></Cell>`);
    xmlParts.push(`    <Cell ss:StyleID="MoneyCell"><Data ss:Type="Number">${cap.storageCost}</Data></Cell>`);
    xmlParts.push(`   </Row>`);
  });

  xmlParts.push(`  </Table>`);
  xmlParts.push(` </Worksheet>`);

  xmlParts.push(`</Workbook>`);

  return xmlParts.join('\r\n');
}
