const API = ['localhost', '127.0.0.1'].includes(location.hostname) ? `${location.origin}/api/gallery` : 'https://qubly.studio/api/gallery';
const SITE = 'https://qubly.studio/';
const LANGUAGES = ['it', 'en', 'sl'];
const CATEGORIES = ['esterni', 'interni', 'paesaggi'];
const $ = selector => document.querySelector(selector);
const state = {
  category: 'esterni', catalog: null, session: sessionStorage.getItem('qubly-gallery-session'),
  login: null, editing: null, saving: false, dragId: null, previewUrl: null
};

function message(text, error = false) {
  const element = $('#status');
  element.textContent = text;
  element.classList.toggle('error', error);
}

function sessionFromCallback() {
  const params = new URLSearchParams(location.hash.slice(1));
  const session = params.get('session');
  if (session) {
    sessionStorage.setItem('qubly-gallery-session', session);
    state.session = session;
    history.replaceState(null, '', location.pathname + location.search);
  }
}

async function api(path, options = {}) {
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers };
  if (state.session) headers.Authorization = `Bearer ${state.session}`;
  let response;
  try { response = await fetch(`${API}${path}`, { cache: 'no-store', ...options, headers }); }
  catch { throw new Error('Non riesco a collegarmi alla galleria. Riprova tra poco.'); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      state.session = null;
      sessionStorage.removeItem('qubly-gallery-session');
      showAccess();
    }
    throw new Error(result.error || 'Operazione non riuscita. Riprova.');
  }
  return result;
}

function showAccess() {
  const loggedIn = Boolean(state.session && state.login);
  $('#access-label').textContent = loggedIn ? `Accesso: ${state.login}` : 'Accedi per modificare';
  $('#access-dot').classList.toggle('online', loggedIn);
  $('#login').hidden = loggedIn;
  $('#logout').hidden = !loggedIn;
  render();
}

async function signIn(pending) {
  try {
    const status = await api('/status');
    if (!status.configured) throw new Error('L’accesso GitHub è in preparazione. Le foto restano visibili qui.');
    if (pending) sessionStorage.setItem('qubly-gallery-pending', JSON.stringify(pending));
    location.assign(`${API}/auth/start`);
  } catch (error) { message(error.message, true); }
}

function requireAccess(pending) {
  if (state.session && state.login) return true;
  signIn(pending);
  return false;
}

function titleOf(item) { return item.titles?.it || 'Senza titolo'; }

function imageUrl(path) { return new URL(path || '', SITE).href; }

function filteredItems() {
  const query = $('#search').value.trim().toLocaleLowerCase('it');
  const items = state.catalog?.sections?.[state.category] || [];
  return query ? items.filter(item => Object.values(item.titles || {}).join(' ').toLocaleLowerCase('it').includes(query)) : items;
}

function iconButton(symbol, label, onClick, disabled = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-button';
  button.textContent = symbol;
  button.setAttribute('aria-label', label);
  button.disabled = disabled;
  button.addEventListener('click', onClick);
  return button;
}

function render() {
  if (!state.catalog) return;
  for (const tab of document.querySelectorAll('.tab')) tab.setAttribute('aria-pressed', String(tab.dataset.category === state.category));
  const all = state.catalog.sections[state.category];
  const items = filteredItems();
  const searching = Boolean($('#search').value.trim());
  $('#count').textContent = `${all.length} foto · ${state.category[0].toUpperCase()}${state.category.slice(1)}`;
  const grid = $('#grid');
  grid.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Nessuna foto trovata.';
    grid.append(empty);
    return;
  }
  items.forEach((item, visibleIndex) => {
    const index = all.findIndex(candidate => candidate.id === item.id);
    const card = document.createElement('article');
    card.className = 'card';
    card.dataset.id = item.id;
    card.draggable = Boolean(state.login && !state.saving && !searching);
    const image = document.createElement('img');
    image.className = 'card-image';
    image.src = imageUrl(item.preview);
    image.alt = titleOf(item);
    image.loading = visibleIndex < 4 ? 'eager' : 'lazy';
    image.draggable = false;
    const body = document.createElement('div');
    body.className = 'card-body';
    const title = document.createElement('h2');
    title.className = 'card-title';
    title.textContent = titleOf(item);
    title.title = titleOf(item);
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const moveUp = iconButton('↑', `Sposta prima ${titleOf(item)}`, () => move(item.id, -1), state.saving || searching || index === 0);
    const moveDown = iconButton('↓', `Sposta dopo ${titleOf(item)}`, () => move(item.id, 1), state.saving || searching || index === all.length - 1);
    const replace = document.createElement('button');
    replace.type = 'button';
    replace.className = 'replace';
    replace.textContent = 'Sostituisci';
    replace.setAttribute('aria-label', `Sostituisci ${titleOf(item)}`);
    replace.addEventListener('click', () => openEditor(item));
    const handle = document.createElement('span');
    handle.className = 'icon-button drag-handle';
    handle.textContent = '⠿';
    handle.setAttribute('aria-hidden', 'true');
    actions.append(moveUp, moveDown, replace, handle);
    body.append(title, actions);
    card.append(image, body);
    card.addEventListener('dragstart', event => {
      if (!card.draggable) { event.preventDefault(); return; }
      state.dragId = item.id;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', item.id);
      requestAnimationFrame(() => card.classList.add('dragging'));
    });
    card.addEventListener('dragover', event => {
      if (!state.dragId || state.dragId === item.id) return;
      event.preventDefault();
      card.classList.add('drag-over');
    });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', event => {
      event.preventDefault();
      card.classList.remove('drag-over');
      const dragged = state.dragId;
      state.dragId = null;
      if (dragged && dragged !== item.id) moveTo(dragged, item.id);
    });
    card.addEventListener('dragend', () => {
      state.dragId = null;
      card.classList.remove('dragging');
      document.querySelectorAll('.drag-over').forEach(node => node.classList.remove('drag-over'));
    });
    grid.append(card);
  });
}

