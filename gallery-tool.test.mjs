import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('./gallery-tool.js', import.meta.url), 'utf8');
const pending = () => new Promise(() => {});
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const catalog = () => ({ version: 1, sections: {
  esterni: [{ id: 'esterni-01', preview: 'photo.webp', titles: { it: 'Casa', en: 'House', sl: 'Hiša' } },
    { id: 'esterni-02', preview: 'other.webp', titles: { it: 'Giardino', en: 'Garden', sl: 'Vrt' } }],
  interni: [], paesaggi: []
} });

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

async function flush() {
  for (let index = 0; index < 40; index++) await Promise.resolve();
}

class Clock {
  now = 0;
  nextId = 0;
  timers = new Map();
  intervals = new Map();

  setTimeout(callback, delay) {
    const id = ++this.nextId;
    this.timers.set(id, { callback, delay, at: this.now + delay });
    return id;
  }

  clearTimeout(id) { this.timers.delete(id); }

  setInterval(callback, delay) {
    const id = ++this.nextId;
    this.intervals.set(id, { callback, delay });
    return id;
  }

  async tick(milliseconds) {
    await flush();
    const target = this.now + milliseconds;
    for (;;) {
      const due = [...this.timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.now = due[1].at;
      this.timers.delete(due[0]);
      due[1].callback();
      await flush();
    }
    this.now = target;
    await flush();
  }
}

class Element {
  value = '';
  textContent = '';
  disabled = false;
  hidden = false;
  open = false;
  files = [];
  children = [];
  dataset = {};
  listeners = new Map();
  resetCount = 0;
  classes = new Set();
  classList = {
    add: value => this.classes.add(value),
    remove: value => this.classes.delete(value),
    contains: value => this.classes.has(value),
    toggle: (value, enabled) => enabled ? this.classes.add(value) : this.classes.delete(value)
  };

  addEventListener(type, callback) {
    const callbacks = this.listeners.get(type) || [];
    callbacks.push(callback);
    this.listeners.set(type, callbacks);
  }

  dispatch(type) {
    const event = { target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    for (const callback of this.listeners.get(type) || []) callback(event);
    return event;
  }

  append(...children) { this.children.push(...children); }
  replaceChildren() { this.children = []; }
  setAttribute(name, value) { this[name] = value; }
  removeAttribute(name) { delete this[name]; }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatch('close'); }
  reset() { this.resetCount++; }
  focus() {}
}

function harness({ fetch: fetchImpl, imageMode = 'load', session = 'test-session', pendingAction = null } = {}) {
  const clock = new Clock();
  const nodes = new Map();
  const calls = [];
  const images = [];
  const revoked = [];
  const storage = new Map();
  if (session) storage.set('qubly-gallery-session', session);
  if (pendingAction) storage.set('qubly-gallery-pending', JSON.stringify(pendingAction));
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, new Element());
    return nodes.get(selector);
  };
  const tabs = ['esterni', 'interni', 'paesaggi'].map(category => {
    const tab = new Element();
    tab.dataset.category = category;
    return tab;
  });
  const document = new Element();
  document.hidden = false;
  document.querySelector = node;
  document.querySelectorAll = selector => selector === '.tab' ? tabs : [];
  document.createElement = () => new Element();
  let urlCount = 0;
  class TestURL extends URL {
    static createObjectURL() { return `blob:test-${++urlCount}`; }
    static revokeObjectURL(url) { revoked.push(url); }
  }
  class TestImage extends Element {
    naturalWidth = 800;
    naturalHeight = 600;
    constructor() { super(); images.push(this); }
    set src(value) {
      this.imageSource = value;
      if (imageMode === 'load') queueMicrotask(() => this.onload?.());
      if (imageMode === 'error') queueMicrotask(() => this.onerror?.());
    }
    removeAttribute(name) {
      if (name === 'src') this.imageSource = '';
      else super.removeAttribute(name);
    }
  }
  const context = vm.createContext({
    location: { hostname: 'localhost', origin: 'http://localhost', hash: '', pathname: '/', search: '' },
    history: { replaceState() {} }, document, URL: TestURL, URLSearchParams, AbortController,
    Image: TestImage, Uint8Array,
    sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    fetch: (url, options) => {
      calls.push({ url, options });
      return fetchImpl ? fetchImpl(url, options) : Promise.resolve(response(url.endsWith('/session') ? { login: 'tester' } : catalog()));
    },
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
    setTimeout: (callback, delay) => clock.setTimeout(callback, delay),
    clearTimeout: id => clock.clearTimeout(id),
    setInterval: (callback, delay) => clock.setInterval(callback, delay)
  });
  vm.runInContext(source.replace(/init\(\);\s*$/, '') + '\nglobalThis.app = { state, api, withDeadline, validateFile, showFile, publish, loadCatalog, init, openEditor, openRemoval, reorder, confirmRemoval };', context);
  node('#retry-catalog').hidden = true;
  return { app: context.app, clock, node, document, calls, images, revoked, storage };
}

