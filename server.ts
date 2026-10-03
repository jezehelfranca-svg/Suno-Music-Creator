import express from "express";
import { designGroove } from "./src/utils/grooveDesign.js";
import { buildLyricBlueprint, clampStyle, deriveExcludeStyles, findBannedWords } from "./src/utils/sunoBlueprint.js";
import path from "path";
import fs from "fs";
import JSZip from "jszip";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Package the same extension files produced by scripts/build-extension.js.
// A runtime fallback must never replace the current extension with the old v1 script.
async function createExtensionZipBuffer(): Promise<Buffer> {
  const zip = new JSZip();
  const extensionDir = path.join(process.cwd(), "extension");
  const files = [
    "manifest.json", "content.js", "content.css", "popup.html", "popup.js",
    "bridge.js", "background.js", "README.md",
    "icons/icon16.png", "icons/icon48.png", "icons/icon128.png"
  ];
  for (const file of files) {
    zip.file(file, fs.readFileSync(path.join(extensionDir, file)));
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

/**
 * Resilient Gemini content generation with multi-model fallback and retry.
 * Handles 503 (model overloaded / high demand) and 429 gracefully.
 */
async function callGeminiWithResilience(
  contents: string,
  config: Record<string, unknown>
): Promise<string> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error("NO_API_KEY");
  }

  // Model cascade: primary 3.8-flash, then 3.1-flash-lite, then gemini-flash-latest
  const candidateModels = ["gemini-3.8-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
  let lastError: unknown = null;

  for (const model of candidateModels) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents,
          config,
        });

        const text = response.text;
        if (text && text.trim().length > 0) {
          return text;
        }
      } catch (err: unknown) {
        lastError = err;
        const errMsg = err instanceof Error ? err.message : String(err);
        const isTemporary =
          errMsg.includes("503") ||
          errMsg.includes("UNAVAILABLE") ||
          errMsg.includes("high demand") ||
          errMsg.includes("429") ||
          errMsg.includes("RESOURCE_EXHAUSTED");

        console.warn(`[Gemini] Model ${model} (attempt ${attempt + 1}) returned:`, errMsg);

        if (isTemporary && attempt === 0) {
          // Brief backoff before retry
          await new Promise((r) => setTimeout(r, 800));
        } else {
          // Move to next candidate model
          break;
        }
      }
    }
  }

  throw lastError || new Error("All Gemini models unavailable");
}

/**
 * Intelligent rule-based heuristic for Song Idea -> Fusion Matcher
 * Used when no API key is provided or during high API demand (503).
 */
function generateHeuristicInspiration(idea: string) {
  const text = (idea || "").toLowerCase();

  let genres: string[] = ["Neo-Tokyo", "Cyber Soul", "Dream Pop & Shoegaze"];
  let timeSig = "4/4";
  let minBpm = 95;
  let maxBpm = 130;
  let title = "Tin Roof Meridian";
  let vibe = `Atmospheric cinematic fusion inspired by "${idea || 'your concept'}".`;

  if (text.includes("cyber") || text.includes("tokyo") || text.includes("neon") || text.includes("rain") || text.includes("motorcycle")) {
    genres = ["Neo-Tokyo", "Darksynth", "Cyber Soul"];
    minBpm = 110;
    maxBpm = 135;
    title = "Chrome Nightdrive";
    vibe = "Driving analog synths, dark pulsing basslines, and rain-soaked dystopian atmosphere.";
  } else if (text.includes("metal") || text.includes("guitar") || text.includes("rock") || text.includes("heavy") || text.includes("screaming")) {
    genres = ["Djent", "Alternative Rock / Indie II", "Industrial Rock / Metal"];
    minBpm = 130;
    maxBpm = 165;
    title = "Kinetic Surge";
    vibe = "Down-tuned polyrhythmic guitar riffs paired with relentless mechanical grooves.";
  } else if (text.includes("chill") || text.includes("lo-fi") || text.includes("relax") || text.includes("coffee") || text.includes("sleep")) {
    genres = ["Indietronica & Chillwave", "Neo / Nu Soul", "Ambient Breaks & Illbient"];
    minBpm = 75;
    maxBpm = 92;
    title = "Velvet Drift";
    vibe = "Warm vinyl crackle, detuned electric keys, and dusty laid-back syncopated drum breaks.";
  } else if (text.includes("celtic") || text.includes("ancient") || text.includes("folk") || text.includes("warrior") || text.includes("tribal")) {
    genres = ["American & British Folk Revival", "Dark Ambient / Dark Industrial", "Trip Hop"];
    timeSig = "6/8";
    minBpm = 85;
    maxBpm = 120;
    title = "Ethereal Rite";
    vibe = "Haunting acoustic instrumentation laced with heavy low-end sub frequencies and ceremonial rhythms.";
  } else if (text.includes("anime") || text.includes("j-pop") || text.includes("japanese") || text.includes("city pop")) {
    genres = ["Asian Pop", "Math Rock & MathCORE", "Electropop"];
    minBpm = 145;
    maxBpm = 175;
    title = "Prism Rush";
    vibe = "High-energy sparkling melodies, complex syncopated basslines, and euphoric vocal peaks.";
  } else if (text.includes("trap") || text.includes("hip hop") || text.includes("rap") || text.includes("808") || text.includes("club")) {
    genres = ["Urban Soul / Pop (Nu R&B I)", "Trap & Boom Bap", "Nu Disco & Funktronnica"];
    minBpm = 120;
    maxBpm = 140;
    title = "Subterranean Bounce";
    vibe = "Rattling hi-hats, cavernous sub bass, and glossy soul hooks.";
  } else if (text.includes("jazz") || text.includes("coffee") || text.includes("smooth")) {
    genres = ["Nu Jazz / Electro Jazz", "Cool & West Coast Jazz", "Bossa Nova"];
    timeSig = "4/4";
    minBpm = 88;
    maxBpm = 115;
    title = "Midnight Lounge";
    vibe = "Sophisticated modal chord extensions, brushed acoustic drums, and velvet Rhodes melodies.";
  }

  return {
    suggestedGenres: genres,
    timeSig,
    minBpm,
    maxBpm,
    conceptTitle: title,
    vibeDescription: vibe,
    aiPowered: false,
    notice: "Generated with our built-in intelligent music engine."
  };
}

