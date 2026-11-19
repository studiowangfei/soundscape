import { createContext } from "react";

/**
 * The fingerprints of the icons a song's cards show, by site (content/icon-versions.ts), set by its page (SongView), so
 * a replaced icon's address changes and browsers fetch it instead of the copy they saved (Attribution).
 */
export const IconVersions = createContext<Record<string, string>>({});
