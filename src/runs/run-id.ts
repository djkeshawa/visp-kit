export function nextRunId(existingIds: readonly string[]): string {
  const max = existingIds.reduce((highest, id) => {
    const match = /^RUN(\d+)$/.exec(id);
    if (match === null) return highest;
    return Math.max(highest, Number.parseInt(match[1]!, 10));
  }, 0);

  return `RUN${String(max + 1).padStart(3, "0")}`;
}

export function eventId(index: number): string {
  return `EVT${String(index + 1).padStart(3, "0")}`;
}
