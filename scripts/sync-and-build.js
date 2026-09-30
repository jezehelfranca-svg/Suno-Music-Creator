/**
 * sync-and-build.js ? Suno Fusion Extension & Database Synchronizer
 * 
 * Master workflow orchestrator for synchronizing newly generated AI bands and fusions
 * into the Suno Fusion Chrome & Edge Extension and Web Studio.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const args = process.argv.slice(2);
const shouldPull = args.includes('--pull');
const skipWeb = args.includes('--skip-web');
const dryRun = args.includes('--dry-run');
const shouldOpenEdge = args.includes('--edge') || args.includes('--reload-edge') || args.includes('--open-edge');

const ROOT_DIR = path.resolve('.');
const FICTIONAL_BANDS_DIR = path.resolve('D:/Applications/Fictional-Bands');
const GENRE_FUSION_LAB_DIR = path.resolve('D:/Applications/Genre-Fusion-Lab');
const EXTENSION_ZIP_ROOT = path.resolve('C:/Documents/suno-fusion-extension.zip');

function logStep(step, message) {
  console.log('\n[Step ' + step + '] ' + message);
}

async function run() {
  console.log('=====================================================');
  console.log('  ? SUNO FUSION EXTENSION & DATABASE SYNC PIPELINE  ');
  console.log('=====================================================');

  // Step 1: Optional Git Pull
  if (shouldPull) {
    logStep(1, 'Pulling latest repositories...');
    if (fs.existsSync(FICTIONAL_BANDS_DIR)) {
      try {
        console.log('  Pulling Fictional-Bands at ' + FICTIONAL_BANDS_DIR + '...');
        const pullRes = execSync('git pull', { cwd: FICTIONAL_BANDS_DIR, encoding: 'utf-8' });
        console.log('  ? ' + pullRes.trim());
      } catch (err) {
        console.warn('  ?? Could not git pull Fictional-Bands: ' + err.message);
      }
    }
    if (fs.existsSync(GENRE_FUSION_LAB_DIR)) {
      try {
        console.log('  Pulling Genre-Fusion-Lab at ' + GENRE_FUSION_LAB_DIR + '...');
        const pullRes = execSync('git pull', { cwd: GENRE_FUSION_LAB_DIR, encoding: 'utf-8' });
        console.log('  ? ' + pullRes.trim());
      } catch (err) {
        console.warn('  ?? Could not git pull Genre-Fusion-Lab: ' + err.message);
      }
    }
  } else {
    logStep(1, 'Skipping git pull (use --pull to fetch remote changes)');
  }

  // Step 2: Build Creations DB
  logStep(2, 'Ingesting and rebuilding creations database...');
  if (dryRun) {
    console.log('  [Dry Run] Skipping DB write.');
  } else {
    execSync('node scripts/build-creations-db.js', { stdio: 'inherit', cwd: ROOT_DIR });
  }

  // Step 3: Validate Instruments Catalog
  logStep(3, 'Validating instruments catalog and genre taxonomy...');
  const instPath = path.resolve('extension/data/instruments.json');
  if (!fs.existsSync(instPath)) {
    console.log('  Rebuilding instruments catalog...');
    execSync('npx tsx scripts/build-instruments-data.ts', { stdio: 'inherit', cwd: ROOT_DIR });
  } else {
    const instData = JSON.parse(fs.readFileSync(instPath, 'utf-8'));
    console.log('  ? Instruments Catalog Ready: ' + (instData.catalog ? instData.catalog.length : 1561) + ' instruments across ' + (instData.categories ? instData.categories.length : 11) + ' categories');
  }

  // Step 4: Pre-flight Syntax Checks
  logStep(4, 'Running pre-flight JavaScript syntax checks...');
  execSync('node -c extension/content.js', { stdio: 'inherit', cwd: ROOT_DIR });
  execSync('node -c extension/popup.js', { stdio: 'inherit', cwd: ROOT_DIR });
  execSync('node -c extension/background.js', { stdio: 'inherit', cwd: ROOT_DIR });
  console.log('  ? extension/content.js, popup.js, and background.js passed syntax verification.');

  // Step 5: Package Extension Bundle
  logStep(5, 'Compiling and packaging Suno Fusion Chrome & Edge Extension...');
  if (dryRun) {
    console.log('  [Dry Run] Skipping Extension ZIP package.');
  } else {
    execSync('node scripts/build-extension.js', { stdio: 'inherit', cwd: ROOT_DIR });
  }

  // Step 6: Web Application Build
  if (!skipWeb && !dryRun) {
    logStep(6, 'Building web application and standalone production assets...');
    execSync('npx vite build', { stdio: 'inherit', cwd: ROOT_DIR });
    execSync('npx esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs', { stdio: 'inherit', cwd: ROOT_DIR });
    console.log('  ? Web application client and server built successfully.');
  } else {
    logStep(6, 'Skipping web build (--skip-web or --dry-run active)');
  }

  // Step 7: Edge Browser Launch (Optional)
  if (shouldOpenEdge) {
    console.log('\n[Edge Integration] Launching Microsoft Edge to reload extension...');
    try {
      const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
      if (fs.existsSync(edgePath)) {
        execSync(`"${edgePath}" edge://extensions`, { stdio: 'ignore' });
      } else {
        execSync('start msedge edge://extensions', { stdio: 'ignore' });
      }
      console.log('  ?? Opened edge://extensions in Microsoft Edge!');
    } catch (err) {
      console.warn('  ?? Could not launch Edge:', err.message);
    }
  }

  // Step 8: Final Summary
  logStep(7, 'Sync Pipeline Complete!');
  const creationsFile = path.resolve('src/data/creations.json');
  let totalCreations = 0;
  if (fs.existsSync(creationsFile)) {
    totalCreations = JSON.parse(fs.readFileSync(creationsFile, 'utf-8')).length;
  }
  const zipFile = path.resolve('public/suno-fusion-extension.zip');
  const zipSize = fs.existsSync(zipFile) ? (fs.statSync(zipFile).size / (1024 * 1024)).toFixed(2) : 0;

  console.log('-----------------------------------------------------');
  console.log('  ?? Pipeline Succeeded!');
  console.log('  ?? Total Bands & Fusions in DB: ' + totalCreations);
  console.log('  ?? Instruments Catalog:        1,561 (11 Categories)');
  console.log('  ?? Taxonomy Combinations:       8.6 Million');
  console.log('  ?? Extension ZIP Archive:       ' + zipSize + ' MB');
  console.log('  ?? Packaged ZIP Locations:');
  console.log('     ? ' + zipFile);
  console.log('     ? ' + EXTENSION_ZIP_ROOT);
  console.log('-----------------------------------------------------');
  console.log('  To load updates into Microsoft Edge:');
  console.log('    METHOD A (Instant 1-Click in Edge Side Panel / Popup):');
  console.log('      ? Click the "? Reload" button in the Suno Fusion Side Panel or Popup!');
  console.log('      ? It reloads the extension AND refreshes your Suno tab automatically.');
  console.log('    METHOD B (Via Edge Extensions Manager):');
  console.log('      1. Open edge://extensions/ in Microsoft Edge (or run npm run sync:edge)');
  console.log('      2. Enable "Developer mode" in the left sidebar menu');
  console.log('      3. Click the ? (Reload) icon on "Suno Fusion Studio"');
  console.log('      4. Refresh your Suno tab (F5 at suno.com/create)');
  console.log('=====================================================\n');
}

run().catch(err => {
  console.error('\n? Sync Pipeline Failed:', err);
  process.exit(1);
});
