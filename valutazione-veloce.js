(() => {
  "use strict";
  const storageKey = "qubly-quick-review-v1";
  const statuses = {
    confirmed: "Confermata",
    edit: "Da modificare",
    discarded: "Da scartare",
  };
  const $ = (id) => document.getElementById(id);
  const statusButtons = [...document.querySelectorAll("[data-status]")];
  const records = new Map();
  let files = [],
    index = 0,
    imageUrl = null,
    scale = 1,
    panX = 0,
    panY = 0,
    drag = null;
  let storageAvailable = true;
  const validScore = (value) =>
    Number.isInteger(value) && value >= 1 && value <= 100;
  const validRecord = (record) =>
    record &&
    typeof record.filename === "string" &&
    record.filename.length > 0 &&
    (record.status === null || Object.hasOwn(statuses, record.status)) &&
    (record.score === null || validScore(record.score)) &&
    typeof record.comment === "string" &&
    record.comment.length <= 10000 &&
    typeof record.updatedAt === "string" &&
    Number.isFinite(Date.parse(record.updatedAt));
  const complete = (record) =>
    Boolean(
      record &&
      Object.hasOwn(statuses, record.status) &&
      validScore(record.score),
    );
  const currentFile = () => files[index];
  const currentRecord = () => records.get(currentFile()?.name);

  function notify(message) {
    $("notice").textContent = message;
    $("notice").hidden = !message;
  }

  function storageWarning(message) {
    storageAvailable = false;
    $("storageWarning").textContent = message;
    $("storageWarning").hidden = false;
  }

  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const data = JSON.parse(raw);
      if (
        data.version !== 1 ||
        !Array.isArray(data.reviews) ||
        !data.reviews.every(validRecord)
      )
        throw new Error("Invalid archive");
      data.reviews.forEach((record) => records.set(record.filename, record));
    }
  } catch {
    storageWarning(
      "Non è possibile leggere i voti salvati. Per conservare questa sessione scarica un backup JSON prima di chiudere.",
    );
  }

  function archive() {
    return {
      version: 1,
      tool: "qubly-quick-review",
      exportedAt: new Date().toISOString(),
      reviews: [...records.values()],
    };
  }

  function persist() {
    // Keep the in-memory review usable even when storage is blocked or full.
    if (!storageAvailable) return false;
    try {
      localStorage.setItem(storageKey, JSON.stringify(archive()));
      return true;
    } catch {
      storageWarning(
        "Salvataggio nel browser non disponibile o spazio esaurito. I voti restano in questa sessione: scarica il backup JSON prima di chiudere.",
      );
      return false;
    }
  }

  function updateProgress() {
    const counts = { confirmed: 0, edit: 0, discarded: 0 };
    let done = 0;
    files.forEach((file, i) => {
      const record = records.get(file.name);
      if (complete(record)) {
        done++;
        counts[record.status]++;
      }
      if ($("jump").options[i])
        $("jump").options[i].textContent =
          `${complete(record) ? "✓" : "○"} ${i + 1}. ${file.name}`;
    });
    $("progress").max = files.length || 1;
    $("progress").value = done;
    $("progressText").textContent = `${done} di ${files.length}`;
    $("summary").textContent = files.length
      ? `${counts.confirmed} confermate · ${counts.edit} da modificare · ${counts.discarded} da scartare`
      : "In attesa di immagini";
    $("nextPending").disabled = !files.some(
      (file) => !complete(records.get(file.name)),
    );
    $("exportCsv").disabled = !files.length;
    $("exportJson").disabled = !records.size;
  }

  function save(patch) {
    if (!currentFile()) return;
    const record = {
      filename: currentFile().name,
      status: null,
      score: null,
      comment: "",
      ...currentRecord(),
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    records.set(record.filename, record);
    const saved = persist();
    $("saveState").textContent = saved
      ? complete(record)
        ? "✓ Valutazione salvata in questo browser."
        : "Bozza salvata. Completa esito e voto."
      : "Voto in memoria. Scarica il backup per conservarlo.";
    updateProgress();
  }

  function renderStatus() {
    statusButtons.forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.status === currentRecord()?.status),
      ),
    );
    $("comment").placeholder =
      currentRecord()?.status === "edit"
        ? "Descrivi le modifiche da apportare…"
        : "Cosa funziona? Cosa cambieresti?";
  }

  function selectStatus(status) {
    save({ status });
    renderStatus();
  }

  function transform() {
    $("preview").style.transform =
      `translate(${panX}px, ${panY}px) scale(${scale})`;
    const width = $("preview").clientWidth;
    $("zoomLabel").textContent =
      scale === 1
        ? "Adatta"
        : width
          ? `${Math.round(((width * scale) / $("preview").naturalWidth) * 100)}%`
          : "Adatta";
  }

  function fit() {
    scale = 1;
    panX = 0;
    panY = 0;
    transform();
  }
  function zoom(value) {
    scale = Math.min(30, Math.max(1, value));
    if (scale === 1) panX = panY = 0;
    transform();
  }

  function renderImage() {
    const file = currentFile();
    if (!file) return;
    const record = currentRecord();
    $("emptyState").hidden = true;
    $("imageError").hidden = true;
    $("preview").hidden = true;
    $("filename").textContent = file.name;
    $("filename").title = file.name;
    $("collection").textContent =
      file.webkitRelativePath?.split("/")[0] || "IMMAGINI LOCALI";
    const path = file.webkitRelativePath || file.name;
    $("fileMeta").textContent =
      `${path} · ${(file.size / 1024 / 1024).toLocaleString("it-IT", { maximumFractionDigits: 2 })} MB`;
    $("counter").textContent = `${index + 1} / ${files.length}`;
    $("jump").value = String(index);
    $("previous").disabled = index === 0;
    $("next").disabled = index === files.length - 1;
    $("saveNext").textContent =
      index === files.length - 1 ? "Salva e termina ✓" : "Salva e successiva →";
    $("reviewFields").disabled = false;
    $("score").value = record?.score ?? "";
    $("score").removeAttribute("aria-invalid");
    $("scoreRange").value = record?.score ?? 50;
    $("scoreRange").setAttribute(
      "aria-valuetext",
      record?.score ? `${record.score} su 100` : "Voto non ancora assegnato",
    );
    $("scoreHint").textContent = record?.score
      ? "Puoi modificare il voto in ogni momento."
      : "Scegli un voto da 1 a 100.";
    $("comment").value = record?.comment || "";
    $("saveState").textContent = record
      ? complete(record)
        ? "✓ Valutazione ritrovata per questo nome file."
        : "Bozza ritrovata. Completa esito e voto."
      : "I voti si salvano automaticamente.";
    if (!storageAvailable)
      $("saveState").textContent =
        "Salvataggio solo in memoria. Scarica il backup.";
    renderStatus();
    ["zoomIn", "zoomOut", "fit", "actualSize"].forEach(
      (id) => ($(id).disabled = true),
    );
    $("preview").removeAttribute("src");
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = URL.createObjectURL(file);
    const expectedUrl = imageUrl;
    $("preview").onload = () => {
      if (imageUrl !== expectedUrl || !$("preview").naturalWidth) return;
      $("preview").hidden = false;
      $("imageError").hidden = true;
      $("fileMeta").textContent +=
        ` · ${$("preview").naturalWidth} × ${$("preview").naturalHeight} px`;
      ["zoomIn", "zoomOut", "fit", "actualSize"].forEach(
        (id) => ($(id).disabled = false),
      );
      fit();
    };
    $("preview").onerror = () => {
      if (imageUrl !== expectedUrl) return;
      $("preview").hidden = true;
      $("imageError").hidden = false;
    };
    fit();
    $("preview").src = imageUrl;
  }

  function loadFiles(selected) {
    const images = [...selected].filter(
      (file) =>
        file.type.startsWith("image/") ||
        /\.(png|jpe?g|webp|avif|gif|bmp|svg|ico|heic|heif|tiff?)$/i.test(
          file.name,
        ),
    );
    if (!images.length) {
      notify(
        "Nessuna immagine trovata. Scegli una cartella con immagini oppure seleziona i singoli file.",
      );
      return;
    }
    files = images.sort(
      (a, b) =>
        a.name.localeCompare(b.name, "it", { numeric: true }) ||
        (a.webkitRelativePath || "").localeCompare(b.webkitRelativePath || ""),
    );
    index = 0;
    const fragment = document.createDocumentFragment();
    files.forEach((file, i) => {
      const option = document.createElement("option");
      option.value = String(i);
      option.textContent = file.name;
      fragment.append(option);
    });
    $("jump").replaceChildren(fragment);
    $("jump").disabled = false;
    const restored = files.filter((file) => records.has(file.name)).length;
    const duplicates =
      files.length - new Set(files.map((file) => file.name)).size;
    const skipped = selected.length - images.length;
    notify(
      `${files.length} ${files.length === 1 ? "immagine aperta" : "immagini aperte"} · ${restored} ${restored === 1 ? "valutazione ritrovata" : "valutazioni ritrovate"}.${skipped ? ` ${skipped} file non immagine ignorati.` : ""}${duplicates ? ` Attenzione: ${duplicates} file hanno nomi duplicati e condividono la stessa valutazione, anche in sottocartelle diverse.` : ""}`,
    );
    updateProgress();
    renderImage();
  }

  function move(delta) {
    const next = index + delta;
    if (next < 0 || next >= files.length) return;
    index = next;
    renderImage();
  }

  function saveNext() {
    if (!currentFile()) return;
    if (!complete(currentRecord())) {
      $("saveState").textContent =
        "Scegli un esito e un voto intero da 1 a 100 per completare la valutazione.";
      if (!currentRecord()?.status) statusButtons[0].focus();
      else $("score").focus();
      return;
    }
    if (index < files.length - 1) move(1);
    else {
      const remaining = files.filter(
        (file) => !complete(records.get(file.name)),
      ).length;
      notify(
        remaining
          ? `Ultima immagine salvata. Restano ${remaining} immagini da completare: usa “Prossima da valutare”.`
          : "Revisione completata. Puoi esportare il riepilogo e il backup dei voti.",
      );
    }
  }

  function download(content, type, extension) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `qubly-valutazioni-${new Date().toISOString().slice(0, 10)}.${extension}`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Quote every CSV cell and neutralize spreadsheet formulas in filenames/comments.
  function csvCell(value) {
    let text = String(value ?? "");
    if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  $("exportCsv").addEventListener("click", () => {
    const rows = [
      [
        "Nome file",
        "Percorso relativo",
        "Esito",
        "Voto (1-100)",
        "Commento",
        "Valutazione completa",
        "Ultimo aggiornamento",
      ],
    ];
    files.forEach((file) => {
      const record = records.get(file.name);
      rows.push([
        file.name,
        file.webkitRelativePath || file.name,
        statuses[record?.status] || "Da valutare",
        record?.score ?? "",
        record?.comment || "",
        complete(record) ? "Sì" : "No",
        record?.updatedAt || "",
      ]);
    });
    download(
      "\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n"),
      "text/csv;charset=utf-8",
      "csv",
    );
  });
  $("exportJson").addEventListener("click", () =>
    download(JSON.stringify(archive(), null, 2), "application/json", "json"),
  );
  $("importButton").addEventListener("click", () => $("importInput").click());
  $("importInput").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("Too large");
      const data = JSON.parse(await file.text());
      if (
        data.version !== 1 ||
        data.tool !== "qubly-quick-review" ||
        !Array.isArray(data.reviews) ||
        !data.reviews.every(validRecord)
      )
        throw new Error("Invalid backup");
      let imported = 0;
      data.reviews.forEach((record) => {
        const existing = records.get(record.filename);
        if (
          !existing ||
          Date.parse(record.updatedAt) > Date.parse(existing.updatedAt)
        ) {
          records.set(record.filename, {
            filename: record.filename,
            status: record.status,
            score: record.score,
            comment: record.comment,
            updatedAt: record.updatedAt,
          });
          imported++;
        }
      });
      persist();
      updateProgress();
      renderImage();
      notify(
        `${imported} valutazioni importate. Per i nomi già presenti viene mantenuta la valutazione più recente. Apri le immagini per ritrovarle.`,
      );
    } catch {
      notify(
        "Backup non valido: scegli un file JSON esportato da Valutazione veloce (massimo 20 MB). I voti esistenti sono conservati.",
      );
    }
  });

  ["folderButton", "emptyFolderButton"].forEach((id) =>
    $(id).addEventListener("click", () => $("folderInput").click()),
  );
  $("filesButton").addEventListener("click", () => $("filesInput").click());
  ["folderInput", "filesInput"].forEach((id) =>
    $(id).addEventListener("change", (event) => {
      if (event.target.files.length) loadFiles(event.target.files);
      event.target.value = ""; // Allow choosing the same folder again.
    }),
  );
  statusButtons.forEach((button) =>
    button.addEventListener("click", () => selectStatus(button.dataset.status)),
  );
  $("score").addEventListener("input", () => {
    const value = $("score").value === "" ? null : Number($("score").value);
    const valid = validScore(value);
    $("score").setAttribute("aria-invalid", String(value !== null && !valid));
    $("scoreHint").textContent =
      value !== null && !valid
        ? "Inserisci un numero intero da 1 a 100."
        : "Scegli un voto da 1 a 100.";
    if (valid) $("scoreRange").value = value;
    $("scoreRange").setAttribute(
      "aria-valuetext",
      valid ? `${value} su 100` : "Voto non ancora assegnato",
    );
    save({ score: valid ? value : null });
  });
  function saveRangeScore() {
    const score = Number($("scoreRange").value);
    $("score").value = score;
    $("score").removeAttribute("aria-invalid");
    $("scoreRange").setAttribute("aria-valuetext", `${score} su 100`);
    $("scoreHint").textContent = "Puoi modificare il voto in ogni momento.";
    save({ score });
  }
  $("scoreRange").addEventListener("input", saveRangeScore);
  // A click on the initial thumb is also an explicit choice of that score.
  $("scoreRange").addEventListener("pointerup", () => {
    if (!validScore(currentRecord()?.score)) saveRangeScore();
  });
  $("comment").addEventListener("input", () =>
    save({ comment: $("comment").value }),
  );
  $("previous").addEventListener("click", () => move(-1));
  $("next").addEventListener("click", () => move(1));
  $("saveNext").addEventListener("click", saveNext);
  $("jump").addEventListener("change", () => {
    index = Number($("jump").value);
    renderImage();
  });
  $("nextPending").addEventListener("click", () => {
    for (let offset = 1; offset <= files.length; offset++) {
      const candidate = (index + offset) % files.length;
      if (!complete(records.get(files[candidate].name))) {
        index = candidate;
        renderImage();
        break;
      }
    }
  });
  $("fit").addEventListener("click", fit);
  $("zoomIn").addEventListener("click", () => zoom(scale * 1.3));
  $("zoomOut").addEventListener("click", () => zoom(scale / 1.3));
  $("actualSize").addEventListener("click", () => {
    panX = panY = 0;
    zoom($("preview").naturalWidth / $("preview").clientWidth);
  });
  $("stage").addEventListener(
    "wheel",
    (event) => {
      if ($("preview").hidden) return;
      event.preventDefault();
      zoom(scale * (event.deltaY < 0 ? 1.12 : 1 / 1.12));
    },
    { passive: false },
  );
  $("preview").addEventListener("dblclick", fit);
  $("preview").addEventListener("pointerdown", (event) => {
    if (scale <= 1 || event.button !== 0) return;
    drag = { x: event.clientX - panX, y: event.clientY - panY };
    $("preview").setPointerCapture(event.pointerId);
    $("preview").classList.add("dragging");
  });
  $("preview").addEventListener("pointermove", (event) => {
    if (!drag) return;
    panX = event.clientX - drag.x;
    panY = event.clientY - drag.y;
    transform();
  });
  ["pointerup", "pointercancel", "lostpointercapture"].forEach((name) =>
    $("preview").addEventListener(name, () => {
      drag = null;
      $("preview").classList.remove("dragging");
    }),
  );
  $("fullscreen").hidden = !document.fullscreenEnabled;
  $("fullscreen").addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await $("workspace").requestFullscreen();
    } catch {
      notify("Il browser non consente lo schermo intero in questa finestra.");
    }
  });
  document.addEventListener("fullscreenchange", () => {
    $("fullscreen").textContent = document.fullscreenElement
      ? "⛶ Esci da schermo intero"
      : "⛶ Schermo intero";
    fit();
  });
  window.addEventListener("resize", fit);
  document.addEventListener("keydown", (event) => {
    if (!files.length || event.ctrlKey || event.metaKey || event.altKey) return;
    if (
      event.key === "Enter" &&
      (event.target.id === "score" || event.target.closest("[data-status]"))
    ) {
      event.preventDefault();
      saveNext();
      return;
    }
    if (event.target.closest("input,textarea,select,[contenteditable=true]"))
      return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      move(1);
    } else if (
      event.key === "Enter" &&
      event.target.tagName !== "BUTTON" &&
      event.target.tagName !== "A"
    ) {
      event.preventDefault();
      saveNext();
    } else if (
      { c: "confirmed", m: "edit", x: "discarded" }[event.key.toLowerCase()]
    ) {
      event.preventDefault();
      selectStatus(
        { c: "confirmed", m: "edit", x: "discarded" }[event.key.toLowerCase()],
      );
    }
  });
  window.addEventListener("pagehide", () => {
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
      imageUrl = null;
    }
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && files.length) renderImage();
  });
  updateProgress();
})();
