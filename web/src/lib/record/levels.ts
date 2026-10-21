/**
 * Proofread record trophy levels (by the number of FINISHED documents). Shared by the server and the page.
 * The look of each level (colours, rays, sparkles…) is in components/record/trophy.tsx.
 */
export interface Level {
  /** Finished documents needed. */
  at: number;
  id: "ready" | "first" | "bronze" | "silver" | "gold" | "platinum" | "diamond" | "legend" | "hall";
  name: string;
  /** What the page says at this level. */
  cheer: string;
}

export const LEVELS: Level[] = [
  { at: 0, id: "ready", name: "Ready", cheer: "Your first finished document is waiting." },
  { at: 1, id: "first", name: "First proofread", cheer: "Your first one is done. Many students to come!" },
  { at: 10, id: "bronze", name: "Bronze", cheer: "Ten documents finished. You’re on a roll." },
  { at: 25, id: "silver", name: "Silver", cheer: "Twenty-five finished: students are lucky to have you." },
  { at: 50, id: "gold", name: "Gold", cheer: "Fifty finished. That’s a golden record." },
  { at: 100, id: "platinum", name: "Platinum", cheer: "A hundred finished documents. Truly remarkable." },
  { at: 250, id: "diamond", name: "Diamond", cheer: "Two hundred and fifty. A diamond of a record." },
  { at: 500, id: "legend", name: "Legend", cheer: "Five hundred finished. You are a legend." },
  { at: 1000, id: "hall", name: "Hall of fame", cheer: "A thousand documents. Hall of fame." },
];

/** The level reached with `finished` documents, and the next one (null at the top). */
export function levelOf(finished: number): { level: Level; next: Level | null; index: number } {
  let index = 0;
  for (let i = 0; i < LEVELS.length; i++) if (finished >= LEVELS[i].at) index = i;
  return { level: LEVELS[index], next: LEVELS[index + 1] ?? null, index };
}