function editor(h, file = { name: 'photo.jpg', type: 'image/jpeg', size: 5, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }) {
  h.app.state.catalog = catalog();
  h.app.state.login = 'tester';
  h.node('#editor').open = true;
  h.node('#image-input').files = [file];
  h.node('#category-input').value = 'esterni';
  for (const language of ['it', 'en', 'sl']) h.node(`#title-${language}`).value = `Titolo ${language}`;
}

const submit = () => ({ preventDefault() {} });

test('a fetch that ignores abort still times out and releases its timer', async () => {
  const h = harness({ fetch: pending });
  const check = assert.rejects(h.app.api('/catalog'), /non ha risposto in tempo/);
  await h.clock.tick(20_000);
  await check;
  assert.equal(h.calls[0].options.signal.aborted, true);
  assert.equal(h.clock.timers.size, 0);
});

test('the API deadline covers a body that never finishes after headers arrive', async () => {
  const h = harness({ fetch: async () => ({ ok: true, status: 200, json: pending }) });
  const check = assert.rejects(h.app.api('/catalog'), /non ha risposto in tempo/);
  await h.clock.tick(20_000);
  await check;
  assert.equal(h.calls[0].options.signal.aborted, true);
  assert.equal(h.clock.timers.size, 0);
});

function newSession(h) {
  h.app.state.session = 'new-session';
  h.app.state.login = 'new-user';
  h.storage.set('qubly-gallery-session', 'new-session');
  h.node('#access-label').textContent = 'Accesso: new-user';
}

function assertNewSession(h) {
  assert.equal(h.app.state.session, 'new-session');
  assert.equal(h.app.state.login, 'new-user');
  assert.equal(h.storage.get('qubly-gallery-session'), 'new-session');
  assert.equal(h.node('#access-label').textContent, 'Accesso: new-user');
}

test('a late fetch 401 that ignores abort cannot log out a newer session', async () => {
  const fetching = deferred();
  let bodyReads = 0;
  const h = harness({ fetch: () => fetching.promise });
  const check = assert.rejects(h.app.api('/catalog'), /non ha risposto in tempo/);
  await h.clock.tick(20_000);
  await check;
  newSession(h);
  fetching.resolve({ ok: false, status: 401, json: async () => { bodyReads++; return { error: 'old token expired' }; } });
  await flush();
  assertNewSession(h);
  assert.equal(bodyReads, 0);
  assert.equal(h.clock.timers.size, 0);
});

for (const bodyRejects of [false, true]) {
  test(`a late 401 body ${bodyRejects ? 'rejection' : 'response'} cannot affect a newer session`, async () => {
    const body = deferred();
    const h = harness({ fetch: async () => ({ ok: false, status: 401, json: () => body.promise }) });
    const check = assert.rejects(h.app.api('/catalog'), /non ha risposto in tempo/);
    await h.clock.tick(20_000);
    await check;
    newSession(h);
    if (bodyRejects) body.reject(new Error('late connection error'));
    else body.resolve({ error: 'old token expired' });
    await flush();
    assertNewSession(h);
    assert.equal(h.clock.timers.size, 0);
  });
}

test('an unexpired 401 for an old token cannot clear a newer session', async () => {
  const fetching = deferred();
  const h = harness({ fetch: () => fetching.promise });
  const check = assert.rejects(h.app.api('/catalog'), /old token expired/);
  await flush();
  newSession(h);
  fetching.resolve(response({ error: 'old token expired' }, 401));
  await check;
  assertNewSession(h);
  assert.equal(h.calls[0].options.headers.Authorization, 'Bearer test-session');
  assert.equal(h.clock.timers.size, 0);
});

