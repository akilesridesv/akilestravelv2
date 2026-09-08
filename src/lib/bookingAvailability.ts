/** Unknown or malformed aggregate data must never become zero booked. */
export function parseBookedSeats(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("No se pudieron verificar los cupos. Reintenta antes de reservar.");
  }
  return value;
}

export function bookingCapacity(booked: number | null, slotCapacity: number | undefined, maxCapacity: number, minPeople: number) {
  const valid = booked != null && Number.isSafeInteger(booked) && booked >= 0 &&
    slotCapacity != null && Number.isSafeInteger(slotCapacity) && slotCapacity >= 0 &&
    Number.isSafeInteger(maxCapacity) && maxCapacity > 0 && Number.isSafeInteger(minPeople) && minPeople > 0;
  const remaining = valid ? Math.max(0, Math.min(slotCapacity!, maxCapacity) - booked!) : 0;
  return { remaining, canBook: valid && remaining >= minPeople };
}
