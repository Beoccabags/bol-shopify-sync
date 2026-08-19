const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');

const dailyState = require('../src/daily-state');

test('datum wordt als lokale YYYY-MM-DD teruggegeven', () => {
  assert.strictEqual(dailyState.today(new Date(2026, 0, 5, 13, 0)), '2026-01-05');
  assert.strictEqual(dailyState.today(new Date(2026, 11, 31, 23, 30)), '2026-12-31');
});

test('een taak geldt pas als gedraaid nadat hij gemarkeerd is', () => {
  const backup = fs.existsSync(dailyState.STATE_FILE)
    ? fs.readFileSync(dailyState.STATE_FILE, 'utf8')
    : null;

  try {
    fs.writeFileSync(dailyState.STATE_FILE, '{}', 'utf8');

    assert.strictEqual(dailyState.ranToday('testtaak'), false);
    assert.strictEqual(dailyState.markRanToday('testtaak'), true);
    assert.strictEqual(dailyState.ranToday('testtaak'), true);

    // Morgen staat de taak weer open
    const morgen = new Date(Date.now() + 86400000);
    assert.strictEqual(dailyState.ranToday('testtaak', morgen), false);
  } finally {
    if (backup === null) {
      fs.unlinkSync(dailyState.STATE_FILE);
    } else {
      fs.writeFileSync(dailyState.STATE_FILE, backup, 'utf8');
    }
  }
});
