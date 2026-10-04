import * as XLSX from 'xlsx';
import { ALL_ARTICLES, ARTICLE_MAP } from '../constants/initialData';
import { ArrivalRecord, CapsuleItem, DailyStockRow, ShipmentRecord } from '../types/pvz';
import { formatDateRu } from './calculations';

export function exportFullWorkbookXlsx(params: {
  matrix: DailyStockRow[];
  arrivals: ArrivalRecord[];
  shipments: ShipmentRecord[];
  capsules: CapsuleItem[];
  filename: string;
}) {
  const { matrix, arrivals, shipments, capsules, filename } = params;
  const workbook = XLSX.utils.book_new();

  const matrixRows = matrix.flatMap((row) => ALL_ARTICLES.map((article) => {
    const cell = row.byArticle[article] ?? { balanceStart: 0, arrival: 0, shipment: 0, balanceEnd: 0 };
    return {
      'Дата': formatDateRu(row.date),
      'Артикул': article,
      'Категория': ARTICLE_MAP.get(article)?.category ?? '',
      'Было': cell.balanceStart,
      'Поступило': cell.arrival,
      'Отгружено': cell.shipment,
      'Остаток': cell.balanceEnd,
    };
  }));

  const sheets: Array<[string, object[]]> = [
    ['Матрица', matrixRows],
    ['Приход', arrivals.map((item) => ({
      'Дата': formatDateRu(item.date), 'Операция': item.type === 'return' ? 'Возврат' : 'Приёмка',
      'Артикул': item.article, 'Количество': item.quantity, 'Примечание': item.note ?? '',
    }))],
    ['Отгрузка', shipments.map((item) => ({
      'Дата': formatDateRu(item.date), 'Артикул': item.article, 'Количество': item.quantity,
    }))],
    ['Капсулы FIFO', capsules.map((item) => ({
      'Артикул': item.article, 'Дата поступления': formatDateRu(item.date),
      'Исходное количество': item.initialQuantity, 'Остаток': item.remainingQuantity,
    }))],
  ];

  sheets.forEach(([name, rows]) => {
    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet['!cols'] = Object.keys(rows[0] ?? {}).map((key) => ({ wch: Math.max(12, key.length + 2) }));
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  });

  XLSX.writeFile(workbook, filename, { compression: true });
}
