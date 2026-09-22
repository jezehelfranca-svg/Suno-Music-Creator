import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
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
    try {
      const { prompt, genres, timeSig, bpm, key } = req.body;
      const ai = getGeminiClient();

      if (!ai) {
        // Return intelligent rule-based fallback enhancement if no API key
        return res.json({
          enhancedSunoTag: `${genres ? genres.join(', ') : 'Hybrid Style'}, ${bpm || '120'} BPM, ${key || 'A minor'}, dynamic stereo mix, pristine master, emotive vocal delivery, polished Suno V4 clarity`,
          arrangementNotes: [
            "Intro: Establish the harmonic signature with atmospheric pads and lead instrument motifs",
            "Verse 1: Strip down to rhythmic groove and dry lead vocal to build narrative tension",
            "Chorus: Explode into full stereo width with layered harmonies and driving percussion",
            "Bridge: Modulate dynamics or shift rhythmic subdivision before the final drop",
            "Outro: Ambient decay leaving the primary melodic hook echoing into silence"
          ],
          suggestedMetatags: ["[Intro: Atmospheric Build]", "[Verse 1: Low Dynamics]", "[Pre-Chorus: Rising Filter]", "[Chorus: Anthemic Energy]", "[Bridge / Solo]", "[Outro: Fade Out]"],
          customLyrics: `[Intro: Atmospheric]\n(Melodic motifs float in the stereo space)\n\n[Verse 1]\nWhispers through the neon glow\nEchoes where the currents flow\n\n[Chorus]\nRise into the melody\nBreak through our reality!`,
          aiPowered: false
        });
      }

      const systemPrompt = `You are an elite music producer and Suno AI prompting specialist. Your task is to take a musical fusion concept and optimize it specifically for Suno AI v4 and v3.5.
Return JSON with the following schema:
{
  "enhancedSunoTag": "string (<180 chars, comma-separated style tokens with genres, mood, instrumentation, vocal characteristics, BPM, key - highly effective for Suno's Style of Music input box)",
  "arrangementNotes": ["array of 4-5 tactical production & sound design tips for this fusion"],
  "suggestedMetatags": ["array of 6 structural metatags suitable for Suno lyrics"],
  "customLyrics": "a 12-line starter lyrics template formatted with Suno structural metatags [Intro], [Verse 1], [Chorus], [Outro]"
}`;

      const userMessage = `Optimize this Suno fusion prompt:
Genres: ${genres ? genres.join(' + ') : 'Custom'}
Time Signature: ${timeSig || '4/4'}
BPM: ${bpm || '120'}
Key: ${key || 'A minor'}
Original Prompt: "${prompt}"`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `${systemPrompt}\n\n${userMessage}`,
        config: {
          responseMimeType: "application/json",
          temperature: 0.7,
        }
      });

      const responseText = response.text || "{}";
      const parsed = JSON.parse(responseText);
      return res.json({ ...parsed, aiPowered: true });
    } catch (err: unknown) {
      console.error("AI enhance error:", err);
      return res.status(500).json({
        error: "Failed to generate AI enhancement",
        details: err instanceof Error ? err.message : String(err)
      });
    }
  });

  // AI Idea to Prompt: convert natural language ideas to curated genre picks
  app.post("/api/ai/inspire", async (req, res) => {
    try {
      const { idea } = req.body;
      const ai = getGeminiClient();

      if (!ai) {
        return res.json({
          suggestedGenres: ["Neo-Tokyo", "Cyber Soul", "Dream Pop & Shoegaze"],
          timeSig: "4/4",
          minBpm: 90,
          maxBpm: 125,
          conceptTitle: "Neon Meridian",
          vibeDescription: "Moody late-night cinematic fusion inspired by " + (idea || "your concept"),
          aiPowered: false
        });
      }

      const systemPrompt = `You are a music curator matching creative song concepts to genres.
You must recommend 2 or 3 distinct music genres (choose from standard genres or coined styles like Neo-Tokyo, Cyberpunk, Shoegaze, Math Rock, Synthwave, City Pop, Vaporwave, etc.) that best embody the user's vision.
Return JSON with this schema:
{
  "suggestedGenres": ["Genre 1", "Genre 2", "Genre 3 (optional)"],
  "timeSig": "4/4 or 3/4 or 7/8 or 6/8",
  "minBpm": number (40-220),
  "maxBpm": number (minBpm to 240),
  "conceptTitle": "Evocative 2-word title",
  "vibeDescription": "1-2 sentence description of this hybrid sound"
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `${systemPrompt}\n\nConcept Idea: "${idea}"`,
        config: {
          responseMimeType: "application/json",
          temperature: 0.8
        }
      });

      const responseText = response.text || "{}";
      const parsed = JSON.parse(responseText);
      return res.json({ ...parsed, aiPowered: true });
    } catch (err: unknown) {
      console.error("AI inspire error:", err);
      return res.status(500).json({
        error: "Failed to generate AI inspiration",
        details: err instanceof Error ? err.message : String(err)
      });
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
