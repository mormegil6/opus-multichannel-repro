#!/usr/bin/env node
// Runs index.html under the installed Chrome, once each with the
// DirectOpusAudioDecoding field trial default, forced on and forced off,
// and prints every CLIPS row plus the verdict. See README "Reproducing".
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright-core', { paths: [process.cwd(), here] }));
const url = 'file://' + path.join(here, 'index.html');

async function run(flagArgs, label) {
  const ctx = await chromium.launchPersistentContext('', { channel: 'chrome', headless: true, args: flagArgs });
  const page = await ctx.newPage();
  try {
    await page.goto(url);
    await page.waitForFunction(() => !!window.__result, null, { timeout: 20000 });
    const rows = await page.evaluate(() => window.__result);
    const verdict = await page.evaluate(() => document.getElementById('verdict').textContent);
    console.log(`== ${label} (${ctx.browser().version()}, flags: ${flagArgs.join(' ') || '(none)'})`);
    for (const r of rows) console.log(`  ${r.name.padEnd(22)} decodeAudioData: ${r.a.ok ? 'PASS' : 'FAIL (' + r.a.detail + ')'}  MSE: ${r.b.ok ? 'PASS' : 'FAIL (' + r.b.detail + ')'}`);
    console.log('  verdict: ' + verdict);
  } finally {
    await ctx.close();
  }
}

await run([], 'default (no flag)');
await run(['--enable-features=DirectOpusAudioDecoding'], 'field trial FORCED ON');
await run(['--disable-features=DirectOpusAudioDecoding'], 'field trial FORCED OFF');