test('an unexpired 401 for the current token still clears access normally', async () => {
  const h = harness({ fetch: async () => response({ error: 'token expired' }, 401) });
  h.app.state.login = 'tester';
  await assert.rejects(h.app.api('/catalog'), /token expired/);
  assert.equal(h.app.state.session, null);
  assert.equal(h.app.state.login, null);
  assert.equal(h.storage.has('qubly-gallery-session'), false);
  assert.equal(h.node('#access-label').textContent, 'Accedi per modificare');
  assert.equal(h.clock.timers.size, 0);
});

for (const status of [200, 401]) {
  test(`an old session check (${status}) cannot replace access established while it was pending`, async () => {
    const fetching = deferred();
    const h = harness({ fetch: url => url.endsWith('/session') ? fetching.promise : Promise.resolve(response(catalog())) });
    const starting = h.app.init();
    await flush();
    newSession(h);
    fetching.resolve(response(status === 200 ? { login: 'old-user' } : { error: 'old token expired' }, status));
    await starting;
    assertNewSession(h);
    assert.equal(h.clock.timers.size, 0);
  });
}

test('a catalog body arriving after the deadline cannot render a late success', async () => {
  const body = deferred();
  const h = harness({ fetch: async () => ({ ok: true, status: 200, json: () => body.promise }) });
  const check = assert.rejects(h.app.loadCatalog(), /non ha risposto in tempo/);
  await h.clock.tick(20_000);
  await check;
  body.resolve(catalog());
  await flush();
  assert.equal(h.app.state.catalog, null);
  assert.equal(h.node('#count').textContent, 'Catalogo non disponibile');
  assert.equal(h.node('#retry-catalog').hidden, false);
  assert.equal(h.node('#grid').children.length, 0);
  assert.equal(h.clock.timers.size, 0);
});

test('successful and malformed responses both release their deadline timers', async () => {
  const h = harness();
  await h.app.api('/catalog');
  assert.equal(h.clock.timers.size, 0);
  const invalid = harness({ fetch: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('truncated'); } }) });
  await assert.rejects(invalid.app.api('/catalog'), /risposta non valida/);
  assert.equal(invalid.clock.timers.size, 0);
});

test('image decoding without load or error stops and cleans handlers and object URL', async () => {
  const h = harness({ imageMode: 'pending' });
  const check = assert.rejects(h.app.validateFile({ type: 'image/jpeg', size: 5 }), /verifica della foto.*troppo tempo/);
  await h.clock.tick(15_000);
  await check;
  assert.deepEqual(h.revoked, ['blob:test-1']);
  assert.equal(h.images[0].onload, null);
  assert.equal(h.images[0].onerror, null);
  assert.equal(h.images[0].imageSource, '');
  assert.equal(h.clock.timers.size, 0);
});

test('valid image keeps its preview URL, invalid image revokes it, and both clear timers', async () => {
  const valid = harness();
  assert.equal(await valid.app.validateFile({ type: 'image/jpeg', size: 5 }), 'blob:test-1');
  assert.equal(valid.revoked.length, 0);
  assert.equal(valid.clock.timers.size, 0);
  const invalid = harness({ imageMode: 'error' });
  await assert.rejects(invalid.app.validateFile({ type: 'image/jpeg', size: 5 }), /foto valida/);
  assert.deepEqual(invalid.revoked, ['blob:test-1']);
  assert.equal(invalid.clock.timers.size, 0);
});

test('file reading cannot leave publish or editor controls disabled indefinitely', async () => {
  const h = harness();
  editor(h, { type: 'image/jpeg', size: 5, arrayBuffer: pending });
  const publishing = h.app.publish(submit());
  await flush();
  assert.equal(h.node('#publish').disabled, true);
  assert.equal(h.app.state.saving, true);
  await h.clock.tick(15_000);
  await publishing;
  assert.match(h.node('#editor-message').textContent, /lettura della foto.*troppo tempo/);
  for (const selector of ['#publish', '#close-editor', '#image-input', '#category-input', '#title-it']) assert.equal(h.node(selector).disabled, false);
  assert.equal(h.node('#publish').textContent, 'Pubblica la foto');
  assert.equal(h.app.state.saving, false);
  assert.equal(h.calls.length, 0);
  assert.equal(h.clock.timers.size, 0);
});