async function loadCatalog() {
  const catalog = await api('/catalog');
  if (catalog.version !== 1 || !catalog.sections || CATEGORIES.some(category => !Array.isArray(catalog.sections[category]))) throw new Error('Catalogo non disponibile.');
  state.catalog = catalog;
  render();
}

async function move(id, direction) {
  if (!requireAccess({ action: 'reorder', category: state.category })) return;
  const items = state.catalog.sections[state.category];
  const from = items.findIndex(item => item.id === id);
  const to = from + direction;
  if (to < 0 || to >= items.length) return;
  await reorder(from, to);
}

async function moveTo(sourceId, targetId) {
  if (!requireAccess({ action: 'reorder', category: state.category })) return;
  const items = state.catalog.sections[state.category];
  const from = items.findIndex(item => item.id === sourceId);
  const to = items.findIndex(item => item.id === targetId);
  if (from >= 0 && to >= 0) await reorder(from, to);
}

async function reorder(from, to) {
  if (state.saving || from === to) return;
  const category = state.category;
  const original = [...state.catalog.sections[category]];
  const next = [...original];
  next.splice(to, 0, ...next.splice(from, 1));
  state.catalog.sections[category] = next;
  state.saving = true;
  render();
  message('Salvataggio del nuovo ordine…');
  try {
    await api('/publish', { method: 'POST', body: JSON.stringify({ mode: 'reorder', category, order: next.map(item => item.id) }) });
    message('Nuovo ordine salvato. Il sito si aggiorna tra poco.');
  } catch (error) {
    state.catalog.sections[category] = original;
    message(error.message, true);
  } finally {
    state.saving = false;
    render();
  }
}

function clearPreview() {
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = null;
  $('#upload-preview').hidden = true;
  $('#upload-preview').removeAttribute('src');
  $('#file-label').textContent = 'Scegli una foto o trascinala qui';
}

function openEditor(item = null) {
  if (!requireAccess({ action: item ? 'replace' : 'add', category: state.category, id: item?.id })) return;
  state.editing = item;
  $('#editor-form').reset();
  clearPreview();
  $('#editor-kicker').textContent = state.category.toUpperCase();
  $('#editor-title').textContent = item ? 'Sostituisci la foto' : 'Aggiungi una foto';
  $('#editor-lead').textContent = item ? `La nuova immagine prenderà il posto di “${titleOf(item)}”.` : 'Scegli l’immagine e scrivi un titolo breve per ogni lingua.';
  $('#category-field').hidden = Boolean(item);
  $('#category-input').value = state.category;
  $('#editor-current').hidden = !item;
  if (item) { $('#current-image').src = imageUrl(item.preview); $('#current-image').alt = titleOf(item); }
  for (const language of LANGUAGES) $(`#title-${language}`).value = item?.titles?.[language] || '';
  $('#editor-message').textContent = '';
  $('#publish').disabled = false;
  $('#publish').textContent = 'Pubblica la foto';
  $('#editor').showModal();
  $('#image-input').focus();
}

