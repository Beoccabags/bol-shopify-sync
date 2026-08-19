const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '..', 'daily-state.json');

/**
 * Onthoudt op welke dag een taak voor het laatst gedraaid heeft, zodat een
 * dagelijkse taak precies één keer per dag draait — ook als het script elke
 * paar minuten wordt aangeroepen.
 */
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('[State] Fout bij laden daily-state:', error.message);
  }
  return {};
}

/**
 * Datum in lokale tijd als YYYY-MM-DD
 */
function today(now = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Is deze taak vandaag al gedraaid?
 */
function ranToday(task, now = new Date()) {
  return loadState()[task] === today(now);
}

/**
 * Markeer de taak als gedraaid voor vandaag
 *
 * @returns {boolean} of het opslaan gelukt is (op een read-only filesystem niet)
 */
function markRanToday(task, now = new Date()) {
  try {
    const state = loadState();
    state[task] = today(now);
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('[State] Kon daily-state niet opslaan:', error.message);
    return false;
  }
}

module.exports = { ranToday, markRanToday, today, STATE_FILE };
