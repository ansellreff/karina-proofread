import type { Identity } from "./docx/revise";

/**
 * The reviewer identity written into every output file, matching Karina's own Word edits
 * (author name, Windows Live presence id from her documents, UTC+8 clock).
 */
export const KARINA: Identity = {
  author: "Karina Octavia",
  utcOffsetMinutes: 8 * 60,
  providerId: "Windows Live",
  userId: "c0b743433865321e",
};
