// Temporary, bounded Render experiment using the browser engine from Camofox.
// No accounts, personal cookies, proxies, or credentials are passed to this process.
import { launchOptions } from 'camoufox-js';
import { firefox } from 'playwright-core';
import { writeFile } from 'node:fs/promises';

const ids = ['Ug1mxpkX-ow', 'yMKXB4Js-sQ'];
const results = [];
let browser;
const log = data => console.log('CAMOFOX_PROBE ' + JSON.stringify(data));
try {
  log({event:'starting', engine:'camoufox', release:'152.0.4-beta.28'});
  const options = await launchOptions({
    executable_path: '/opt/camoufox/camoufox-bin', headless: false,
    os: 'linux', humanize: true, geoip: false, locale: 'en-US',
    exclude_addons: ['UBO'],
  });
  browser = await firefox.launch(options);
  for (const videoId of ids) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const transfers = [];
    const pending = new Set();
    page.on('response', response => {
      const task = (async () => {
        const url = new URL(response.url());
        if (!url.hostname.endsWith('.googlevideo.com') || !url.pathname.includes('videoplayback')) return;
        const headers = await response.allHeaders();
        const type = headers['content-type'] || '';
        const length = Number(headers['content-length'] || 0);
        const sample = {status:response.status(), type, declaredBytes:length, bytes:0};
        // Only read small playback fragments; never buffer an entire video.
        if (/^(video|audio)\//.test(type) && length > 0 && length <= 2 * 1024 * 1024) {
          sample.bytes = (await response.body()).length;
        }
        transfers.push(sample);
      })().catch(() => {});
      pending.add(task);
      task.finally(() => pending.delete(task));
    });
    try {
      await page.goto('https://www.youtube.com/watch?v=' + videoId, {waitUntil:'domcontentloaded', timeout:45000});
      await page.waitForTimeout(5000);
      const reject = page.getByRole('button', {name:/Reject all/i});
      if (await reject.count()) await reject.first().click({timeout:3000}).catch(() => {});
      await page.evaluate(() => { const v = document.querySelector('video'); if (v) { v.muted = true; v.play().catch(() => {}); } });
      await page.waitForTimeout(25000);
      const state = await page.evaluate(() => {
        const r = window.ytInitialPlayerResponse;
        const v = document.querySelector('video');
        const text = document.body?.innerText || '';
        return {playerStatus:r?.playabilityStatus?.status || null,
          reason:r?.playabilityStatus?.reason || null,
          botChallenge:/confirm you.*not a bot|sign in.*not a bot/i.test(text),
          currentTime:v?.currentTime || 0,
          formats:(r?.streamingData?.formats?.length || 0) + (r?.streamingData?.adaptiveFormats?.length || 0)};
      });
      await Promise.allSettled([...pending]);
      results.push({videoId, ...state, mediaResponses:transfers,
        receivedMediaBytes:transfers.reduce((n,t) => n+t.bytes,0),
        playable:state.currentTime > 0 && transfers.some(t => t.bytes > 0)});
    } catch (err) {
      results.push({videoId, playable:false, errorType:err.name});
    } finally {
      await context.close();
    }
    log({event:'result', ...results.at(-1)});
  }
} catch (err) {
  log({event:'launch_failed', errorType:err.name, message:String(err.message).slice(0,600)});
} finally {
  await browser?.close().catch(() => {});
  await writeFile('/tmp/fetchly-camofox-probe.json', JSON.stringify(results));
  log({event:'finished', count:results.length});
}
