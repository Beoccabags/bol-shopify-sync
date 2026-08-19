const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { cleanArchive, dateKey } = require('../src/log-rotate');

/**
 * Tests draaien in een eigen tijdelijke map, nooit op de echte logmap.
 */
function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-rotate-test-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('datumsleutel is lokaal YYYY-MM-DD', () => {
  assert.strictEqual(dateKey(new Date(2026, 7, 19, 23, 59)), '2026-08-19');
  assert.strictEqual(dateKey(new Date(2026, 0, 1, 0, 0)), '2026-01-01');
});

test('archieven ouder dan het bewaartermijn worden verwijderd', () => {
  withTempDir(dir => {
    const nu = new Date(2026, 7, 19);
    const opDag = offset => `sync-${dateKey(new Date(nu.getTime() - offset * 86400000))}.log`;

    const oud = opDag(45);
    const randje = opDag(29);
    const vers = opDag(1);

    for (const naam of [oud, randje, vers]) {
      fs.writeFileSync(path.join(dir, naam), 'test', 'utf8');
    }

    const verwijderd = cleanArchive(30, nu, dir);

    assert.deepStrictEqual(verwijderd, [oud]);
    assert.strictEqual(fs.existsSync(path.join(dir, oud)), false);
    assert.strictEqual(fs.existsSync(path.join(dir, randje)), true);
    assert.strictEqual(fs.existsSync(path.join(dir, vers)), true);
  });
});

test('niet-herkende bestanden in het archief blijven staan', () => {
  withTempDir(dir => {
    const vreemd = path.join(dir, 'aantekeningen.txt');
    fs.writeFileSync(vreemd, 'niet aankomen', 'utf8');

    cleanArchive(0, new Date(), dir);

    assert.strictEqual(fs.existsSync(vreemd), true);
  });
});

test('een lege of ontbrekende map levert geen fout op', () => {
  assert.deepStrictEqual(cleanArchive(30, new Date(), '/pad/bestaat/niet'), []);
});
