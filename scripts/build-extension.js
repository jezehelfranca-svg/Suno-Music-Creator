import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

async function build() {
  const dataDir = path.resolve('extension/data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  // 1. Ensure genres.json & styleLibrary.json exist and generate extension/data files
  const genresData = JSON.parse(fs.readFileSync(path.resolve('src/data/genres.json'), 'utf-8'));
  const libraryData = JSON.parse(fs.readFileSync(path.resolve('src/data/styleLibrary.json'), 'utf-8'));

  fs.writeFileSync(path.join(dataDir, 'genres.json'), JSON.stringify(genresData, null, 2));
  fs.writeFileSync(path.join(dataDir, 'library.json'), JSON.stringify(libraryData, null, 2));

  const genresJs = '// Suno Taxonomy Data: 374 Genres (98 Coined)\n' +
    '(function(root) {\n' +
    '  var data = ' + JSON.stringify(genresData) + ';\n' +
    '  data.totalCount = data.baseGenres.length;\n' +
    '  data.coinedCount = data.coinedGenres.length;\n' +
    '  data.pairsCount = Math.round(data.totalCount * (data.totalCount - 1) / 2);\n' +
    '  data.combosCount = Math.round(data.totalCount * (data.totalCount - 1) * (data.totalCount - 2) / 6);\n' +
    '  var coinedMap = {};\n' +
    '  data.coinedGenres.forEach(function(g) { coinedMap[g] = true; });\n' +
    '  data.isCoined = function(name) { return !!coinedMap[name]; };\n' +
    '  root.SUNO_TAXONOMY = data;\n' +
    '})(typeof window !== "undefined" ? window : globalThis);\n';
  fs.writeFileSync(path.join(dataDir, 'genres.js'), genresJs);

  const libraryJs = '// Suno Curated Library: 839 Prompts (42 Sets)\n' +
    '(function(root) {\n' +
    '  var sets = ' + JSON.stringify(libraryData) + ';\n' +
    '  root.SUNO_CURATED_LIBRARY = sets;\n' +
    '})(typeof window !== "undefined" ? window : globalThis);\n';
  fs.writeFileSync(path.join(dataDir, 'library.js'), libraryJs);

  // 1b. Ensure creations.json & creations.js exist
  const creationsSrc = path.resolve('src/data/creations.json');
  let creationsCount = 0;
  if (fs.existsSync(creationsSrc)) {
    const creationsData = JSON.parse(fs.readFileSync(creationsSrc, 'utf-8'));
    creationsCount = creationsData.length;
    fs.writeFileSync(path.join(dataDir, 'creations.json'), JSON.stringify(creationsData));
    const creationsJs = '// Suno Creations Database: ' + creationsData.length + ' AI Band & Fusion Prompts\n' +
      '(function(root) {\n' +
      '  var data = ' + JSON.stringify(creationsData) + ';\n' +
      '  root.SUNO_CREATIONS_DATABASE = data;\n' +
      '})(typeof window !== "undefined" ? window : globalThis);\n';
    fs.writeFileSync(path.join(dataDir, 'creations.js'), creationsJs);
  }

  // 1c. Ensure instruments.json & instruments.js exist
  const instSrc = path.resolve('extension/data/instruments.json');
  let instrumentsCount = 1561;
  if (!fs.existsSync(instSrc)) {
    execSync('npx tsx scripts/build-instruments-data.ts', { stdio: 'inherit' });
  }
  if (fs.existsSync(instSrc)) {
    const instData = JSON.parse(fs.readFileSync(instSrc, 'utf-8'));
    instrumentsCount = (instData.catalog && instData.catalog.length) || 1561;
    const pubDataDir = path.resolve('public/data');
    if (!fs.existsSync(pubDataDir)) fs.mkdirSync(pubDataDir, { recursive: true });
    fs.copyFileSync(instSrc, path.join(pubDataDir, 'instruments.json'));
    const instJsSrc = path.resolve('extension/data/instruments.js');
    if (fs.existsSync(instJsSrc)) {
      fs.copyFileSync(instJsSrc, path.join(pubDataDir, 'instruments.js'));
    }
  }

  // 2. Read all files from extension directory and create ZIP
  const extensionDir = path.resolve('extension');
  const publicDir = path.resolve('public');
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
  const zipPath = path.join(publicDir, 'suno-fusion-extension.zip');

  let zipped = false;
  try {
    const JSZipModule = await import('jszip');
    const JSZip = JSZipModule.default || JSZipModule;
    const zip = new JSZip();

    function addDirToZip(currentDir, currentZip) {
      const items = fs.readdirSync(currentDir);
      for (const item of items) {
        const fullPath = path.join(currentDir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          const subFolder = currentZip.folder(item);
          addDirToZip(fullPath, subFolder);
        } else {
          const content = fs.readFileSync(fullPath);
          currentZip.file(item, content);
        }
      }
    }

    addDirToZip(extensionDir, zip);
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    fs.writeFileSync(zipPath, buffer);
    zipped = true;
  } catch (err) {
    // Fallback to python standard library zipfile
    try {
      execSync(`python -c "import zipfile, os; z=zipfile.ZipFile(r'${zipPath}', 'w', zipfile.ZIP_DEFLATED); [z.write(os.path.join(r, f), os.path.relpath(os.path.join(r, f), r'${extensionDir}')) for r, d, fs in os.walk(r'${extensionDir}') for f in fs]; z.close()"`);
      zipped = true;
    } catch (err2) {
      execSync(`powershell -Command "Compress-Archive -Path '${extensionDir}\*' -DestinationPath '${zipPath}' -Force"`);
      zipped = true;
    }
  }

  // 5. Copy to root C:/Documents/suno-fusion-extension.zip
  const rootDocsZip = 'C:/Documents/suno-fusion-extension.zip';
  try {
    fs.copyFileSync(zipPath, rootDocsZip);
  } catch (e) {
    console.warn('Could not copy to root C:/Documents zip:', e.message);
  }

  // 4. Keep root manifest.json updated
  const manifestRaw = fs.readFileSync(path.join(extensionDir, 'manifest.json'), 'utf-8');
  fs.writeFileSync(path.resolve('manifest.json'), manifestRaw);

  console.log('? Successfully built Suno Fusion v2.5 Extension:');
  console.log('  ? Taxonomy: 374 Genres (98 Coined)');
  console.log('  ? 2-Genre Pairs: 69,751 Combinations');
  console.log('  ? 3-Genre Combos: 8.6 Million Combinations');
  console.log('  ? Curated Library: 839 Prompts (42 Sets)');
  console.log('  ? Created Database: ' + creationsCount + ' AI Bands & Fusions');
  console.log('  ? Instruments Catalog: ' + instrumentsCount + ' Instruments (11 Categories, 7 Presets)');
  console.log('  ? Output ZIP size:', fs.statSync(zipPath).size, 'bytes');
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
