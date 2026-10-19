const API = ['localhost', '127.0.0.1'].includes(location.hostname) ? `${location.origin}/api/gallery` : 'https://qubly.studio/api/gallery';
const SITE = 'https://qubly.studio/';
const LANGUAGES = ['it', 'en', 'sl'];
const CATEGORIES = ['esterni', 'interni', 'paesaggi'];
const READ_TIMEOUT_MS = 20_000;
// A 10 MB upload and its repository writes need more time than catalog reads.
const PUBLISH_TIMEOUT_MS = 90_000;
const FILE_TIMEOUT_MS = 15_000;
const $ = selector => document.querySelector(selector);
const state = {
  category: 'esterni', catalog: null, session: sessionStorage.getItem('qubly-gallery-session'),
  login: null, editing: null, removing: null, saving: false, dragId: null, previewUrl: null,
  catalogLoading: false, catalogRevision: 0, previewRevision: 0
};

class DeadlineError extends Error {}

async function withDeadline(operation, milliseconds, timeoutMessage, onTimeout) {
  let timer;
  try {
    return await Promise.race([
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new DeadlineError(timeoutMessage));
          onTimeout?.();
        }, milliseconds);
      }),
      Promise.resolve().then(operation)
    ]);
  } finally {
    clearTimeout(timer);
  }
}

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
  const requestedSession = state.session;
  if (requestedSession) headers.Authorization = `Bearer ${requestedSession}`;
  const writing = !['GET', 'HEAD'].includes((options.method || 'GET').toUpperCase());
  const uncertain = 'L’esito dell’operazione non è confermato. Verifica la galleria prima di riprovare.';
  const controller = new AbortController();
  return withDeadline(async () => {
    let response;
    try {
      response = await fetch(`${API}${path}`, { cache: 'no-store', ...options, headers, signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) throw error;
      throw new Error(writing ? `La connessione si è interrotta. ${uncertain}` : 'Non riesco a collegarmi alla galleria. Riprova tra poco.');
    }
    if (controller.signal.aborted) throw new DeadlineError('La richiesta è scaduta.');
    const result = await response.json().catch(error => {
      if (controller.signal.aborted) throw error;
      if (response.ok) throw new Error(writing ? `Risposta non valida. ${uncertain}` : 'La galleria ha restituito una risposta non valida. Riprova.');
      return {};
    });
    if (controller.signal.aborted) throw new DeadlineError('La richiesta è scaduta.');
    if (!response.ok) {
      if (response.status === 401 && state.session === requestedSession) {
        state.session = null;
        state.login = null;
        sessionStorage.removeItem('qubly-gallery-session');
        showAccess();
      }
      throw new Error(result?.code === 'publication_unknown' ? uncertain : result?.error || 'Operazione non riuscita. Riprova.');
    }
    return result;
  }, writing ? PUBLISH_TIMEOUT_MS : READ_TIMEOUT_MS,
  writing ? `Tempo di attesa esaurito. ${uncertain}` : 'La galleria non ha risposto in tempo. Riprova.',
  () => controller.abort());
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
  $('#add').disabled = state.saving || !state.catalog;
  $('#login').disabled = state.saving;
  $('#logout').disabled = state.saving;
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
    replace.disabled = state.saving;
    replace.setAttribute('aria-label', `Sostituisci ${titleOf(item)}`);
    replace.addEventListener('click', () => openEditor(item));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    remove.textContent = 'Rimuovi';
    remove.disabled = state.saving;
    remove.setAttribute('aria-label', `Rimuovi ${titleOf(item)}`);
    remove.addEventListener('click', () => openRemoval(item));
    const handle = document.createElement('span');
    handle.className = 'icon-button drag-handle';
    handle.textContent = '⠿';
    handle.setAttribute('aria-hidden', 'true');
    actions.append(moveUp, moveDown, replace, remove, handle);
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
  if (state.saving || state.catalogLoading) return false;
  const revision = state.catalogRevision;
  state.catalogLoading = true;
  $('#retry-catalog').disabled = true;
  if (!state.catalog) $('#count').textContent = 'Caricamento…';
  try {
    const catalog = await api('/catalog');
    if (catalog?.version !== 1 || !catalog.sections || CATEGORIES.some(category => !Array.isArray(catalog.sections[category]))) throw new Error('Catalogo non disponibile.');
    // Discard a read started before a local edit, even if that edit has finished.
    if (state.saving || revision !== state.catalogRevision) return false;
    state.catalog = catalog;
    $('#retry-catalog').hidden = true;
    render();
    resumePending();
    return true;
  } catch (error) {
    if (state.saving || revision !== state.catalogRevision) return false;
    if (!state.catalog) $('#count').textContent = 'Catalogo non disponibile';
    $('#retry-catalog').hidden = false;
    message(error.message, true);
    throw error;
  } finally {
    state.catalogLoading = false;
    $('#retry-catalog').disabled = false;
  }
}