async function validateFile(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Scegli una foto JPG, PNG o WebP.');
  if (file.size > 10 * 1024 * 1024) throw new Error('La foto supera 10 MB. Scegline una più leggera.');
  const url = URL.createObjectURL(file);
  try {
    const dimensions = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve([image.naturalWidth, image.naturalHeight]);
      image.onerror = reject;
      image.src = url;
    });
    if (dimensions[0] < 640 || dimensions[1] < 400 || dimensions[0] * dimensions[1] > 50_000_000) {
      throw new Error('Usa una foto di almeno 640 × 400 px e massimo 50 megapixel.');
    }
    return url;
  } catch (error) {
    URL.revokeObjectURL(url);
    if (error instanceof Error && error.message.startsWith('Usa una foto')) throw error;
    throw new Error('Il file non sembra essere una foto valida.');
  }
}

async function showFile(file) {
  $('#editor-message').textContent = '';
  clearPreview();
  try {
    state.previewUrl = await validateFile(file);
    $('#upload-preview').src = state.previewUrl;
    $('#upload-preview').hidden = false;
    $('#file-label').textContent = file.name;
  } catch (error) {
    $('#image-input').value = '';
    $('#editor-message').textContent = error.message;
  }
}

function base64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function publish(event) {
  event.preventDefault();
  const file = $('#image-input').files[0];
  $('#editor-message').textContent = '';
  try {
    const preview = await validateFile(file);
    URL.revokeObjectURL(preview);
    const titles = Object.fromEntries(LANGUAGES.map(language => [language, $(`#title-${language}`).value.trim()]));
    if (LANGUAGES.some(language => !titles[language])) throw new Error('Scrivi i titoli nelle tre lingue.');
    if (!state.session) throw new Error('Accedi a GitHub prima di pubblicare.');
    $('#publish').disabled = true;
    $('#publish').textContent = 'Caricamento in corso…';
    const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp';
    const image = base64(new Uint8Array(await file.arrayBuffer()));
    await api('/publish', {
      method: 'POST',
      body: JSON.stringify({ mode: state.editing ? 'replace' : 'add', category: $('#category-input').value, id: state.editing?.id, titles, extension, image })
    });
    $('#editor').close();
    clearPreview();
    message('Foto caricata. La preparazione e la pubblicazione sul sito sono in corso.');
    setTimeout(() => loadCatalog().catch(() => {}), 12000);
    setTimeout(() => loadCatalog().catch(() => {}), 30000);
    setTimeout(() => loadCatalog().catch(() => {}), 60000);
  } catch (error) {
    $('#editor-message').textContent = error.message;
  } finally {
    $('#publish').disabled = false;
    $('#publish').textContent = 'Pubblica la foto';
  }
}

async function init() {
  sessionFromCallback();
  $('#login').addEventListener('click', () => signIn());
  $('#logout').addEventListener('click', () => {
    sessionStorage.removeItem('qubly-gallery-session');
    state.session = null;
    state.login = null;
    showAccess();
    message('Accesso chiuso.');
  });
  for (const tab of document.querySelectorAll('.tab')) tab.addEventListener('click', () => { state.category = tab.dataset.category; $('#search').value = ''; render(); });
  $('#search').addEventListener('input', render);
  $('#add').addEventListener('click', () => openEditor());
  $('#close-editor').addEventListener('click', () => $('#editor').close());
  $('#editor').addEventListener('close', clearPreview);
  $('#image-input').addEventListener('change', event => showFile(event.target.files[0]));
  $('#editor-form').addEventListener('submit', publish);
  const dropzone = $('#dropzone');
  dropzone.addEventListener('dragover', event => { event.preventDefault(); dropzone.classList.add('over'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('over'));
  dropzone.addEventListener('drop', event => {
    event.preventDefault();
    dropzone.classList.remove('over');
    const file = event.dataTransfer.files[0];
    if (file) {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      $('#image-input').files = transfer.files;
      showFile(file);
    }
  });
  try {
    await loadCatalog();
    message('Le foto mostrate corrispondono alla galleria pubblicata.');
  } catch (error) { message(error.message, true); }
  if (state.session) {
    try {
      const session = await api('/session');
      state.login = session.login;
      showAccess();
      const pending = JSON.parse(sessionStorage.getItem('qubly-gallery-pending') || 'null');
      sessionStorage.removeItem('qubly-gallery-pending');
      if (pending && CATEGORIES.includes(pending.category)) {
        state.category = pending.category;
        render();
        if (pending.action === 'add') openEditor();
        else if (pending.action === 'replace') {
          const item = state.catalog?.sections?.[pending.category]?.find(photo => photo.id === pending.id);
          if (item) openEditor(item);
        }
      }
    } catch (error) { state.login = null; showAccess(); message(error.message, true); }
  } else showAccess();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state.catalog) loadCatalog().catch(() => {}); });
  setInterval(() => { if (!document.hidden && !state.saving && !$('#editor').open) loadCatalog().catch(() => {}); }, 45000);
}

init();
