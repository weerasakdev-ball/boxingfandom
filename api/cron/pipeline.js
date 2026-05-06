// Daily pipeline — triggered by Vercel Cron at 02:00 UTC
// Flow: read fighters list → scrape each URL → Claude parses HTML → commit deltas to GitHub
const { createLogger }                   = require('../lib/logger');
const { fetchPage }                      = require('../lib/scraper');
const { parseFightHistory, summarisePipelineRun } = require('../lib/ai-parser');
const { getFile, putFile }               = require('../lib/github');

const DATA_BASE        = 'data/boxers';
const MAX_PER_RUN      = Number(process.env.MAX_FIGHTERS_PER_RUN) || 20;
const INTER_FIGHTER_MS = 3000; // polite pause between fighters

// ── Deduplicate helpers ──────────────────────────────────────────
function isDuplicate(history, fight) {
  const opp = fight.opponent_th || fight.opponent_en;
  return history.some(f => {
    // Same opponent within 2 days is a duplicate
    if (f.opponent_th === opp || f.opponent_en === opp) {
      const d1 = new Date(f.date), d2 = new Date(fight.date);
      if (!isNaN(d1) && !isNaN(d2) && Math.abs(d1 - d2) / 86400000 <= 2) return true;
      // Exact date + same round
      if (f.date === fight.date && f.round === fight.round) return true;
    }
    return false;
  });
}

function sortHistory(history) {
  return history.slice().sort((a, b) => {
    if (a.result === '' && b.result !== '') return -1;
    if (a.result !== '' && b.result === '') return 1;
    return new Date(b.date) - new Date(a.date);
  });
}

// ── Main handler ─────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  // Vercel cron passes Authorization: Bearer <CRON_SECRET>
  const authHeader = req.headers['authorization'] || '';
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const log   = createLogger('daily-pipeline');
  const t0    = Date.now();
  const stats = { total: 0, updated: 0, skipped: 0, errors: 0, newFights: 0 };

  log.info('Pipeline started', { maxPerRun: MAX_PER_RUN });

  try {
    // ── 1. Load fighters list ──────────────────────────────────────
    log.info('Loading fighters-list.json from GitHub');
    const listFile = await getFile(`${DATA_BASE}/fighters-list.json`);
    if (!listFile) throw new Error('fighters-list.json not found in repo');

    const allFiles     = JSON.parse(listFile.content);
    const targetFiles  = allFiles.slice(0, MAX_PER_RUN);
    stats.total        = targetFiles.length;
    log.info(`Processing ${targetFiles.length} of ${allFiles.length} fighters`);

    // ── 2. Process each fighter ────────────────────────────────────
    for (const file of targetFiles) {
      const filePath = `${DATA_BASE}/${file}`;
      log.info(`Fighter: ${file}`);

      let fighterFile;
      try {
        fighterFile = await getFile(filePath);
        if (!fighterFile) {
          log.warn(`File not found in GitHub: ${file}`);
          stats.errors++;
          continue;
        }
      } catch (e) {
        log.error(`GitHub read failed: ${file}`, { error: e.message });
        stats.errors++;
        continue;
      }

      let data;
      try {
        data = JSON.parse(fighterFile.content);
      } catch (e) {
        log.error(`JSON parse error: ${file}`, { error: e.message });
        stats.errors++;
        continue;
      }

      const profile  = data.fighter_profile || {};
      const name     = profile.name_th || file;
      const urls     = Array.isArray(profile.target_urls)
        ? profile.target_urls.filter(Boolean)
        : [];

      if (!urls.length) {
        log.info(`No target URLs — skip`, { fighter: name });
        stats.skipped++;
        continue;
      }

      if (!Array.isArray(data.fight_history))    data.fight_history    = [];
      if (!Array.isArray(data.weigh_in_history)) data.weigh_in_history = [];

      let newFightsForFighter = 0;

      for (const url of urls) {
        const source = url.includes('onefc.com') ? 'ONE FC' : 'THBoxing';
        log.info(`Scraping ${source}`, { fighter: name, url });

        try {
          const html   = await fetchPage(url);
          const fights = await parseFightHistory(html, name, source);
          log.info(`Claude parsed ${fights.length} fights`, { fighter: name, source });

          for (const fight of fights) {
            if (!fight.date) continue;
            if (!isDuplicate(data.fight_history, fight)) {
              data.fight_history.push(fight);
              newFightsForFighter++;
              stats.newFights++;
            }
          }
        } catch (e) {
          log.error(`Scrape/parse failed`, { fighter: name, url, error: e.message });
        }
      }

      if (newFightsForFighter > 0) {
        data.fight_history = sortHistory(data.fight_history);
        const commitMsg = `[cron] ${name}: +${newFightsForFighter} fight(s)`;
        try {
          await putFile(filePath, JSON.stringify(data, null, 2), fighterFile.sha, commitMsg);
          log.info(`Committed`, { fighter: name, newFights: newFightsForFighter });
          stats.updated++;
        } catch (e) {
          log.error(`GitHub write failed`, { fighter: name, error: e.message });
          stats.errors++;
        }
      } else {
        log.info(`Up to date`, { fighter: name });
        stats.skipped++;
      }

      await new Promise(r => setTimeout(r, INTER_FIGHTER_MS));
    }

    // ── 3. Final summary via Claude ────────────────────────────────
    stats.duration_s = Math.round((Date.now() - t0) / 1000);
    log.info('Pipeline complete', stats);

    let summary = '';
    try {
      summary = await summarisePipelineRun(stats);
      log.info('Summary', { text: summary });
    } catch (e) {
      log.warn('Summary generation failed', { error: e.message });
    }

    return res.status(200).json({ ok: true, stats, summary, logs: log.entries });

  } catch (e) {
    stats.duration_s = Math.round((Date.now() - t0) / 1000);
    log.error('Pipeline fatal error', { error: e.message, stack: e.stack });
    return res.status(500).json({ ok: false, error: e.message, stats, logs: log.entries });
  }
};
