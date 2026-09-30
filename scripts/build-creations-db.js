/**
 * build-creations-db.js
 * Ingests all created Suno prompts from:
 *   1. D:/Applications/Fictional-Bands (1,391+ band profiles)
 *   2. D:/Applications/Genre-Fusion-Lab/output (generated fusions)
 *   3. D:/Applications/Genre-Fusion-Lab/output/50-suno-prompts.md
 *
 * Generates:
 *   - src/data/creations.json & metadata.json
 *   - extension/data/creations.json & metadata.json
 *   - extension/data/creations.js (SUNO_CREATIONS_DATABASE & SUNO_CREATIONS_METADATA)
 */

import fs from 'fs';
import path from 'path';

function clean(str) {
  if (!str) return '';
  return str.replace(/[*_`#]/g, '').trim();
}

function extractBpm(text) {
  const rangeMatch = text.match(/(\d{2,3})\s*(?:-|to)\s*(\d{2,3})\s*BPM/i);
  if (rangeMatch) {
    const min = parseInt(rangeMatch[1], 10);
    const max = parseInt(rangeMatch[2], 10);
    return { minBpm: min, maxBpm: max, bpm: Math.round((min + max) / 2) };
  }
  const singleMatch = text.match(/(\d{2,3})\s*BPM/i);
  if (singleMatch) {
    const b = parseInt(singleMatch[1], 10);
    return { minBpm: b, maxBpm: b, bpm: b };
  }
  return { minBpm: 90, maxBpm: 125, bpm: 110 };
}

function extractTimeSig(text) {
  const match = text.match(/\b([345679]|12)\/([48])\b/);
  return match ? match[0] : '4/4';
}

function formatDateTime(date) {
  if (!date || isNaN(date.getTime())) date = new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${month} ${day}, ${year} ${hours}:${minutes} ${ampm}`;
}

function formatShortDate(date) {
  if (!date || isNaN(date.getTime())) date = new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const day = date.getDate();
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${month} ${day} ${hours}:${minutes} ${ampm}`;
}

function categorizeCreation(genreName, ingredients = [], prompt = '') {
  const combined = (genreName + ' ' + ingredients.join(' ') + ' ' + prompt).toLowerCase();
  if (combined.includes('metal') || combined.includes('rock') || combined.includes('punk') || combined.includes('grunge') || combined.includes('djent')) return 'Rock & Metal';
  if (combined.includes('electronic') || combined.includes('dance') || combined.includes('techno') || combined.includes('house') || combined.includes('trance') || combined.includes('edm') || combined.includes('synthwave') || combined.includes('gabber') || combined.includes('acid') || combined.includes('breakbeat')) return 'Electronic & Dance';
  if (combined.includes('hip-hop') || combined.includes('rap') || combined.includes('drill') || combined.includes('trap') || combined.includes('boom bap') || combined.includes('phonk') || combined.includes('gqom')) return 'Hip-Hop & Urban';
  if (combined.includes('jazz') || combined.includes('blues') || combined.includes('swing') || combined.includes('bop') || combined.includes('soul') || combined.includes('r&b') || combined.includes('funk')) return 'Jazz & Blues';
  if (combined.includes('pop') || combined.includes('k-pop') || combined.includes('j-pop') || combined.includes('vocal') || combined.includes('ballad') || combined.includes('choral') || combined.includes('opera') || combined.includes('choir')) return 'Pop & Vocal';
  if (combined.includes('folk') || combined.includes('celtic') || combined.includes('flamenco') || combined.includes('tango') || combined.includes('cumbia') || combined.includes('salsa') || combined.includes('gnawa') || combined.includes('traditional') || combined.includes('african') || combined.includes('asian') || combined.includes('latin') || combined.includes('indian')) return 'Folk & World';
  if (combined.includes('ambient') || combined.includes('drone') || combined.includes('cinematic') || combined.includes('atmospheric') || combined.includes('soundscape') || combined.includes('classical') || combined.includes('baroque') || combined.includes('orchestral') || combined.includes('chamber')) return 'Ambient & Cinematic';
  return 'Coined Fusion';
}

function parseFile(content, fileName, fallbackMeta = null, fileDate = null) {
  // 1. Suno Style Prompt
  let prompt = '';
  const pMatch1 = content.match(/#+\s*Suno\s+Style\s+Prompt\s*\n+([^\n#]+)/i);
  const pMatch2 = content.match(/Suno\s+Style\s+Prompt[:\s]*\n+([^\n]+)/i);
  if (pMatch1) prompt = clean(pMatch1[1]);
  else if (pMatch2) prompt = clean(pMatch2[1]);

  if (!prompt || prompt.length < 20) return null;

  // 2. Band Name
  let band = fallbackMeta?.bandName || '';
  const bandMatch = content.match(/Fictional Band(?:\s*Name)?[:\s*]*([^\n]+)/i);
  if (bandMatch) band = clean(bandMatch[1]);
  if (!band) band = fileName.replace(/_202\d.*$/, '').replace(/\.md$/, '').trim();

  // 3. Genre Name
  let genre = fallbackMeta?.genreName || '';
  const gMatch1 = content.match(/^#\s+([^\n]+)/m);
  const gMatch2 = content.match(/(?:^|\n)Genre:\s*([^,\n]+)/i);
  if (gMatch1 && !gMatch1[1].toLowerCase().includes('suno') && !gMatch1[1].toLowerCase().includes('track') && !gMatch1[1].toLowerCase().includes('unique')) {
    genre = clean(gMatch1[1]);
  } else if (gMatch2) {
    genre = clean(gMatch2[1]);
  }
  if (!genre) genre = 'Fusion';

  // 4. Ingredients
  let ingredients = fallbackMeta?.ingredients || [];
  const ingMatch = content.match(/(?:^|\n)(?:\*\*|)?Ingredients:?(?:\*\*|)?\s*([^\n]+)/i);
  if (ingMatch && (!ingredients || ingredients.length === 0)) {
    ingredients = clean(ingMatch[1]).split('+').map(s => s.trim()).filter(Boolean);
  }

  // 5. Debut Track / Song Title
  let track = '';
  const tMatch1 = content.match(/Debut Track:\s*([^,\n]+)/i);
  const tMatch2 = content.match(/Track 1:\s*([^\n]+)/i);
  if (tMatch1) track = clean(tMatch1[1]);
  else if (tMatch2) track = clean(tMatch2[1]);
  if (!track) track = band;

  // 6. Vibe / Mood
  let vibe = '';
  const vMatch = content.match(/(?:Descriptive Mood or Vibe|Mood & Vibe|Vibe)[:\s*]*([^\n]+)/i);
  if (vMatch) vibe = clean(vMatch[1]);

  // 7. Instruments
  let instruments = [];
  const instMatch = content.match(/(?:Typical Instruments Used|Typical Instruments|Central Instruments)[:\s*]*([^\n]+)/i);
  if (instMatch) {
    instruments = clean(instMatch[1]).split(/[,;]/).map(s => s.trim()).filter(Boolean);
  }

  // 8. For fans of
  let forFansOf = '';
  const fansMatch = content.match(/(?:For Fans Of)[:\s*]*([^\n]+)/i);
  if (fansMatch) forFansOf = clean(fansMatch[1]);

  // 9. Tempo & Time Signature
  const { minBpm, maxBpm, bpm } = extractBpm(content);
  const timeSig = extractTimeSig(content);

  // 10. Lyrics Scaffold
  let lyricSnippet = '';
  const quoteMatch = content.match(/"([^"\n]{10,120})"/);
  if (quoteMatch) {
    lyricSnippet = '[Intro]\n[Verse 1]\n' + quoteMatch[1] + '\n\n[Pre-Chorus]\nEchoes rising from the deep\n\n[Chorus]\n' + track + '\n\n[Drop]\n\n[Outro]\n[Fade Out]';
  } else {
    lyricSnippet = '[Intro]\n[Verse 1]\n' + (vibe ? vibe.slice(0, 80) : 'Voices drift through the silence') + '\n\n[Pre-Chorus]\nCounting down every heartbeat\n\n[Chorus]\n' + track + '\n\n[Drop]\n\n[Outro]\n[Fade Out]';
  }

  const category = categorizeCreation(genre, ingredients, prompt);
  const slug = band.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const dateObj = (fileDate && !isNaN(fileDate.getTime())) ? fileDate : new Date();
  const ageMs = Date.now() - dateObj.getTime();
  const isNew = ageMs <= 7 * 24 * 60 * 60 * 1000; // Flag as New if created within last 7 days

  return {
    id: slug,
    title: track,
    bandName: band,
    genreName: genre,
    category: category,
    ingredients: ingredients,
    sunoStyleTag: prompt,
    fullPrompt: prompt,
    vibe: vibe,
    instruments: instruments,
    forFansOf: forFansOf,
    bpm: bpm,
    minBpm: minBpm,
    maxBpm: maxBpm,
    timeSig: timeSig,
    lyricSnippet: lyricSnippet,
    excludeStyles: 'screaming, harsh distortion, muddy bass, generic pop EDM',
    vocalGender: 'Female',
    weirdness: 50,
    styleInfluence: 85,
    variety: 'High',
    duration: '3:00',
    createdAt: dateObj.toISOString(),
    formattedDate: formatDateTime(dateObj),
    shortDate: formatShortDate(dateObj),
    isNew: isNew
  };
}

export function buildCreationsDatabase() {
  const fbDir = 'D:/Applications/Fictional-Bands';
  const gflDir = 'D:/Applications/Genre-Fusion-Lab/output';
  const database = new Map();

  console.log('?? Ingesting created Suno prompts into database...');

  // 1. Process Fictional-Bands
  if (fs.existsSync(fbDir)) {
    const files = fs.readdirSync(fbDir).filter(f => {
      try {
        return fs.statSync(path.join(fbDir, f)).isFile() && !f.startsWith('.') && !f.endsWith('.py');
      } catch (e) { return false; }
    });
    for (const f of files) {
      try {
        const fullPath = path.join(fbDir, f);
        const stat = fs.statSync(fullPath);
        const mtime = stat.mtime;
        const content = fs.readFileSync(fullPath, 'utf-8');
        const item = parseFile(content, f, null, mtime);
        if (item && item.sunoStyleTag) {
          database.set(item.id, item);
        }
      } catch (e) {}
    }
    console.log(`  ? Ingested ${database.size} band profiles from Fictional-Bands`);
  }

  // 2. Process Genre-Fusion-Lab outputs (catch any not in FB)
  if (fs.existsSync(gflDir)) {
    const files = fs.readdirSync(gflDir).filter(f => f.endsWith('.md'));
    let gflAdded = 0;
    for (const f of files) {
      if (f === '50-suno-prompts.md') continue;
      try {
        const fullPath = path.join(gflDir, f);
        const stat = fs.statSync(fullPath);
        let mtime = stat.mtime;
        const metaFile = path.join(gflDir, f.replace(/\.md$/, '.meta.json'));
        let meta = null;
        if (fs.existsSync(metaFile)) {
          try {
            meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
            if (meta.timestamp) {
              const parsedMetaDate = new Date(meta.timestamp);
              if (!isNaN(parsedMetaDate.getTime())) mtime = parsedMetaDate;
            }
          } catch (e) {}
        }
        const isoMatch = f.match(/_(\d{4}-\d{2}-\d{2}T\d{2}[-_]\d{2}[-_]\d{2}(?:[-_]\d{3})?Z?)/);
        if (isoMatch) {
          try {
            const parsed = new Date(isoMatch[1].replace(/[-_](?=\d{2}[-_]\d{2})/g, ':'));
            if (!isNaN(parsed.getTime())) mtime = parsed;
          } catch (e) {}
        }
        const content = fs.readFileSync(fullPath, 'utf-8');
        const item = parseFile(content, f, meta, mtime);
        if (item && item.sunoStyleTag && !database.has(item.id)) {
          database.set(item.id, item);
          gflAdded++;
        }
      } catch (e) {}
    }
    if (gflAdded > 0) {
      console.log(`  ? Ingested ${gflAdded} additional fusions from Genre-Fusion-Lab output`);
    }
  }

  // 3. Process 50-suno-prompts.md
  const fiftyPath = path.join(gflDir, '50-suno-prompts.md');
  if (fs.existsSync(fiftyPath)) {
    const content = fs.readFileSync(fiftyPath, 'utf-8');
    const fiftyStat = fs.statSync(fiftyPath);
    const fiftyDate = fiftyStat.mtime;
    const lines = content.split('\n');
    let fiftyAdded = 0;
    for (const line of lines) {
      const parts = line.split('|').map(s => s.trim()).filter(Boolean);
      if (parts.length >= 3 && /^\d+$/.test(parts[0])) {
        const name = parts[1];
        const prompt = parts[2];
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        if (!database.has(slug)) {
          const { minBpm, maxBpm, bpm } = extractBpm(prompt);
          const timeSig = extractTimeSig(prompt);
          const cat = categorizeCreation(name, [], prompt);
          database.set(slug, {
            id: slug,
            title: name,
            bandName: name,
            genreName: name,
            category: cat,
            ingredients: [],
            sunoStyleTag: prompt,
            fullPrompt: prompt,
            vibe: 'High-energy eclectic genre collision',
            instruments: [],
            bpm, minBpm, maxBpm, timeSig,
            lyricSnippet: '[Intro]\n[Verse 1]\nElectric currents pulse in the dark\n\n[Chorus]\n' + name + '\n\n[Outro]\n[Fade Out]',
            excludeStyles: 'screaming, harsh distortion, muddy bass, generic pop EDM',
            vocalGender: 'Female',
            weirdness: 55,
            styleInfluence: 85,
            variety: 'High',
            duration: '3:00',
            createdAt: fiftyDate.toISOString(),
            formattedDate: formatDateTime(fiftyDate),
            shortDate: formatShortDate(fiftyDate),
            isNew: (Date.now() - fiftyDate.getTime()) <= 7 * 24 * 60 * 60 * 1000
          });
          fiftyAdded++;
        }
      }
    }
    console.log(`  ? Ingested ${fiftyAdded} unique prompts from 50-suno-prompts.md`);
  }

  // Sort: Newest entries first (createdAt descending), secondary by bandName
  const creationsArray = Array.from(database.values()).sort((a, b) => {
    const timeA = new Date(a.createdAt || 0).getTime();
    const timeB = new Date(b.createdAt || 0).getTime();
    if (timeB !== timeA) return timeB - timeA;
    return a.bandName.localeCompare(b.bandName);
  });

  const syncDate = new Date();
  const newCount = creationsArray.filter(c => c.isNew).length;
  const metadata = {
    lastUpdated: syncDate.toISOString(),
    formattedDate: formatDateTime(syncDate),
    totalCount: creationsArray.length,
    newEntriesCount: newCount
  };

  console.log(`? Total Verified Creations Ingested: ${creationsArray.length} (${newCount} new/recent)`);

  // Target output files
  const srcDataDir = path.resolve('src/data');
  const extDataDir = path.resolve('extension/data');
  const pubDataDir = path.resolve('public/data');
  if (!fs.existsSync(srcDataDir)) fs.mkdirSync(srcDataDir, { recursive: true });
  if (!fs.existsSync(extDataDir)) fs.mkdirSync(extDataDir, { recursive: true });
  if (!fs.existsSync(pubDataDir)) fs.mkdirSync(pubDataDir, { recursive: true });

  const jsonContent = JSON.stringify(creationsArray, null, 2);
  fs.writeFileSync(path.join(srcDataDir, 'creations.json'), jsonContent);
  fs.writeFileSync(path.join(extDataDir, 'creations.json'), jsonContent);
  fs.writeFileSync(path.join(pubDataDir, 'creations.json'), jsonContent);

  const metaContent = JSON.stringify(metadata, null, 2);
  fs.writeFileSync(path.join(srcDataDir, 'metadata.json'), metaContent);
  fs.writeFileSync(path.join(extDataDir, 'metadata.json'), metaContent);
  fs.writeFileSync(path.join(pubDataDir, 'metadata.json'), metaContent);

  const jsContent = '// Suno Creations Database: ' + creationsArray.length + ' AI Band & Fusion Prompts (Last Synced: ' + metadata.formattedDate + ')\n' +
    '(function(root) {\n' +
    '  var data = ' + JSON.stringify(creationsArray) + ';\n' +
    '  var meta = ' + JSON.stringify(metadata) + ';\n' +
    '  root.SUNO_CREATIONS_DATABASE = data;\n' +
    '  root.SUNO_CREATIONS_METADATA = meta;\n' +
    '})(typeof window !== "undefined" ? window : globalThis);\n';
  fs.writeFileSync(path.join(extDataDir, 'creations.js'), jsContent);
  fs.writeFileSync(path.join(pubDataDir, 'creations.js'), jsContent);

  console.log(`? Wrote ${path.join(srcDataDir, 'creations.json')} (${(jsonContent.length / 1024).toFixed(1)} KB)`);
  console.log(`? Wrote ${path.join(extDataDir, 'creations.json')} (${(jsonContent.length / 1024).toFixed(1)} KB)`);
  console.log(`? Wrote ${path.join(extDataDir, 'creations.js')} (${(jsContent.length / 1024).toFixed(1)} KB)`);
  console.log(`? Metadata: Synced at ${metadata.formattedDate}`);

  return creationsArray;
}

buildCreationsDatabase();