test('duplicate submissions and editor changes are blocked from the first await', async () => {
  const h = harness({ imageMode: 'pending', fetch: async () => response({ accepted: true }) });
  editor(h);
  const original = h.app.state.catalog.sections.esterni[0];
  h.app.state.editing = original;
  const publishing = h.app.publish(submit());
  await h.app.publish(submit());
  h.app.openEditor(h.app.state.catalog.sections.esterni[1]);
  assert.equal(h.app.state.editing, original);
  assert.equal(h.node('#editor-form').resetCount, 0);
  await flush();
  assert.equal(h.images.length, 1);
  // Even a programmatic field change cannot alter the already captured request.
  h.node('#category-input').value = 'interni';
  h.node('#title-it').value = 'Changed';
  h.app.state.editing = { id: 'different-id' };
  h.images[0].onload();
  await publishing;
  assert.equal(h.calls.length, 1);
  const body = JSON.parse(h.calls[0].options.body);
  assert.equal(body.id, 'esterni-01');
  assert.equal(body.category, 'esterni');
  assert.equal(body.titles.it, 'Titolo it');
  assert.equal(h.calls[0].options.headers.Authorization, 'Bearer test-session');
  assert.equal(h.node('#editor').open, false);
  assert.equal(h.app.state.saving, false);
  assert.deepEqual([...h.clock.timers.values()].map(timer => timer.delay), [12_000, 30_000, 60_000]);
});

for (const hangingBody of [false, true]) {
  test(`publishing timeout (${hangingBody ? 'response body' : 'fetch'}) reports an uncertain outcome without retry`, async () => {
    const h = harness({ fetch: hangingBody ? async () => ({ ok: true, status: 200, json: pending }) : pending });
    editor(h);
    const publishing = h.app.publish(submit());
    await flush();
    await h.clock.tick(90_000);
    await publishing;
    assert.match(h.node('#editor-message').textContent, /esito.*non è confermato/);
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].options.signal.aborted, true);
    assert.equal(h.node('#publish').disabled, false);
    assert.equal(h.app.state.saving, false);
    assert.equal(h.node('#editor').open, true);
    assert.equal(h.clock.timers.size, 0);
  });
}

test('backend publication_unknown errors preserve the uncertain-outcome instruction', async () => {
  const h = harness({ fetch: async () => response({ code: 'publication_unknown', error: 'unconfirmed' }, 504) });
  editor(h);
  await h.app.publish(submit());
  assert.match(h.node('#editor-message').textContent, /esito.*non è confermato.*Verifica la galleria/);
  assert.equal(h.calls.length, 1);
});

test('late replacement success cannot close the editor or schedule refresh after a timeout', async () => {
  const fetching = deferred();
  const h = harness({ fetch: () => fetching.promise });
  editor(h);
  h.app.state.editing = h.app.state.catalog.sections.esterni[0];
  const publishing = h.app.publish(submit());
  await h.clock.tick(90_000);
  await publishing;
  const timeoutMessage = h.node('#editor-message').textContent;
  assert.match(timeoutMessage, /esito.*non è confermato/);
  fetching.resolve(response({ accepted: true }));
  await flush();
  assert.equal(h.node('#editor').open, true);
  assert.equal(h.node('#editor-message').textContent, timeoutMessage);
  assert.equal(h.node('#status').textContent, '');
  assert.equal(h.node('#publish').disabled, false);
  assert.equal(h.app.state.saving, false);
  assert.equal(JSON.parse(h.calls[0].options.body).mode, 'replace');
  assert.equal(h.calls.length, 1);
  assert.equal(h.clock.timers.size, 0);
});

