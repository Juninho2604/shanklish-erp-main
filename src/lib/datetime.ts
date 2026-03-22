const CARACAS_UTC_OFFSET_HOURS = -4;

export function getCaracasNowParts(date = new Date()) {
    const shifted = new Date(date.getTime() + CARACAS_UTC_OFFSET_HOURS * 60 * 60 * 1000);
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth(),
        day: shifted.getUTCDate(),
    };
}

export function getCaracasDayRange(date = new Date()) {
    const { year, month, day } = getCaracasNowParts(date);
    const start = new Date(Date.UTC(year, month, day, 4, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, day, 27, 59, 59, 999));
    return { start, end };
}

export function getCaracasDateStamp(date = new Date()) {
    const { year, month, day } = getCaracasNowParts(date);
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
