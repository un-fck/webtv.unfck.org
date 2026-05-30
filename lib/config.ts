// Lookback window for the schedule view (note: app/page.tsx currently uses DAYS_BACK = 365 directly).
// Historical search beyond this window goes through /api/search (PostgreSQL FTS).
export const scheduleLookbackDays = 14;
