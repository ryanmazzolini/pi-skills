export function nextCronOccurrence(
  schedule: string,
  options?: { after?: Date; maxMinutes?: number },
): Date | undefined;

export function previousCronOccurrence(
  schedule: string,
  options?: { atOrBefore?: Date; maxMinutes?: number },
): Date | undefined;
