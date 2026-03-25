export const downloadJsonAsCsv = <T extends Record<string, unknown>>(
  rows: T[],
  filename: string,
): void => {
  if (!rows.length) return;

  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));

  const escapeValue = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const formatted =
      typeof value === 'string'
        ? value
        : value instanceof Date
          ? value.toISOString()
          : JSON.stringify(value);

    const escaped = formatted.replace(/"/g, '""');
    return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
  };

  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escapeValue(row[header])).join(',')),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};