async function move(id, direction) {
  if (state.saving || !state.catalog) return;
  if (!requireAccess({ action: 'reorder', category: state.category })) return;
  const items = state.catalog.sections[state.category];
  const from = items.findIndex(item => item.id === id);
  const to = from + direction;
  if (to < 0 || to >= items.length) return;
  await reorder(from, to);
}

async function moveTo(sourceId, targetId) {
  if (state.saving || !state.catalog) return;
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
  state.catalogRevision++;
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
  state.previewRevision++;
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = null;
  $('#upload-preview').hidden = true;
  $('#upload-preview').removeAttribute('src');
  $('#file-label').textContent = 'Scegli una foto o trascinala qui';
}

function openEditor(item = null) {
  if (state.saving || !state.catalog) return;
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

function openRemoval(item) {
  if (state.saving || !state.catalog) return;
  if (!requireAccess({ action: 'remove', category: state.category, id: item.id })) return;
  state.removing = { category: state.category, id: item.id };
  $('#remove-preview').src = imageUrl(item.preview);
  $('#remove-preview').alt = titleOf(item);
  $('#remove-name').textContent = titleOf(item);
  $('#remove-message').textContent = '';
  $('#confirm-remove').disabled = false;
  $('#confirm-remove').textContent = 'Rimuovi la foto';
  $('#remove-dialog').showModal();
  $('#cancel-remove').focus();
}

async function confirmRemoval() {
  if (state.saving || !state.removing) return;
  const { category, id } = state.removing;
  state.saving = true;
  state.catalogRevision++;
  render();
  $('#confirm-remove').disabled = true;
  $('#cancel-remove').disabled = true;
  $('#close-remove').disabled = true;
  $('#confirm-remove').textContent = 'Rimozione in corso…';
  $('#remove-message').textContent = '';
  try {
    await api('/publish', { method: 'POST', body: JSON.stringify({ mode: 'remove', category, id }) });
    state.catalog.sections[category] = state.catalog.sections[category].filter(item => item.id !== id);
    state.removing = null;
    $('#remove-dialog').close();
    message('Foto rimossa dal catalogo. Il sito si aggiorna tra poco.');
  } catch (error) {
    $('#remove-message').textContent = error.message;
  } finally {
    state.saving = false;
    $('#confirm-remove').disabled = false;
    $('#cancel-remove').disabled = false;
    $('#close-remove').disabled = false;
    $('#confirm-remove').textContent = 'Rimuovi la foto';
    render();
  }
}

async function validateFile(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Scegli una foto JPG, PNG o WebP.');
  if (file.size > 10 * 1024 * 1024) throw new Error('La foto supera 10 MB. Scegline una più leggera.');
  const url = URL.createObjectURL(file);
  let image;
  try {
    const dimensions = await withDeadline(() => new Promise((resolve, reject) => {
      image = new Image();
      image.onload = () => resolve([image.naturalWidth, image.naturalHeight]);
      image.onerror = () => reject(new Error('Immagine non valida'));
      image.src = url;
    }), FILE_TIMEOUT_MS, 'La verifica della foto ha impiegato troppo tempo. Sceglila di nuovo e riprova.');
    if (dimensions[0] < 640 || dimensions[1] < 400 || dimensions[0] * dimensions[1] > 50_000_000) {
      throw new Error('Usa una foto di almeno 640 × 400 px e massimo 50 megapixel.');
    }
    return url;
  } catch (error) {
    URL.revokeObjectURL(url);
    if (error instanceof DeadlineError || (error instanceof Error && error.message.startsWith('Usa una foto'))) throw error;
    throw new Error('Il file non sembra essere una foto valida.');
  } finally {
    if (image) {
      image.onload = null;
      image.onerror = null;
      image.removeAttribute('src');
    }
  }
}

async function showFile(file) {
  if (state.saving) return;
  $('#editor-message').textContent = '';
  clearPreview();
  const revision = state.previewRevision;
  try {
    const url = await validateFile(file);
    if (revision !== state.previewRevision || state.saving || !$('#editor').open) {
      URL.revokeObjectURL(url);
      return;
    }
    state.previewUrl = url;
    $('#upload-preview').src = state.previewUrl;
    $('#upload-preview').hidden = false;
    $('#file-label').textContent = file.name;
  } catch (error) {
    if (revision !== state.previewRevision || state.saving || !$('#editor').open) return;
    $('#image-input').value = '';
    $('#editor-message').textContent = error.message;
  }
}

function setEditorBusy(busy) {
  for (const selector of ['#publish', '#close-editor', '#image-input', '#category-input', ...LANGUAGES.map(language => `#title-${language}`)]) {
    $(selector).disabled = busy;
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
  if (state.saving) return;
  const file = $('#image-input').files[0];
  const titles = Object.fromEntries(LANGUAGES.map(language => [language, $(`#title-${language}`).value.trim()]));
  const category = $('#category-input').value;
  const id = state.editing?.id;
  const mode = state.editing ? 'replace' : 'add';
  state.saving = true;
  state.catalogRevision++;
  setEditorBusy(true);
  render();
  $('#editor-message').textContent = '';
  try {
    if (LANGUAGES.some(language => !titles[language])) throw new Error('Scrivi i titoli nelle tre lingue.');
    if (!state.session) throw new Error('Accedi a GitHub prima di pubblicare.');
    $('#publish').textContent = 'Controllo della foto…';
    const preview = await validateFile(file);
    URL.revokeObjectURL(preview);
    $('#publish').textContent = 'Lettura della foto…';
    const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp';
    const bytes = await withDeadline(() => file.arrayBuffer(), FILE_TIMEOUT_MS, 'La lettura della foto ha impiegato troppo tempo. Sceglila di nuovo e riprova.');
    const image = base64(new Uint8Array(bytes));
    $('#publish').textContent = 'Caricamento in corso…';
    await api('/publish', {
      method: 'POST',
      body: JSON.stringify({ mode, category, id, titles, extension, image })
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
    state.saving = false;
    setEditorBusy(false);
    $('#publish').textContent = 'Pubblica la foto';
    render();
  }
}

function resumePending() {
  if (!state.catalog || !state.session || !state.login || state.saving) return;
  let pending;
  try { pending = JSON.parse(sessionStorage.getItem('qubly-gallery-pending') || 'null'); }
  catch { sessionStorage.removeItem('qubly-gallery-pending'); return; }
  sessionStorage.removeItem('qubly-gallery-pending');
  if (!pending || !CATEGORIES.includes(pending.category)) return;
  state.category = pending.category;
  render();
  if (pending.action === 'add') openEditor();
  else {
    const item = state.catalog.sections[pending.category].find(photo => photo.id === pending.id);
    if (item && pending.action === 'replace') openEditor(item);
    else if (item && pending.action === 'remove') openRemoval(item);
  }
}

async function init() {
  sessionFromCallback();
  $('#login').addEventListener('click', () => signIn());
  $('#logout').addEventListener('click', () => {
    if (state.saving) return;
    sessionStorage.removeItem('qubly-gallery-session');
    state.session = null;
    state.login = null;
    showAccess();
    message('Accesso chiuso.');
  });
  for (const tab of document.querySelectorAll('.tab')) tab.addEventListener('click', () => { if (state.saving) return; state.category = tab.dataset.category; $('#search').value = ''; render(); });
  $('#search').addEventListener('input', render);
  $('#add').addEventListener('click', () => openEditor());
  $('#close-editor').addEventListener('click', () => { if (!state.saving) $('#editor').close(); });
  $('#editor').addEventListener('close', () => { state.editing = null; clearPreview(); });
  $('#editor').addEventListener('cancel', event => { if (state.saving) event.preventDefault(); });
  $('#retry-catalog').addEventListener('click', () => {
    loadCatalog().then(loaded => { if (loaded) message('Galleria caricata.'); }).catch(() => {});
  });
  $('#close-remove').addEventListener('click', () => $('#remove-dialog').close());
  $('#cancel-remove').addEventListener('click', () => $('#remove-dialog').close());
  $('#confirm-remove').addEventListener('click', confirmRemoval);
  $('#remove-dialog').addEventListener('close', () => { state.removing = null; $('#remove-preview').removeAttribute('src'); });
  $('#remove-dialog').addEventListener('cancel', event => { if (state.saving) event.preventDefault(); });
  $('#image-input').addEventListener('change', event => showFile(event.target.files[0]));
  $('#editor-form').addEventListener('submit', publish);
  const dropzone = $('#dropzone');
  dropzone.addEventListener('dragover', event => { event.preventDefault(); dropzone.classList.add('over'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('over'));
  dropzone.addEventListener('drop', event => {
    event.preventDefault();
    dropzone.classList.remove('over');
    if (state.saving) return;
    const file = event.dataTransfer.files[0];
    if (file) {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      $('#image-input').files = transfer.files;
      showFile(file);
    }
  });
  render();
  const catalogTask = loadCatalog().then(loaded => {
    if (loaded) message('Le foto mostrate corrispondono alla galleria pubblicata.');
  }).catch(() => {});
  const sessionTask = (async () => {
    if (!state.session) { showAccess(); return; }
    const requestedSession = state.session;
    try {
      const session = await api('/session');
      if (state.session !== requestedSession) return;
      state.login = session.login;
      showAccess();
      resumePending();
    } catch (error) {
      if (state.session && state.session !== requestedSession) return;
      state.login = null;
      showAccess();
      message(error.message, true);
    }
  })();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state.catalog) loadCatalog().catch(() => {}); });
  setInterval(() => { if (!document.hidden && !state.saving && !$('#editor').open) loadCatalog().catch(() => {}); }, 45000);
  await Promise.allSettled([catalogTask, sessionTask]);
}

init();
