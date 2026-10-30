/**
 * The tuning controls (the Tune panels, the song pages' background style switcher and its number keys) are for
 * working on the design: on in development (`next dev`), left out of the deployed site, which always looks as shipped,
 * with the defaults in backdrops/params.ts, glass/settings.ts and typeface.ts.
 */
export const TUNING = process.env.NODE_ENV === "development";
