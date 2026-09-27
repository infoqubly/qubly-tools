/* Shared, temporary drag-and-drop reader for the three image tools. */
window.QublyLocalDrop = (() => {
  "use strict";

  const relativePaths = new WeakMap();
  const relativePath = (file) =>
    relativePaths.get(file) || file.webkitRelativePath || file.name;

  function remember(file, path) {
    relativePaths.set(file, path);
    return file;
  }

  function entryFile(entry) {
    return new Promise((resolve, reject) => entry.file(resolve, reject));
  }

  function entryBatch(reader) {
    return new Promise((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
  }

  async function walkEntry(entry, parent = "") {
    const path = parent ? `${parent}/${entry.name}` : entry.name;
    if (entry.isFile) return [remember(await entryFile(entry), path)];
    if (!entry.isDirectory) return [];
    const reader = entry.createReader();
    const files = [];
    // Chromium returns directory entries in batches, often capped at 100.
    while (true) {
      const batch = await entryBatch(reader);
      if (!batch.length) break;
      for (const child of batch) files.push(...(await walkEntry(child, path)));
    }
    return files;
  }

  async function walkHandle(handle, parent = "") {
    const path = parent ? `${parent}/${handle.name}` : handle.name;
    if (handle.kind === "file") return [remember(await handle.getFile(), path)];
    if (handle.kind !== "directory") return [];
    const files = [];
    for await (const child of handle.values())
      files.push(...(await walkHandle(child, path)));
    return files;
  }

  async function readFiles(dataTransfer) {
    // Capture entries/handles in the synchronous drop turn: some browsers clear
    // DataTransfer after the event handler returns.
    const items = Array.from(dataTransfer.items || []).filter(
      (item) => item.kind === "file",
    );
    const sources = items.map((item) => {
      let entry = null;
      try {
        entry = item.webkitGetAsEntry?.();
      } catch {
        /* Use the next browser API. */
      }
      if (entry) return { entry };
      let handle = null;
      try {
        handle = item.getAsFileSystemHandle?.();
      } catch {
        /* Use the file fallback. */
      }
      return { handle, file: item.getAsFile() };
    });
    const fallback = Array.from(dataTransfer.files || []);
    if (!sources.length) return fallback;
    const files = [];
    for (const source of sources) {
      if (source.entry) files.push(...(await walkEntry(source.entry)));
      else if (source.handle) {
        const handle = await Promise.resolve(source.handle).catch(() => null);
        if (handle) files.push(...(await walkHandle(handle)));
        else if (source.file) files.push(source.file);
      } else if (source.file) files.push(source.file);
    }
    return files.length ? files : fallback;
  }

  function attach({ onFiles, onError, enabled = () => true }) {
    const style = document.createElement("style");
    style.textContent = `
      .qubly-drop-overlay{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;
        pointer-events:none;background:rgba(6,10,14,.78);backdrop-filter:blur(5px);border:5px dashed #f0b85a}
      .qubly-drop-overlay[hidden]{display:none!important}
      .qubly-drop-message{text-align:center;max-width:min(480px,90vw);padding:32px;
        border:1px solid #f0b85a88;border-radius:18px;background:#151a20;color:#f7f1e8;
        box-shadow:0 20px 80px #0009;font:16px Inter,"Segoe UI",Arial,sans-serif}
      .qubly-drop-message strong{display:block;margin:10px 0;font-size:clamp(21px,4vw,34px)}
      .qubly-drop-message span{font-size:40px;color:#f0b85a}
      .qubly-drop-message p{margin:0;color:#aeb8c3;font-size:13px;line-height:1.5}`;
    document.head.append(style);
    const overlay = document.createElement("div");
    overlay.className = "qubly-drop-overlay";
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML =
      '<div class="qubly-drop-message"><span>↓</span><strong>Rilascia immagini o cartelle</strong><p>Le immagini restano sul tuo computer.</p></div>';
    document.body.append(overlay);
    let depth = 0;
    const isFileDrag = (event) =>
      Array.from(event.dataTransfer?.types || []).includes("Files");
    const hide = () => {
      depth = 0;
      overlay.hidden = true;
    };
    document.addEventListener("dragenter", (event) => {
      if (!enabled() || !isFileDrag(event)) return;
      event.preventDefault();
      depth++;
      overlay.hidden = false;
    });
    document.addEventListener("dragover", (event) => {
      if (!enabled() || !isFileDrag(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      overlay.hidden = false;
    });
    document.addEventListener("dragleave", (event) => {
      if (!enabled() || !isFileDrag(event)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) overlay.hidden = true;
    });
    document.addEventListener("drop", async (event) => {
      if (!enabled() || !isFileDrag(event)) return;
      event.preventDefault();
      const target = event.target;
      hide();
      try {
        const files = await readFiles(event.dataTransfer);
        if (files.length) onFiles(files, target);
        else
          onError?.(
            "Nessun file leggibile. Se il browser non supporta il trascinamento delle cartelle, usa “Apri cartella”.",
          );
      } catch {
        onError?.(
          "Impossibile leggere la cartella trascinata. Prova con “Apri cartella”.",
        );
      }
    });
    window.addEventListener("dragend", hide);
    window.addEventListener("blur", hide);
  }

  return { attach, readFiles, relativePath };
})();
