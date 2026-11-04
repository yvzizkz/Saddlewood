// Who closes a complaint. Pure: the API and both screens share it.

/** An owner, or a PM on a complaint still open with the PM's seat. One with Owner decisions is the owners' to close, whoever logged it. */
export function canCloseComplaint(seat: { owner: boolean; money: boolean }, c: { status: string; role: string }): boolean {
  return seat.owner || (seat.money && c.status === "open" && c.role === "pm");
}