/**
 * Rule-based Suno package in GMIV+P+Era order, used without an API key or
 * when every model is unavailable.
 */
function generateHeuristicEnhancement(prompt?: string, genres?: string[], timeSig?: string, bpm?: number, key?: string, instruments?: string[]) {
  const genreList = genres && genres.length > 0 ? genres.join(", ") : "Cinematic Hybrid";
  const primaryGenre = genres && genres.length > 0 ? genres[0] : "Hybrid Sound";
  const groove = designGroove({ genres, instruments, timeSig, bpm });
  const style = clampStyle([
    genreList,
    `${bpm || '120'} BPM`, timeSig || '4/4', key || 'A minor',
    ...(instruments || []),
    groove.description,
    groove.production
  ].join(', '));

  return {
    enhancedSunoTag: style,
    excludeStyles: deriveExcludeStyles({ genres, instruments, style: `${style} ${prompt || ''}` }),
    arrangementNotes: [
      `Groove: ${groove.description}`,
      `Sound design: ${groove.production}`,
      `Intro: Introduce one ${primaryGenre} motif before the rhythm enters`,
      "Later section: Change note length or leave a longer rest before the returning motif",
      "Outro: Let the final phrase resolve through the seed's existing instruments"
    ],
    suggestedMetatags: [
      `[Intro - ${groove.anchor} alone]`,
      `[Verse 1 - ${groove.pulse} enters]`,
      "[Pre-Chorus - Strip Back]",
      "[Chorus - Full Band]",
      "[Instrumental Bridge]",
      "[Outro - Fade]"
    ],
    customLyrics: buildLyricBlueprint({ anchor: groove.anchor, pulse: groove.pulse }),
    lyricWarnings: [],
    aiPowered: false,
    notice: "Generated with our rule-based production upgrade engine."
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", hasAi: Boolean(process.env.GEMINI_API_KEY) });
  });

  // AI Prompt Enhancement for Suno V4
  app.post("/api/ai/enhance", async (req, res) => {
    const { prompt, genres, timeSig, bpm, key, instruments } = req.body;

    try {
      const systemPrompt = `You are an expert music producer and Suno prompt engineer working from the user's seed. Produce three deliverables.

1. enhancedSunoTag, the Style of Music prompt, strictly under 1,000 characters, written in this order:
- G (Genre & Subgenres): the seed's genres as specific micro-genres, never a broad label alone.
- M (Mood & Energy): emotional tone, scene and energy level.
- I (Instrumentation & Tempo): exact BPM, meter and key, the named instruments with their playing roles, and one dynamic choice.
- V (Vocals): timbre, range, processing, delivery, and where doubling happens.
- P+Era (Production & Time Period): mix characteristics anchored to a decade or studio era.
Inside I, design the groove from the exact genres, named instruments, meter, and tempo in the seed. Explain which existing low or rhythmic part anchors the phrase, how it interlocks with drums or percussion if present, where notes shorten or sustain, and which deliberate rests make room for other parts. Use offbeat 16ths, ghost notes, glides, call-and-response, or separate clean sub and textured mid layers only when they fit this seed. Do not apply a house bass pattern to rock, jazz, folk, or ambient seeds by default. Do not introduce an 808, synth, bass guitar, or mode that the seed does not imply. Keep true sub centered and upper harmonic grit wider only when an electronic sub layer is actually present. Respect odd meters; do not flatten them into 4/4. Preserve the user's genre and instrument names. Never name a real artist, band or producer, and avoid vague praise adjectives.

2. excludeStyles: 3 to 6 comma-separated elements that oppose this sound, drawn from opposing genres, opposing textures and vocal artifacts (for example: trap hi-hats, autotune, distorted guitar, lo-fi hiss, acoustic folk). Never exclude anything the style prompt names.

3. customLyrics: a complete lyric with [Intro], [Verse 1], [Pre-Chorus], [Chorus], [Verse 2], [Instrumental Bridge], [Final Chorus] and [Outro - Fade], plus functional tags such as [Bassline Drop] where the arrangement calls for them.
- Never use these words in any form: neon, shadows, static, whisper, ignite, heartbeat, overdrive, echo, digital, symphony, pulse.
- No AABB couplets. Mix line lengths, prefer slant rhymes, and build every section from concrete, physical nouns (objects, places, times, prices).
- Verse 2 moves time, stakes or camera forward; the final chorus changes one detail from the first chorus.
- Put every arrangement direction in square brackets. Never put directions in parentheses, because Suno sings parenthesized text.

Return JSON with the following schema:
{
  "enhancedSunoTag": "string (GMIV+P+Era Style of Music prompt, under 1000 characters)",
  "excludeStyles": "string (3-6 comma-separated exclusions)",
  "arrangementNotes": ["array of 4-5 tactical production & sound design tips for this fusion"],
  "suggestedMetatags": ["array of 6 bracketed functional metatags for this arrangement"],
  "customLyrics": "string (the full lyric with bracketed metatags, using \\n line breaks)"
}`;

      const userMessage = `Optimize this Suno fusion prompt:
Genres: ${genres ? genres.join(' + ') : 'Custom'}
Time Signature: ${timeSig || '4/4'}
BPM: ${bpm || '120'}
Key: ${key || 'A minor'}
Instruments: ${Array.isArray(instruments) && instruments.length ? instruments.join(', ') : 'unspecified; infer sparingly from genres'}
Original Prompt: "${prompt || ''}"`;

      const responseText = await callGeminiWithResilience(
        `${systemPrompt}\n\n${userMessage}`,
        {
          responseMimeType: "application/json",
          temperature: 0.7,
        }
      );

      const parsed = JSON.parse(responseText);
      const style = clampStyle(String(parsed.enhancedSunoTag || ""));
      return res.json({
        ...parsed,
        enhancedSunoTag: style,
        excludeStyles: String(parsed.excludeStyles || "").trim() || deriveExcludeStyles({ genres, instruments, style }),
        lyricWarnings: findBannedWords(parsed.customLyrics),
        aiPowered: true
      });
    } catch (err: unknown) {
      console.warn("AI enhance falling back to heuristic engine due to:", err instanceof Error ? err.message : String(err));
      // Seamless graceful fallback: Never break user experience due to API spikes
      const fallback = generateHeuristicEnhancement(prompt, genres, timeSig, bpm, key, instruments);
      return res.json(fallback);
    }
  });

  // AI Idea to Prompt: convert natural language ideas to curated genre picks
  app.post("/api/ai/inspire", async (req, res) => {
    const { idea } = req.body;

    try {
      const systemPrompt = `You are a music curator matching creative song concepts to genres.
You must recommend 2 or 3 distinct music genres (choose from standard genres or coined styles like Neo-Tokyo, Cyberpunk, Shoegaze, Math Rock, Synthwave, City Pop, Vaporwave, Djent, etc.) that best embody the user's vision.
Return JSON with this schema:
{
  "suggestedGenres": ["Genre 1", "Genre 2", "Genre 3 (optional)"],
  "timeSig": "4/4 or 3/4 or 7/8 or 6/8",
  "minBpm": number (40-220),
  "maxBpm": number (minBpm to 240),
  "conceptTitle": "Evocative 2-word title",
  "vibeDescription": "1-2 sentence description of this hybrid sound"
}`;

      const responseText = await callGeminiWithResilience(
        `${systemPrompt}\n\nConcept Idea: "${idea || ''}"`,
        {
          responseMimeType: "application/json",
          temperature: 0.8,
        }
      );

      const parsed = JSON.parse(responseText);
      return res.json({ ...parsed, aiPowered: true });
    } catch (err: unknown) {
      console.warn("AI inspire falling back to heuristic engine due to:", err instanceof Error ? err.message : String(err));
      // Seamless graceful fallback: Never break user experience due to API spikes
      const fallback = generateHeuristicInspiration(idea);
      return res.json(fallback);
    }
  });

  // Direct Download Endpoint for Suno Chrome & Edge Extension ZIP
  app.get("/api/download-extension-zip", async (_req, res) => {
    try {
      const zipPath = path.join(process.cwd(), "public", "suno-fusion-extension.zip");
      if (fs.existsSync(zipPath)) {
        return res.download(zipPath, "suno-fusion-extension.zip");
      }
      const buffer = await createExtensionZipBuffer();
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", 'attachment; filename="suno-fusion-extension.zip"');
      res.setHeader("Content-Length", buffer.length);
      return res.send(buffer);
    } catch (err) {
      console.error("Failed to generate extension zip:", err);
      return res.status(500).json({ error: "Failed to build extension zip" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
