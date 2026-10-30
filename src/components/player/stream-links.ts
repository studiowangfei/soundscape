/** The song on each streaming service (the icons on the player). */
export type StreamLinks = { spotify: string; appleMusic: string; youtubeMusic: string };

type Song = { title: string; artist: string; spotifyId?: string | null; youtubeMusicId?: string | null; preview?: { link: string } };

/**
 * The song's own page on Spotify, Apple Music (the preview's store link) and YouTube Music where the entry knows it,
 * else that service's search for "artist title".
 */
export function streamLinks(song: Song): StreamLinks {
  const q = encodeURIComponent(`${song.artist} ${song.title}`);
  return {
    spotify: song.spotifyId ? `https://open.spotify.com/track/${song.spotifyId}` : `https://open.spotify.com/search/${q}`,
    appleMusic: song.preview?.link ? withoutTracking(song.preview.link) : `https://music.apple.com/us/search?term=${q}`,
    youtubeMusic: song.youtubeMusicId ? `https://music.youtube.com/watch?v=${song.youtubeMusicId}` : `https://music.youtube.com/search?q=${q}`,
  };
}

// iTunes tags its store links with a "uo" parameter; the page is the same without it.
function withoutTracking(link: string) {
  const url = new URL(link);
  url.searchParams.delete("uo");
  return url.toString();
}
