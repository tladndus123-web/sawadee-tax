// Upload limits, kept apart from lib/extract-schema (zod) so the upload queue does not pull zod into every screen
// that can take a photo (speed, 2026-11-09).

/** Photos read at the same time; each is its own request */
export const MAX_PHOTOS = 5;
/** Photos the upload list holds (continuous shooting); MAX_PHOTOS of them are read at the same time */
export const MAX_QUEUE = 30;
