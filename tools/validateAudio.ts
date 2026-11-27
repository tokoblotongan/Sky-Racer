// tools/validateAudio.ts

import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../src/config';

const MAX_FILE_BYTES = 6 * 1024 * 1024; // 6 MB
const AUDIO_DIR = path.resolve(process.cwd(), 'public', 'audio');

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function main(): void {
  console.log('Validating music audio assets in public/audio/...');

  if (!fs.existsSync(AUDIO_DIR)) {
    console.error(`FAIL: directory not found: ${AUDIO_DIR}`);
    process.exit(1);
  }

  const entries = fs.readdirSync(AUDIO_DIR);
  const trackEntries = Object.entries(CONFIG.audio.music.tracks) as Array<[string, string]>;
  let hasError = false;

  for (const [key, filename] of trackEntries) {
    const filePath = path.join(AUDIO_DIR, filename);

    // Case-sensitive exact filename check against directory entries
    if (!entries.includes(filename)) {
      console.error(`FAIL [${key}]: exact filename missing -> public/audio/${filename}`);
      hasError = true;
      continue;
    }

    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      console.error(`FAIL [${key}]: not a regular file -> public/audio/${filename}`);
      hasError = true;
      continue;
    }

    if (stat.size <= 0) {
      console.error(`FAIL [${key}]: empty file (0 bytes) -> public/audio/${filename}`);
      hasError = true;
      continue;
    }

    if (stat.size > MAX_FILE_BYTES) {
      console.error(
        `FAIL [${key}]: ${filename} is ${formatMb(stat.size)}, exceeds ${formatMb(MAX_FILE_BYTES)} limit`,
      );
      hasError = true;
      continue;
    }

    console.log(`OK   [${key}]: ${filename} (${formatMb(stat.size)})`);
  }

  if (hasError) {
    console.error('Audio validation FAILED.');
    process.exit(1);
  }

  console.log(`Audio validation PASSED (${trackEntries.length} tracks verified <= 6.00 MB).`);
}

main();