test('session verification proceeds while catalog hangs; retry later resumes the pending action', async () => {
  let catalogAvailable = false;
  const h = harness({
    pendingAction: { action: 'replace', category: 'esterni', id: 'esterni-01' },
    fetch: async url => url.endsWith('/session') ? response({ login: 'tester' }) : catalogAvailable ? response(catalog()) : pending()
  });
  const starting = h.app.init();
  await flush();
  assert.equal(h.app.state.login, 'tester');
  assert.equal(h.node('#access-label').textContent, 'Accesso: tester');
  assert.equal(h.node('#editor').open, false);
  assert.equal(h.storage.has('qubly-gallery-pending'), true);
  await h.clock.tick(20_000);
  await starting;
  assert.equal(h.node('#count').textContent, 'Catalogo non disponibile');
  assert.equal(h.node('#retry-catalog').hidden, false);
  assert.equal(h.node('#retry-catalog').disabled, false);
  assert.equal(h.clock.timers.size, 0);
  catalogAvailable = true;
  h.node('#retry-catalog').dispatch('click');
  await flush();
  assert.equal(h.node('#retry-catalog').hidden, true);
  assert.equal(h.node('#editor').open, true);
  assert.equal(h.app.state.editing.id, 'esterni-01');
  assert.equal(h.storage.has('qubly-gallery-pending'), false);
});

test('catalog refresh errors retain the last valid photo count', async () => {
  const h = harness({ fetch: pending });
  editor(h);
  h.node('#count').textContent = '2 foto · Esterni';
  const check = assert.rejects(h.app.loadCatalog(), /non ha risposto in tempo/);
  await h.clock.tick(20_000);
  await check;
  assert.equal(h.node('#count').textContent, '2 foto · Esterni');
  assert.equal(h.node('#retry-catalog').hidden, false);
});

test('a read started before an edit cannot replace the edited catalog after saving ends', async () => {
  const reading = deferred();
  const h = harness({ fetch: url => url.endsWith('/catalog') ? reading.promise : Promise.resolve(response({ accepted: true })) });
  editor(h);
  const refreshing = h.app.loadCatalog();
  await flush();
  await h.app.reorder(0, 1);
  assert.equal(h.app.state.catalog.sections.esterni[0].id, 'esterni-02');
  reading.resolve(response(catalog()));
  assert.equal(await refreshing, false);
  assert.equal(h.app.state.catalog.sections.esterni[0].id, 'esterni-02');
  assert.equal(h.clock.timers.size, 0);
});

test('catalog reads are skipped while a publish is in progress', async () => {
  const h = harness({ fetch: pending });
  editor(h);
  const publishing = h.app.publish(submit());
  await flush();
  assert.equal(await h.app.loadCatalog(), false);
  assert.equal(h.calls.length, 1);
  assert.ok(h.calls[0].url.endsWith('/publish'));
  await h.clock.tick(90_000);
  await publishing;
});

test('closing and cancelling the editor cannot interrupt an active publish', async () => {
  const h = harness({ fetch: url => url.endsWith('/publish') ? pending() : Promise.resolve(response(url.endsWith('/session') ? { login: 'tester' } : catalog())) });
  await h.app.init();
  editor(h);
  const publishing = h.app.publish(submit());
  await flush();
  assert.equal(h.node('#editor').dispatch('cancel').defaultPrevented, true);
  h.node('#close-editor').dispatch('click');
  assert.equal(h.node('#editor').open, true);
  await h.clock.tick(90_000);
  await publishing;
  assert.equal(h.node('#editor').dispatch('cancel').defaultPrevented, false);
  h.node('#close-editor').dispatch('click');
  assert.equal(h.node('#editor').open, false);
});

test('late preview validation cannot restore an image after its editor closes', async () => {
  const h = harness({ imageMode: 'pending' });
  editor(h);
  const showing = h.app.showFile({ name: 'photo.jpg', type: 'image/jpeg', size: 5 });
  await flush();
  h.node('#editor').open = false;
  h.images[0].onload();
  await showing;
  assert.equal(h.app.state.previewUrl, null);
  assert.deepEqual(h.revoked, ['blob:test-1']);
  assert.equal(h.clock.timers.size, 0);
});

test('removal controls and saving state recover after an unresponsive write', async () => {
  const h = harness({ fetch: pending });
  editor(h);
  h.app.state.removing = { category: 'esterni', id: 'esterni-01' };
  const removing = h.app.confirmRemoval();
  await h.clock.tick(90_000);
  await removing;
  for (const selector of ['#confirm-remove', '#cancel-remove', '#close-remove']) assert.equal(h.node(selector).disabled, false);
  assert.equal(h.app.state.saving, false);
  assert.equal(h.app.state.catalog.sections.esterni.length, 2);
  assert.match(h.node('#remove-message').textContent, /esito.*non è confermato/);
});
