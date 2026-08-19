const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LOG_FILE = path.join(ROOT, 'sync.log');
const ARCHIVE_DIR = path.join(ROOT, 'logs');
const ARCHIVE_PATTERN = /^sync-(\d{4}-\d{2}-\d{2})\.log$/;

/**
 * Datum als YYYY-MM-DD in lokale tijd
 */
function dateKey(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Verplaats het logbestand naar het archief zodra het van een vorige dag is,
 * en ruim archieven op die ouder zijn dan het bewaartermijn.
 *
 * Wordt bij elke run aangeroepen en mag nooit de sync onderbreken.
 *
 * @param {number} retentionDays Aantal dagen dat archieven bewaard blijven
 */
function rotateLogs(retentionDays = parseInt(process.env.LOG_RETENTION_DAYS || '30', 10)) {
  try {
    if (fs.existsSync(LOG_FILE)) {
      const stats = fs.statSync(LOG_FILE);
      const logDate = dateKey(stats.mtime);

      // Alleen roteren als het logbestand van een eerdere dag is
      if (stats.size > 0 && logDate !== dateKey(new Date())) {
        fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
        const target = path.join(ARCHIVE_DIR, `sync-${logDate}.log`);

        if (fs.existsSync(target)) {
          // Al een archief van die dag: eraan vastplakken
          fs.appendFileSync(target, fs.readFileSync(LOG_FILE));
          fs.truncateSync(LOG_FILE, 0);
        } else {
          fs.renameSync(LOG_FILE, target);
        }
      }
    }

    cleanArchive(retentionDays, new Date(), ARCHIVE_DIR);
  } catch (error) {
    console.error('[Logs] Rotatie mislukt:', error.message);
  }
}

/**
 * Verwijder archieven ouder dan het bewaartermijn
 *
 * De map is een expliciete parameter zodat tests nooit op de echte logmap
 * werken.
 */
function cleanArchive(retentionDays, now = new Date(), dir = ARCHIVE_DIR) {
  if (!fs.existsSync(dir)) return [];

  const cutoff = new Date(now.getTime() - retentionDays * 86400000);
  const removed = [];

  for (const name of fs.readdirSync(dir)) {
    const match = name.match(ARCHIVE_PATTERN);
    if (!match) continue;

    // Datum uit de bestandsnaam, als lokale datum
    const [year, month, day] = match[1].split('-').map(Number);
    const fileDate = new Date(year, month - 1, day);

    if (fileDate < cutoff) {
      fs.unlinkSync(path.join(dir, name));
      removed.push(name);
    }
  }

  if (removed.length > 0) {
    console.log(`[Logs] ${removed.length} archief(en) ouder dan ${retentionDays} dagen verwijderd`);
  }

  return removed;
}

module.exports = { rotateLogs, cleanArchive, dateKey, ARCHIVE_DIR, LOG_FILE };
