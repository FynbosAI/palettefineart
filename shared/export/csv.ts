export type CsvValue = string | number | boolean | null | undefined | Date;

const normalizeValue = (value: CsvValue): string => {
  if (value === null || typeof value === 'undefined') return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
};

const escapeCsvValue = (value: string): string => {
  if (value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  if (/[,\n\r]/.test(value)) {
    return `"${value}"`;
  }
  return value;
};

export const buildCsvContent = (headers: string[], rows: CsvValue[][]): string => {
  const normalizedRows = [
    headers,
    ...rows.map((row) => row.map((cell) => normalizeValue(cell))),
  ];

  return normalizedRows
    .map((row) => row.map((cell) => escapeCsvValue(cell)).join(','))
    .join('\n');
};

export const downloadCsv = (filename: string, headers: string[], rows: CsvValue[][]) => {
  const csv = buildCsvContent(headers, rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
