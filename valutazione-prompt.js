(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const storageKey = "qubly-prompt-review-v1";
  const fresh = () => ({
    version: 1,
    subjects: [],
    models: [],
    voters: [{ id: "voter-1", name: "Valutatore 1" }],
    assignments: {},
    ratings: {},
  });
  const state = (() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (
        saved?.version === 1 &&
        Array.isArray(saved.subjects) &&
        Array.isArray(saved.models) &&
        Array.isArray(saved.voters) &&
        saved.assignments &&
        saved.ratings
      )
        return saved;
    } catch {
      /* Keep this session available when storage is blocked. */
    }
    return fresh();
  })();
  const loaded = new Map();
  const urls = new Map();
  const selected = new Set();
  let subjectId = null,
    variantKey = null,
    voterId = state.voters[0]?.id || null;
  let activeTab = "organize";
  const imageFile = (file) =>
    file.type.startsWith("image/") ||
    /\.(png|jpe?g|webp|avif|gif|bmp|svg|ico|heic|heif|tiff?)$/i.test(file.name);
  const keyOf = (file) => QublyLocalDrop.relativePath(file);
  const nameOf = (list, id) => list.find((item) => item.id === id)?.name || "—";
  const assignment = (key) => state.assignments[key] || {};
  const ready = (key) => {
    const item = assignment(key);
    return Boolean(
      item.subjectId && (item.role === "original" || item.modelId),
    );
  };
  const rated = (key) =>
    Object.values(state.ratings[key] || {}).filter(
      (vote) =>
        Number.isInteger(vote.score) && vote.score >= 1 && vote.score <= 100,
    );
  const average = (values) =>
    values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  const imageAverage = (key) => average(rated(key).map((vote) => vote.score));
  const round = (value) =>
    value === null
      ? "—"
      : value.toLocaleString("it-IT", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        });
  const newId = () =>
    crypto.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  function notify(message) {
    $("notice").textContent = message;
    $("notice").hidden = !message;
  }
  function persist() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      notify(
        "Salvataggio del browser non disponibile. Scarica il progetto JSON prima di chiudere questa pagina.",
      );
    }
  }
  function fileUrl(key) {
    if (!loaded.has(key)) return "";
    if (!urls.has(key)) urls.set(key, URL.createObjectURL(loaded.get(key)));
    return urls.get(key);
  }
  function clearUrls() {
    urls.forEach((url) => URL.revokeObjectURL(url));
    urls.clear();
  }

  function openFiles(list, append = false) {
    const images = [...list].filter(imageFile);
    if (!images.length) {
      notify(
        "Nessuna immagine trovata. Apri una cartella o seleziona file PNG, JPG, WebP e altri formati immagine.",
      );
      return;
    }
    const collection = append ? [...loaded.values(), ...images] : images;
    clearUrls();
    loaded.clear();
    selected.clear();
    collection
      .sort((a, b) => keyOf(a).localeCompare(keyOf(b), "it", { numeric: true }))
      .forEach((file) => loaded.set(keyOf(file), file));
    const duplicateCount = collection.length - loaded.size;
    $("fileCount").textContent = `${loaded.size} immagini`;
    notify(
      `${loaded.size} immagini aperte.${duplicateCount ? ` ${duplicateCount} nomi duplicati condividono la stessa assegnazione.` : ""} Le immagini restano sul computer.`,
    );
    if (!subjectId || !state.subjects.some((item) => item.id === subjectId))
      subjectId = state.subjects[0]?.id || null;
    variantKey = null;
    renderAll();
  }

  function addCategory(kind, raw) {
    const name = raw.trim().replace(/\s+/g, " ");
    if (!name) return;
    const list = kind === "subject" ? state.subjects : state.models;
    const existing = list.find(
      (item) =>
        item.name.toLocaleLowerCase("it") === name.toLocaleLowerCase("it"),
    );
    if (existing) {
      notify(
        `“${existing.name}” esiste già: seleziona le immagini e clicca il nome per riutilizzarlo.`,
      );
      return;
    }
    const item = { id: newId(), name };
    list.push(item);
    if (kind === "subject" && !subjectId) subjectId = item.id;
    persist();
    renderAll();
    notify(
      `${kind === "subject" ? "Soggetto" : "Modello"} “${name}” creato. Seleziona le immagini e clicca il nome per assegnarlo.`,
    );
  }

  function applyCategory(field, id) {
    if (!selected.size) {
      notify("Seleziona prima una o più immagini nell’elenco.");
      return;
    }
    selected.forEach((key) => {
      const item = {
        ...assignment(key),
        [field]: id,
        updatedAt: new Date().toISOString(),
      };
      if (field === "modelId") item.role = "variant";
      state.assignments[key] = item;
    });
    persist();
    renderAll();
    notify(
      `${selected.size} ${selected.size === 1 ? "immagine aggiornata" : "immagini aggiornate"}. Puoi continuare con l’altra categoria usando la stessa selezione.`,
    );
  }

  function makeOriginal() {
    if (selected.size !== 1) {
      notify("Seleziona una sola immagine da segnare come originale.");
      return;
    }
    const key = [...selected][0],
      item = assignment(key);
    if (!item.subjectId) {
      notify("Assegna prima il soggetto a questa immagine.");
      return;
    }
    Object.entries(state.assignments).forEach(([otherKey, other]) => {
      if (
        otherKey !== key &&
        other.subjectId === item.subjectId &&
        other.role === "original"
      ) {
        other.role = "variant";
        other.updatedAt = new Date().toISOString();
      }
    });
    state.assignments[key] = {
      ...item,
      role: "original",
      modelId: null,
      updatedAt: new Date().toISOString(),
    };
    persist();
    renderAll();
    notify(
      `Originale impostato per “${nameOf(state.subjects, item.subjectId)}”.`,
    );
  }

  function visibleKeys() {
    const query = $("fileSearch").value.trim().toLocaleLowerCase("it");
    const filter = $("fileFilter").value;
    return [...loaded.keys()].filter(
      (key) =>
        key.toLocaleLowerCase("it").includes(query) &&
        (filter === "all" || (filter === "ready" ? ready(key) : !ready(key))),
    );
  }

  function renderCatalogs() {
    for (const [list, container, field, count] of [
      [state.subjects, "subjectChips", "subjectId", "subjectCount"],
      [state.models, "modelChips", "modelId", "modelCount"],
    ]) {
      $(container).replaceChildren();
      $(count).textContent = String(list.length);
      if (!list.length) {
        const hint = document.createElement("p");
        hint.className = "catalog-tip";
        hint.textContent = "Aggiungi il primo nome per iniziare.";
        $(container).append(hint);
      }
      list.forEach((item) => {
        const group = document.createElement("span");
        group.className = "chip-group";
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = item.name;
        button.title = `Assegna “${item.name}” alle immagini selezionate`;
        button.addEventListener("click", () => applyCategory(field, item.id));
        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "chip-edit";
        edit.textContent = "✎";
        edit.title = `Rinomina “${item.name}”`;
        edit.setAttribute("aria-label", `Rinomina ${item.name}`);
        edit.addEventListener("click", () => {
          const name = window
            .prompt("Nuovo nome:", item.name)
            ?.trim()
            .replace(/\s+/g, " ");
          if (!name || name === item.name) return;
          if (
            list.some(
              (other) =>
                other.id !== item.id &&
                other.name.toLocaleLowerCase("it") ===
                  name.toLocaleLowerCase("it"),
            )
          ) {
            notify(`“${name}” esiste già.`);
            return;
          }
          item.name = name.slice(0, 70);
          persist();
          renderAll();
        });
        group.append(button, edit);
        $(container).append(group);
      });
    }
    $("makeOriginal").disabled = selected.size !== 1;
    $("clearAssignment").disabled = selected.size === 0;
  }

  function renderFiles() {
    const keys = visibleKeys(),
      list = $("fileList");
    list.replaceChildren();
    const readyCount = [...loaded.keys()].filter(ready).length;
    $("organizeStatus").textContent = loaded.size
      ? `${readyCount} pronte · ${loaded.size - readyCount} da organizzare`
      : "Apri una cartella o seleziona immagini per iniziare.";
    $("selectedCount").textContent =
      `${selected.size} ${selected.size === 1 ? "selezionata" : "selezionate"}`;
    $("selectVisible").checked =
      keys.length > 0 && keys.every((key) => selected.has(key));
    $("selectVisible").indeterminate =
      keys.some((key) => selected.has(key)) && !$("selectVisible").checked;
    if (!keys.length) {
      const empty = document.createElement("p");
      empty.className = "file-empty";
      empty.textContent = loaded.size
        ? "Nessuna immagine corrisponde ai filtri."
        : "Apri una cartella per vedere le immagini qui.";
      list.append(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    keys.forEach((key) => {
      const file = loaded.get(key),
        item = assignment(key);
      const row = document.createElement("label");
      row.className = "file-row";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = selected.has(key);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) selected.add(key);
        else selected.delete(key);
        renderCatalogs();
        renderFiles();
      });
      const image = document.createElement("img");
      image.src = fileUrl(key);
      image.alt = "";
      image.loading = "lazy";
      const title = document.createElement("span");
      title.className = "file-main";
      const strong = document.createElement("strong");
      strong.textContent = file.name;
      strong.title = key;
      const sub = document.createElement("small");
      sub.textContent = key;
      title.append(strong, sub);
      const subject = document.createElement("span");
      subject.className = `assignment${item.subjectId ? " ready" : ""}`;
      subject.textContent = item.subjectId
        ? nameOf(state.subjects, item.subjectId)
        : "Soggetto da scegliere";
      const model = document.createElement("span");
      model.className = `assignment${item.role === "original" || item.modelId ? " ready" : ""}`;
      model.textContent =
        item.role === "original"
          ? "◎ Originale"
          : item.modelId
            ? nameOf(state.models, item.modelId)
            : "Modello da scegliere";
      row.append(checkbox, image, title, subject, model);
      fragment.append(row);
    });
    list.append(fragment);
  }

  function reviewSubjects() {
    return state.subjects.filter((subject) =>
      [...loaded.keys()].some(
        (key) =>
          assignment(key).subjectId === subject.id &&
          assignment(key).role !== "original" &&
          assignment(key).modelId,
      ),
    );
  }
  function subjectVariants(id) {
    return [...loaded.keys()].filter(
      (key) =>
        assignment(key).subjectId === id &&
        assignment(key).role !== "original" &&
        assignment(key).modelId,
    );
  }
  function subjectOriginal(id) {
    return [...loaded.keys()].find(
      (key) =>
        assignment(key).subjectId === id && assignment(key).role === "original",
    );
  }

  function saveVote(key, patch) {
    const old = state.ratings[key]?.[voterId] || { score: null, note: "" };
    if (!state.ratings[key]) state.ratings[key] = {};
    state.ratings[key][voterId] = {
      ...old,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    persist();
    renderRanking();
  }

  function renderReview() {
    const subjects = reviewSubjects();
    if (!subjects.some((item) => item.id === subjectId))
      subjectId = subjects[0]?.id || null;
    $("subjectTabs").replaceChildren();
    subjects.forEach((subject) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-pressed", String(subject.id === subjectId));
      const label = document.createElement("strong");
      label.textContent = subject.name;
      const count = document.createElement("small");
      count.textContent = `${subjectVariants(subject.id).length} varianti`;
      button.append(label, count);
      button.addEventListener("click", () => {
        subjectId = subject.id;
        variantKey = null;
        renderReview();
      });
      $("subjectTabs").append(button);
    });
    $("reviewEmpty").hidden = !!subjects.length;
    $("reviewContent").hidden = !subjects.length;
    $("voterSelect").replaceChildren();
    state.voters.forEach((voter) => {
      const option = new Option(voter.name, voter.id);
      $("voterSelect").add(option);
    });
    if (!state.voters.some((voter) => voter.id === voterId))
      voterId = state.voters[0]?.id || null;
    $("voterSelect").value = voterId || "";
    if (!subjects.length) return;
    const variants = subjectVariants(subjectId).sort(
      (a, b) =>
        (imageAverage(b) ?? -1) - (imageAverage(a) ?? -1) ||
        a.localeCompare(b, "it", { numeric: true }),
    );
    if (!variants.includes(variantKey)) variantKey = variants[0];
    const original = subjectOriginal(subjectId);
    $("originalImage").hidden = !original;
    $("originalMissing").hidden = !!original;
    if (original) {
      $("originalImage").src = fileUrl(original);
      $("originalName").textContent = loaded.get(original).name;
    } else {
      $("originalImage").removeAttribute("src");
      $("originalName").textContent = "—";
    }
    $("variantImage").src = fileUrl(variantKey);
    $("variantName").textContent = loaded.get(variantKey).name;
    $("reviewSubject").textContent = nameOf(state.subjects, subjectId);
    $("variantCount").textContent = `${variants.length} varianti`;
    $("variantList").replaceChildren();
    variants.forEach((key) => {
      const item = assignment(key),
        vote = state.ratings[key]?.[voterId] || {};
      const card = document.createElement("div");
      card.className = "variant-card";
      card.tabIndex = 0;
      card.setAttribute("aria-selected", String(key === variantKey));
      const top = document.createElement("div");
      top.className = "variant-card-top";
      const model = document.createElement("strong");
      model.textContent = nameOf(state.models, item.modelId);
      const avg = document.createElement("span");
      avg.className = "variant-score";
      avg.textContent = round(imageAverage(key));
      avg.title = "Media dei valutatori";
      top.append(model, avg);
      const name = document.createElement("small");
      name.textContent = loaded.get(key).name;
      name.title = key;
      const inputs = document.createElement("div");
      inputs.className = "variant-inputs";
      const score = document.createElement("input");
      score.type = "number";
      score.min = "1";
      score.max = "100";
      score.step = "1";
      score.placeholder = "1–100";
      score.value = vote.score ?? "";
      score.setAttribute("aria-label", `Voto per ${loaded.get(key).name}`);
      score.addEventListener("change", () => {
        const value = score.value === "" ? null : Number(score.value);
        if (
          value !== null &&
          (!Number.isInteger(value) || value < 1 || value > 100)
        ) {
          notify("Il voto deve essere un numero intero da 1 a 100.");
          score.value = vote.score ?? "";
          return;
        }
        saveVote(key, { score: value });
        renderReview();
      });
      const note = document.createElement("textarea");
      note.rows = 2;
      note.maxLength = 10000;
      note.placeholder = "Nota sul prompt…";
      note.value = vote.note || "";
      note.setAttribute("aria-label", `Nota per ${loaded.get(key).name}`);
      note.addEventListener("change", () =>
        saveVote(key, { note: note.value }),
      );
      inputs.append(score, note);
      card.append(top, name, inputs);
      card.addEventListener("click", (event) => {
        if (event.target.closest("input,textarea")) return;
        variantKey = key;
        renderReview();
      });
      card.addEventListener("keydown", (event) => {
        if (event.target !== card || !["Enter", " "].includes(event.key))
          return;
        event.preventDefault();
        variantKey = key;
        renderReview();
      });
      $("variantList").append(card);
    });
  }

  function modelResults() {
    return state.models
      .map((model) => {
        const perSubject = state.subjects
          .map((subject) => {
            const keys = [...loaded.keys()].filter(
              (key) =>
                assignment(key).subjectId === subject.id &&
                assignment(key).modelId === model.id &&
                assignment(key).role !== "original",
            );
            const scores = keys.flatMap((key) =>
              rated(key).map((vote) => vote.score),
            );
            return {
              subject,
              value: average(scores),
              votes: scores.length,
              images: keys.length,
            };
          })
          .filter((item) => item.value !== null);
        return {
          model,
          value: average(perSubject.map((item) => item.value)),
          perSubject,
          votes: perSubject.reduce((sum, item) => sum + item.votes, 0),
        };
      })
      .sort(
        (a, b) =>
          (b.value ?? -1) - (a.value ?? -1) ||
          a.model.name.localeCompare(b.model.name, "it"),
      );
  }

  function renderRanking() {
    const results = modelResults();
    $("modelRanking").replaceChildren();
    $("subjectRanking").replaceChildren();
    if (!results.length) {
      $("modelRanking").textContent =
        "Aggiungi i nomi dei modelli nella schermata Organizza.";
      return;
    }
    results.forEach((result, index) => {
      const row = document.createElement("div");
      row.className = "ranking-row";
      const rank = document.createElement("span");
      rank.className = "rank-number";
      rank.textContent = `${index + 1}.`;
      const name = document.createElement("strong");
      name.textContent = result.model.name;
      const score = document.createElement("span");
      score.className = "rank-score";
      score.textContent = round(result.value);
      const detail = document.createElement("small");
      detail.textContent =
        result.value === null
          ? "In attesa di voti"
          : `${result.perSubject.length} soggetti · ${result.votes} voti`;
      row.append(rank, name, score, detail);
      $("modelRanking").append(row);
    });
    state.subjects.forEach((subject) => {
      const matches = results.flatMap((result) =>
        result.perSubject
          .filter((item) => item.subject.id === subject.id)
          .map((item) => ({ name: result.model.name, score: item.value })),
      );
      if (!matches.length) return;
      matches.sort((a, b) => b.score - a.score);
      const block = document.createElement("div");
      block.className = "ranking-subject";
      const title = document.createElement("h4");
      title.textContent = subject.name;
      const desc = document.createElement("p");
      desc.textContent = matches
        .map((item, i) => `${i + 1}. ${item.name} ${round(item.score)}`)
        .join("  ·  ");
      block.append(title, desc);
      $("subjectRanking").append(block);
    });
    if (!$("subjectRanking").childElementCount)
      $("subjectRanking").textContent =
        "Valuta qualche variante per vedere il confronto per soggetto.";
  }

  function renderAll() {
    renderCatalogs();
    renderFiles();
    renderReview();
    renderRanking();
  }
  function showTab(name) {
    activeTab = name;
    for (const tab of ["organize", "review", "ranking"]) {
      $(`${tab}View`).hidden = name !== tab;
      document
        .querySelector(`[data-tab="${tab}"]`)
        .setAttribute("aria-pressed", String(name === tab));
    }
    if (name === "review") renderReview();
    if (name === "ranking") renderRanking();
  }
  function download(content, type, extension) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `qubly-prompt-${new Date().toISOString().slice(0, 10)}.${extension}`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function csvCell(value) {
    let text = String(value ?? "");
    if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  $("folderButton").addEventListener("click", () => $("folderInput").click());
  $("filesButton").addEventListener("click", () => $("filesInput").click());
  for (const id of ["folderInput", "filesInput"])
    $(id).addEventListener("change", (event) => {
      if (event.target.files.length) openFiles(event.target.files);
      event.target.value = "";
    });
  QublyLocalDrop.attach({
    onFiles: (files) => openFiles(files, true),
    onError: notify,
  });
  $("subjectForm").addEventListener("submit", (event) => {
    event.preventDefault();
    addCategory("subject", $("subjectName").value);
    $("subjectName").value = "";
  });
  $("modelForm").addEventListener("submit", (event) => {
    event.preventDefault();
    addCategory("model", $("modelName").value);
    $("modelName").value = "";
  });
  $("makeOriginal").addEventListener("click", makeOriginal);
  $("clearAssignment").addEventListener("click", () => {
    selected.forEach((key) => {
      delete state.assignments[key];
    });
    persist();
    renderAll();
    notify(
      "Assegnazioni rimosse. I voti rimangono salvati per queste immagini.",
    );
  });
  $("fileSearch").addEventListener("input", renderFiles);
  $("fileFilter").addEventListener("change", renderFiles);
  $("selectVisible").addEventListener("change", (event) => {
    visibleKeys().forEach((key) => {
      if (event.target.checked) selected.add(key);
      else selected.delete(key);
    });
    renderCatalogs();
    renderFiles();
  });
  document
    .querySelectorAll("[data-tab]")
    .forEach((button) =>
      button.addEventListener("click", () => showTab(button.dataset.tab)),
    );
  $("voterSelect").addEventListener("change", () => {
    voterId = $("voterSelect").value;
    renderReview();
  });
  $("addVoter").addEventListener("click", () => {
    const name = window.prompt("Nome del nuovo valutatore:")?.trim();
    if (!name) return;
    const voter = { id: newId(), name: name.slice(0, 70) };
    state.voters.push(voter);
    voterId = voter.id;
    persist();
    renderReview();
  });
  $("backupExport").addEventListener("click", () =>
    download(
      JSON.stringify(
        { ...state, exportedAt: new Date().toISOString() },
        null,
        2,
      ),
      "application/json",
      "json",
    ),
  );
  $("backupImport").addEventListener("click", () => $("backupInput").click());
  $("backupInput").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("Backup too large");
      const incoming = JSON.parse(await file.text());
      if (
        incoming.version !== 1 ||
        !Array.isArray(incoming.subjects) ||
        !Array.isArray(incoming.models) ||
        !Array.isArray(incoming.voters) ||
        !incoming.assignments ||
        !incoming.ratings
      )
        throw new Error("Invalid backup");
      for (const [field, list] of [
        ["subjects", incoming.subjects],
        ["models", incoming.models],
        ["voters", incoming.voters],
      ]) {
        if (
          !list.every(
            (item) =>
              typeof item.id === "string" && typeof item.name === "string",
          )
        )
          throw new Error("Invalid names");
        const known = new Set(state[field].map((item) => item.id));
        list.forEach((item) => {
          if (!known.has(item.id)) state[field].push(item);
        });
      }
      for (const [key, item] of Object.entries(incoming.assignments)) {
        if (!item || typeof item !== "object") continue;
        const existing = state.assignments[key];
        if (
          !existing ||
          Date.parse(item.updatedAt || "") >
            Date.parse(existing.updatedAt || "")
        )
          state.assignments[key] = item;
      }
      for (const [key, votes] of Object.entries(incoming.ratings)) {
        if (!votes || typeof votes !== "object") continue;
        if (!state.ratings[key]) state.ratings[key] = {};
        for (const [reviewer, vote] of Object.entries(votes)) {
          if (!vote || typeof vote !== "object") continue;
          const existing = state.ratings[key][reviewer];
          if (
            !existing ||
            Date.parse(vote.updatedAt || "") >
              Date.parse(existing.updatedAt || "")
          )
            state.ratings[key][reviewer] = vote;
        }
      }
      persist();
      renderAll();
      notify(
        "Progetto importato. Apri la stessa cartella di immagini per vedere anteprime e classifiche.",
      );
    } catch {
      notify(
        "File non valido: importa un progetto JSON creato da Valutazione render.",
      );
    }
  });
  $("rankingCsv").addEventListener("click", () => {
    const rows = [
      ["Posizione", "Modello", "Media", "Soggetti valutati", "Voti"],
    ];
    modelResults().forEach((item, i) =>
      rows.push([
        i + 1,
        item.model.name,
        item.value === null ? "" : round(item.value),
        item.perSubject.length,
        item.votes,
      ]),
    );
    download(
      "\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n"),
      "text/csv;charset=utf-8",
      "csv",
    );
  });
  window.addEventListener("pagehide", clearUrls);
  renderAll();
  showTab(activeTab);
})();
