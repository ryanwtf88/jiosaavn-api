import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { handle } from "@hono/node-server/vercel";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { swaggerUI } from "@hono/swagger-ui";
import { JioSaavnAPI } from "./jioSaavn.js";

export const config = {
  api: {
    bodyParser: false,
  },
};

export const app = new OpenAPIHono().basePath("/api");

app.use("*", cors());
app.use("*", logger());
app.use("*", prettyJSON());

const api = new JioSaavnAPI();

// --- Schemas ---

const TrackSchema = z.object({
  identifier: z.string().optional(),
  title: z.string().optional(),
  length: z.number().optional(),
  uri: z.string().nullable().optional(),
  artworkUrl: z.string().optional(),
  author: z.string().nullable().optional(),
  encryptedMediaUrl: z.string().nullable().optional(),
  albumUrl: z.string().nullable().optional(),
  artistUrl: z.string().nullable().optional(),
  albumName: z.string().nullable().optional(),
  artistArtworkUrl: z.string().nullable().optional(),
  previewUrl: z.string().nullable().optional(),
  perma_url: z.string().optional(),
}).openapi("Track");

const AlbumSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  uri: z.string().optional(),
  artworkUrl: z.string().optional(),
  author: z.string().optional(),
  tracks: z.array(TrackSchema).optional(),
  totalSongs: z.number().optional(),
}).openapi("Album");

const ArtistSchema = z.object({
  name: z.string().optional(),
  uri: z.string().optional(),
  artworkUrl: z.string().optional(),
  tracks: z.array(TrackSchema).optional(),
}).openapi("Artist");

const PlaylistSchema = z.object({
  title: z.string().optional(),
  uri: z.string().optional(),
  artworkUrl: z.string().optional(),
  tracks: z.array(TrackSchema).optional(),
  totalSongs: z.number().optional(),
}).openapi("Playlist");

const ErrorSchema = z.object({
  error: z.string(),
  details: z.string().optional(),
}).openapi("Error");

// --- Routes ---

const searchRoute = createRoute({
  method: "get",
  path: "/search",
  request: {
    query: z.object({
      q: z.string().min(1).openapi({ param: { name: "q", in: "query" }, example: "Imagine Dragons" }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            results: z.array(TrackSchema),
          }),
        },
      },
      description: "Search results",
    },
    400: {
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
      description: "Missing query",
    },
    500: {
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
      description: "Server error",
    },
  },
});

app.openapi(searchRoute, async (c) => {
  const query = c.req.query("q");
  if (!query) return c.json({ error: "Missing query" }, 400);
  try {
    const results = await api.search(query);
    return c.json(results);
  } catch (error: any) {
    console.error("Error:", error);
    return c.json({ error: "Failed to fetch results", details: error.message }, 500);
  }
});

const trackRoute = createRoute({
  method: "get",
  path: "/track",
  request: {
    query: z.object({
      url: z.string().optional().openapi({ param: { name: "url", in: "query" }, example: "https://www.jiosaavn.com/song/blue-eyes/HRwebRV,DkM" }),
      id: z.string().optional().openapi({ param: { name: "id", in: "query" }, example: "Hq10iE1w" }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.union([
            z.object({ track: TrackSchema }), // getTrackById returns { track: ... }
            z.any(), // getTrack returns slightly different or same? api implementation says returns { track: ... }
          ]),
        },
      },
      description: "Track details",
    },
    400: { content: { "application/json": { schema: ErrorSchema } }, description: "Bad Request" },
  },
});

app.openapi(trackRoute, async (c) => {
  const url = c.req.query("url");
  const trackID = c.req.query("id");
  if (trackID) {
    const track = await api.getTrackById(trackID);
    return c.json(track);
  }
  if (!url) return c.json({ error: "Missing URL" }, 400);
  const id = api.extract.track(url as string);
  if (!id) return c.json({ error: "Invalid URL" }, 400);
  const track = await api.getTrack(id);
  return c.json(track);
});

const albumRoute = createRoute({
  method: "get",
  path: "/album",
  request: {
    query: z.object({
      url: z.string().optional().openapi({ param: { name: "url", in: "query" } }),
      id: z.string().optional().openapi({ param: { name: "id", in: "query" } }),
    }),
  },
  responses: {
    200: { content: { "application/json": { schema: z.object({ album: AlbumSchema }) } }, description: "Album details" },
    400: { content: { "application/json": { schema: ErrorSchema } }, description: "Bad Request" },
  },
});

app.openapi(albumRoute, async (c) => {
  const url = c.req.query("url");
  const albumID = c.req.query("id");
  if (albumID) {
    const album = await api.getAlbum(albumID);
    return c.json(album);
  }
  if (!url) return c.json({ error: "Missing URL" }, 400);
  const id = api.extract.album(url as string);
  if (!id) return c.json({ error: "Invalid URL" }, 400);
  const album = await api.getAlbum(id);
  return c.json(album);
});

