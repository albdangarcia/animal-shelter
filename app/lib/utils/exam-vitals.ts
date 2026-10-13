import { startOfShelterDay, type CalendarDay } from "@/app/lib/utils/shelter-day";

/**
 * When the vitals measured during an exam were taken. A vitals entry records
 * an instant, and an exam only a day. An exam recorded on the day it was done
 * measured them now; one recorded for an earlier day is placed at the moment
 * that day began on the shelter's calendar, as the intake weigh-in is,
 * since nothing finer was recorded.
 */
export const examVitalsInstant = (
  completedDate: CalendarDay,
  today: CalendarDay,
  timezone: string,
  now: Date,
): Date =>
  completedDate === today ? now : startOfShelterDay(completedDate, timezone);
