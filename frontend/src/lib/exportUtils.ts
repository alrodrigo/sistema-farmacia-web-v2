/**
 * Utilidad para exportación de datos a formato CSV compatible con Microsoft Excel.
 * Incluye BOM UTF-8 (\uFEFF) para garantizar la correcta visualización de tildes,
 * caracteres en español y separación de columnas.
 */
export function exportToCsv({
    filename,
    headers,
    rows,
}: {
    filename: string;
    headers: string[];
    rows: (string | number | null | undefined)[][];
}) {
    const escapeCell = (cell: string | number | null | undefined): string => {
        if (cell === null || cell === undefined) return '""';
        const str = String(cell);
        // Si contiene comillas, saltos de línea o comas/punto y coma, escapar comillas
        if (str.includes('"') || str.includes('\n') || str.includes(',') || str.includes(';')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return `"${str}"`;
    };

    const headerLine = headers.map(escapeCell).join(';');
    const rowLines = rows.map((r) => r.map(escapeCell).join(';'));
    const csvContent = '\uFEFF' + [headerLine, ...rowLines].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    const finalFilename = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    link.setAttribute('href', url);
    link.setAttribute('download', finalFilename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
