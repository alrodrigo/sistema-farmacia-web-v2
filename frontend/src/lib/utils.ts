export function formatBs(cents: number): string {
    return (cents / 100).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatBsCompact(cents: number): string {
    const bs = cents / 100;
    if (bs >= 1000000) return `${(bs / 1000000).toFixed(1)}M`;
    if (bs >= 1000) return `${(bs / 1000).toFixed(1)}K`;
    return bs.toFixed(2);
}

export function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(dateStr: string): string {
    return new Date(dateStr).toLocaleString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
}

export function getInitials(name: string): string {
    return name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
}