// Is the US equity regular session open at a given moment. NYSE regular hours are 09:30 to 16:00
// Eastern, Monday to Friday. Eastern time observes DST, so the wall-clock is derived through the
// America/New_York zone with Intl rather than a fixed UTC offset, which would be wrong for half the
// year. Node's runtime carries the IANA tz database, so new Date() and this are enough, no library.
//
// HOLIDAYS ARE IGNORED. This does not know that the market is shut on Thanksgiving or July 4th, nor
// about half-days (the early 13:00 close on some eves). It answers the regular-hours question only.
// A caller that needs holiday accuracy must layer a calendar on top; a tokenized-stock price is
// stale on a holiday exactly as it is stale on a weekend, and this flags the weekend and the clock.

// Minutes since ET midnight for the regular session bounds.
const OPEN_MINUTE = 9 * 60 + 30 // 09:30
const CLOSE_MINUTE = 16 * 60 // 16:00

const WEEKDAYS = new Set(["Mon", "Tue", "Wed", "Thu", "Fri"])

export interface MarketStatus {
  // True only when it is a weekday and the ET clock is in [09:30, 16:00). Holidays are not checked.
  isOpen: boolean
  // Short weekday in Eastern time: Mon..Sun.
  weekday: string
  // Eastern wall-clock, "HH:MM", the value the open/closed decision was made on.
  etTime: string
  // Plain-English why, safe to show a non-crypto-native user.
  reason: string
  // Restates the holiday caveat, so a consumer serializing this never loses it.
  holidaysIgnored: true
}

// Pull the Eastern-time weekday, hour and minute for a Date. hourCycle h23 avoids the "24" some
// engines return for midnight under hour12:false.
function easternParts(date: Date): { weekday: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  let weekday = ""
  let hour = 0
  let minute = 0
  for (const p of parts) {
    if (p.type === "weekday") weekday = p.value
    else if (p.type === "hour") hour = Number(p.value)
    else if (p.type === "minute") minute = Number(p.value)
  }
  return { weekday, hour, minute }
}

export function marketHours(date: Date = new Date()): MarketStatus {
  const { weekday, hour, minute } = easternParts(date)
  const etTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
  const isWeekday = WEEKDAYS.has(weekday)
  const minutes = hour * 60 + minute
  const withinHours = minutes >= OPEN_MINUTE && minutes < CLOSE_MINUTE
  const isOpen = isWeekday && withinHours

  let reason: string
  if (!isWeekday) {
    reason = `US markets are closed on the weekend (${weekday}). On-chain prices keep trading, so a bStock price now can drift from the last reference.`
  } else if (!withinHours) {
    const when = minutes < OPEN_MINUTE ? "before the 09:30 ET open" : "after the 16:00 ET close"
    reason = `US regular session is closed: ${etTime} ET is ${when}. Holidays are not checked here.`
  } else {
    reason = `US regular session is open (${etTime} ET, ${weekday}). Holidays are not checked here.`
  }

  return { isOpen, weekday, etTime, reason, holidaysIgnored: true }
}
