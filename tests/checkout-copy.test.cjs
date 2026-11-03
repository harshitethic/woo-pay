const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = readFileSync(join(__dirname, '../assets/checkout.js'), 'utf8');

async function clickCopy({ clipboard, legacyCopy }) {
  const timers = [];
  const calls = [];
  let onClick;
  function HTMLElement() {}
  const button = Object.assign(new HTMLElement(), {
    textContent: 'Copy',
    classList: { contains: (name) => name === 'woo-pay-copy' },
    closest: () => ({ querySelector: () => ({ textContent: '  G123456  ' }) }),
  });
  const document = {
    addEventListener: (type, callback) => { if (type === 'click') onClick = callback; },
    querySelector: () => null,
    createElement: () => ({ select: () => {}, value: '' }),
    body: { appendChild: () => {}, removeChild: () => {} },
    execCommand: (command) => { calls.push(command); return legacyCopy(); },
  };
  vm.runInNewContext(source, {
    document,
    HTMLElement,
    navigator: { clipboard },
    window: { WooPayStellar: { copied: 'Copied!', copyFailed: 'Copy failed' } },
    setTimeout: (fn) => timers.push(fn),
  });
  onClick({ target: button });
  await new Promise((resolve) => setImmediate(resolve));
  const label = button.textContent;
  for (const timer of timers) timer();
  assert.equal(button.textContent, 'Copy', 'the button label must be restored');
  return { label, calls };
}

test('successful modern clipboard copy reports success without a legacy call', async () => {
  const result = await clickCopy({ clipboard: { writeText: async () => {} }, legacyCopy: () => false });
  assert.equal(result.label, 'Copied!');
  assert.deepEqual(result.calls, []);
});

test('rejected clipboard copy only reports success if the fallback succeeds', async () => {
  const result = await clickCopy({
    clipboard: { writeText: async () => { throw new Error('denied'); } },
    legacyCopy: () => true,
  });
  assert.equal(result.label, 'Copied!');
  assert.deepEqual(result.calls, ['copy']);
});

test('clipboard rejection with failed fallback never lies about copying', async () => {
  const result = await clickCopy({
    clipboard: { writeText: async () => { throw new Error('denied'); } },
    legacyCopy: () => false,
  });
  assert.equal(result.label, 'Copy failed');
  assert.deepEqual(result.calls, ['copy']);
});

test('legacy clipboard failure reports a failure, not success', async () => {
  const result = await clickCopy({ clipboard: undefined, legacyCopy: () => false });
  assert.equal(result.label, 'Copy failed');
});

test('a synchronous clipboard exception still falls back safely', async () => {
  const result = await clickCopy({
    clipboard: { writeText: () => { throw new Error('blocked'); } },
    legacyCopy: () => true,
  });
  assert.equal(result.label, 'Copied!');
});