const artistRoute = createRoute({
  method: "get",
  path: "/artist",
  request: {
    query: z.object({
      url: z.string().optional().openapi({ param: { name: "url", in: "query" } }),
      id: z.string().optional().openapi({ param: { name: "id", in: "query" } }),
    }),
  },
  responses: {
    200: { content: { "application/json": { schema: z.object({ artist: ArtistSchema }) } }, description: "Artist details" },
    400: { content: { "application/json": { schema: ErrorSchema } }, description: "Bad Request" },
  },
});

app.openapi(artistRoute, async (c) => {
  const url = c.req.query("url");
  const artistID = c.req.query("id");
  if (artistID) {
    const artist = await api.getArtist(artistID);
    return c.json(artist);
  }
  if (!url) return c.json({ error: "Missing URL" }, 400);
  const id = api.extract.artist(url as string);
  if (!id) return c.json({ error: "Invalid URL" }, 400);
  const artist = await api.getArtist(id);
  return c.json(artist);
});

const playlistRoute = createRoute({
  method: "get",
  path: "/playlist",
  request: {
    query: z.object({
      url: z.string().optional().openapi({ param: { name: "url", in: "query" } }),
      id: z.string().optional().openapi({ param: { name: "id", in: "query" } }),
      limit: z.string().optional().openapi({ param: { name: "limit", in: "query" }, example: "100" }),
    }),
  },
  responses: {
    200: { content: { "application/json": { schema: z.object({ playlist: PlaylistSchema }) } }, description: "Playlist details" },
    400: { content: { "application/json": { schema: ErrorSchema } }, description: "Bad Request" },
  },
});

app.openapi(playlistRoute, async (c) => {
  const url = c.req.query("url");
  const limit = Number(c.req.query("limit")) || 100;
  const playlistID = c.req.query("id");
  if (playlistID) {
    const playlist = await api.getPlaylist(playlistID, limit);
    return c.json(playlist);
  }
  if (!url) return c.json({ error: "Missing URL" }, 400);
  const id = api.extract.playlist(url as string);
  if (!id) return c.json({ error: "Invalid URL" }, 400);
  const playlist = await api.getPlaylist(id, limit);
  return c.json(playlist);
});

const recommendationsRoute = createRoute({
  method: "get",
  path: "/recommendations",
  request: {
    query: z.object({
      id: z.string().min(1).openapi({ param: { name: "id", in: "query" } }),
      limit: z.string().optional().openapi({ param: { name: "limit", in: "query" }, example: "10" }),
    }),
  },
  responses: {
    200: { content: { "application/json": { schema: z.object({ tracks: z.array(TrackSchema) }) } }, description: "Recommendations" },
    400: { content: { "application/json": { schema: ErrorSchema } }, description: "Bad Request" },
  },
});

app.openapi(recommendationsRoute, async (c) => {
  const id = c.req.query("id");
  const limit = Number(c.req.query("limit")) || 10;
  if (!id) return c.json({ error: "Missing " }, 400);
  const recommendations = await api.getRecommendations(id, limit);
  // The API returns { tracks: [...] }
  return c.json(recommendations);
});

const mediaUrlRoute = createRoute({
  method: "get",
  path: "/media-url",
  request: {
    query: z.object({
      url: z.string().optional().openapi({ param: { name: "url", in: "query" } }),
      id: z.string().optional().openapi({ param: { name: "id", in: "query" } }),
    }),
  },
  responses: {
    200: { content: { "application/json": { schema: z.object({ mediaUrl: z.string() }) } }, description: "Decrypted Media URL" },
    400: { content: { "application/json": { schema: ErrorSchema } }, description: "Bad Request" },
    500: { content: { "application/json": { schema: ErrorSchema } }, description: "Server Error" },
  },
});

app.openapi(mediaUrlRoute, async (c) => {
  const url = c.req.query("url");
  const trackID = c.req.query("id");

  if (!url && !trackID) return c.json({ error: "Missing URL or ID" }, 400);

  try {
    let encryptedMediaUrl: string | null = null;

    if (trackID) {
      const track = await api.getTrackById(trackID);
      encryptedMediaUrl = (track as any).track?.encryptedMediaUrl;
    } else {
      const id = api.extract.track(url as string);
      if (!id) return c.json({ error: "Invalid URL" }, 400);
      const track = await api.getTrack(id);
      encryptedMediaUrl = (track as any).track?.encryptedMediaUrl;
    }

    if (!encryptedMediaUrl)
      return c.json({ error: "No encrypted media URL found" }, 404);

    const decryptedUrl = api.decryptMediaUrl(encryptedMediaUrl);
    if (!decryptedUrl) return c.json({ error: "Failed to decrypt media URL" }, 500);

    return c.json({ mediaUrl: decryptedUrl });
  } catch (error: any) {
    console.error("Error:", error);
    return c.json({
      error: "Failed to fetch media URL",
      details: error.message,
    }, 500);
  }
});

// Swagger UI
app.doc("/doc", {
  openapi: "3.0.0",
  info: {
    version: "1.0.0",
    title: "JioSaavn API",
    description: "JioSaavn API by Appujet Modified by RY4N",
  },
});

app.get("/", swaggerUI({ url: "/api/doc" }));

export default handle(app);
