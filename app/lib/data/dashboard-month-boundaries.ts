import {
  calendarDay,
  shiftDayKey,
  startOfShelterDay,
  type CalendarDay,
} from "../utils/shelter-day";

/**
 * The shared calendar-month boundaries for dashboard card trends.
 *
 * Month keys come from the shelter's resolved current day. The instant starts
 * exist only for querying timestamp columns; day-valued columns use the keys.
 */
export const resolveDashboardMonthBoundaries = (
  today: CalendarDay,
  timezone: string,
) => {
  const currentMonthFromDay = calendarDay(`${today.slice(0, 7)}-01`);
  const lastMonthToDay = shiftDayKey(currentMonthFromDay, -1);
  const lastMonthFromDay = calendarDay(`${lastMonthToDay.slice(0, 7)}-01`);

  return {
    currentMonthFromDay,
    lastMonthFromDay,
    lastMonthToDay,
    startOfCurrentMonth: startOfShelterDay(currentMonthFromDay, timezone),
    startOfLastMonth: startOfShelterDay(lastMonthFromDay, timezone),
  };
};
