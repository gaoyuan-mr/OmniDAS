const root = document.body.dataset.root || ".";
let datasets = {};
let modelResults = {};
let activeAudio = null;
let lightboxItems = [];
let lightboxIndex = 0;
let lightboxTrigger = null;

const trafficDataset = {
  name: "Traffic",
  task: "Fixed-region localization",
  records: 3445,
  regionLabelCount: 2,
  dimensions: "2,048 x 2,775",
  duration: "1 s",
  sampleRate: "2,048 Hz",
  description: "Spatiotemporal fibre-optic recordings capture vibrations along a monitored traffic route. The distance labels mark cable-slack regions along the route.",
  feature: {
    card: "assets/images/traffic-segmentation-card.webp",
    full: "assets/images/traffic-segmentation-full.webp",
    alt: "Spatiotemporal Traffic record with cable-slack regions",
    caption: "Representative Traffic record and cable-slack regions",
  },
};

const lightbox = document.querySelector("#lightbox");

function updateLightbox() {
  const item = lightboxItems[lightboxIndex];
  const image = lightbox.querySelector("[data-lightbox-image]");
  image.src = item.dataset.lightboxSrc;
  image.alt = item.dataset.lightboxAlt;
  lightbox.querySelector("[data-lightbox-caption]").textContent =
    item.closest("figure")?.querySelector("figcaption")?.textContent || item.dataset.lightboxAlt;
  const multipleItems = lightboxItems.length > 1;
  lightbox.querySelector("[data-lightbox-previous]").hidden = !multipleItems;
  lightbox.querySelector("[data-lightbox-next]").hidden = !multipleItems;
}

function openLightbox(items, index) {
  lightboxItems = items;
  lightboxIndex = index;
  lightboxTrigger = items[index];
  updateLightbox();
  lightbox.showModal();
}

function closeLightbox() {
  if (!lightbox.open) return;
  lightbox.close();
  lightbox.querySelector("[data-lightbox-image]").removeAttribute("src");
  lightboxTrigger?.focus();
  lightboxTrigger = null;
}

function stepLightbox(direction) {
  lightboxIndex = (lightboxIndex + direction + lightboxItems.length) % lightboxItems.length;
  updateLightbox();
}

if (lightbox) {
  document.addEventListener("click", event => {
    const trigger = event.target.closest("[data-lightbox-src]");
    if (trigger) {
      const items = [...document.querySelectorAll("[data-lightbox-src]")]
        .filter(item => item.dataset.lightboxGroup === trigger.dataset.lightboxGroup);
      openLightbox(items, items.indexOf(trigger));
    } else if (event.target.closest("[data-lightbox-close]") || event.target === lightbox) {
      closeLightbox();
    } else if (event.target.closest("[data-lightbox-previous]")) {
      stepLightbox(-1);
    } else if (event.target.closest("[data-lightbox-next]")) {
      stepLightbox(1);
    }
  });

  document.addEventListener("keydown", event => {
    if (!lightbox.open) return;
    if (event.key === "Escape") closeLightbox();
    else if (event.key === "ArrowLeft") stepLightbox(-1);
    else if (event.key === "ArrowRight") stepLightbox(1);
    else return;
    event.preventDefault();
  });
}

function stopAudio() {
  if (!activeAudio) return;
  activeAudio.pause();
  activeAudio.currentTime = 0;
  activeAudio = null;
}

function validKey(key) {
  return Object.hasOwn(datasets, key) ? key : "industrial";
}

function heading(text) {
  const element = document.createElement("h2");
  element.textContent = text;
  return element;
}

function definitionGrid(entries, className) {
  const list = document.createElement("dl");
  list.className = className;
  for (const [term, value] of entries) {
    const item = document.createElement("div");
    const name = document.createElement("dt");
    const description = document.createElement("dd");
    name.textContent = term;
    description.textContent = value;
    item.append(name, description);
    list.append(item);
  }
  return list;
}

const classificationConditions = {
  industrial: new Set([
    "Industrial Fiber Optic Microphone",
    "Industrial Straight-run Fiber Optic Cable",
  ]),
  "perimeter-security": new Set(["Perimeter Security"]),
  campus: new Set(["Campus"]),
  "environmental-sound": new Set([
    "Environmental Sound time domain",
    "Environmental Sound time-frequency",
  ]),
  seismic: new Set(),
};

function renderClassificationModelContext(key) {
  const container = document.querySelector("[data-classification-model-context]");
  if (!container) return;
  const isTraffic = key === "traffic";
  const resultHeading = document.querySelector("[data-results-heading]");
  if (resultHeading) resultHeading.textContent = isTraffic ? "Localization result" : "Classification results";
  container.closest("section").setAttribute("aria-label", isTraffic ? "Localization result" : "Classification results");
  const resultLink = document.querySelector("[data-results-link]");
  if (resultLink) {
    resultLink.href = `${root}/methods/#${isTraffic ? "traffic-localization" : "classification-results"}`;
    resultLink.firstChild.textContent = isTraffic ? "All task results " : "All classification results ";
  }
  container.replaceChildren();

  if (isTraffic) {
    const result = modelResults.downstream?.find(item => item.id === "traffic-localization");
    if (!result) {
      container.append(elementWithText("p", "table-note", "No localization result is reported for this dataset."));
      return;
    }
    const iou = result.results.find(metric => metric.label === "IoU");
    const overflow = document.createElement("div");
    overflow.className = "table-overflow";
    overflow.append(summaryTable(["Scenario", "Parameters", "IoU"], [[
      result.scenario,
      result.parameters.toLocaleString("en-US"),
      formatMetric(iou?.value, "%"),
    ]]));
    container.append(overflow);
    return;
  }

  const allowedConditions = classificationConditions[key] || new Set();
  const rows = Array.isArray(modelResults.classification)
    ? modelResults.classification.filter(row => allowedConditions.has(row.scenario))
    : [];
  if (!rows.length) {
    const note = elementWithText(
      "p",
      "table-note",
      key === "seismic"
        ? "Seismic recordings are included in the dataset collection."
        : "No classification result is reported for this dataset.",
    );
    container.append(note);
    return;
  }

  const overflow = document.createElement("div");
  overflow.className = "table-overflow";
  overflow.append(classificationTable(rows));
  container.append(overflow);
}

function renderDataset(key, dataset) {
  const panel = document.querySelector("#dataset-panel");
  panel.replaceChildren();
  panel.dataset.scenario = key;

  const summary = document.createElement("section");
  summary.append(
    heading(dataset.name),
    definitionGrid([
      ["Task", dataset.task],
      ["Records", dataset.records],
      dataset.regionLabelCount ? ["Region labels", dataset.regionLabelCount] : ["Classes", dataset.classCount],
      ["Dimensions", dataset.dimensions],
      ["Duration", dataset.duration],
      ["Sample rate", dataset.sampleRate],
    ], "definition-grid"),
  );
  if (dataset.description) summary.append(elementWithText("p", "dataset-description", dataset.description));
  panel.append(summary);

  if (dataset.classes?.length) {
    const distribution = document.createElement("section");
    distribution.append(heading("Class distribution"));
    const chart = document.createElement("div");
    chart.className = "bar-chart";
    const maxClassCount = Math.max(...dataset.classes.map(item => item.count));
    for (const item of dataset.classes) {
      const row = document.createElement("div");
      row.className = "bar-chart__item";
      const label = document.createElement("span");
      label.textContent = item.label;
      const track = document.createElement("div");
      track.className = "bar-chart__track";
      const fill = document.createElement("div");
      fill.className = "bar-chart__fill";
      fill.style.width = `${item.count / maxClassCount * 100}%`;
      track.append(fill);
      const count = document.createElement("span");
      count.className = "bar-chart__count";
      count.textContent = item.count;
      row.append(label, track, count);
      chart.append(row);
    }
    distribution.append(chart);
    panel.append(distribution);
  }

  if (dataset.feature) {
    const feature = document.createElement("section");
    feature.append(heading("Representative feature"));
    const figure = document.createElement("figure");
    figure.className = "media-card";
    const button = document.createElement("button");
    button.className = "media-card__button";
    button.type = "button";
    button.dataset.lightboxSrc = `${root}/${dataset.feature.full}`;
    button.dataset.lightboxAlt = dataset.feature.alt || `Representative ${dataset.name} feature`;
    button.dataset.lightboxGroup = `${key}-feature`;
    const image = document.createElement("img");
    image.src = `${root}/${dataset.feature.card}`;
    image.alt = button.dataset.lightboxAlt;
    image.loading = "lazy";
    button.append(image);
    const caption = document.createElement("figcaption");
    caption.textContent = dataset.feature.caption || `${dataset.name} feature`;
    figure.append(button, caption);
    feature.append(figure);
    panel.append(feature);
  }

  if (dataset.audio?.length) {
    const samples = document.createElement("section");
    samples.append(heading("Audio samples"));
    const grid = document.createElement("div");
    grid.className = "audio-grid";
    for (const sample of dataset.audio) {
      const card = document.createElement("article");
      card.className = "audio-card";
      const label = document.createElement("h3");
      label.textContent = sample.label;
      const metadata = document.createElement("p");
      metadata.textContent = `Sample ID: ${sample.sampleId} · Duration: ${dataset.duration} · Sample rate: ${dataset.sampleRate}`;
      const audio = document.createElement("audio");
      audio.src = `${root}/${sample.src}`;
      audio.preload = "none";
      audio.controls = true;
      audio.controlsList = "nodownload";
      audio.setAttribute("aria-label",
        `${dataset.name}, ${sample.label}, Sample ID: ${sample.sampleId}, Duration: ${dataset.duration}, Sample rate: ${dataset.sampleRate}`);
      audio.addEventListener("play", () => {
        if (activeAudio && activeAudio !== audio) {
          activeAudio.pause();
          activeAudio.currentTime = 0;
        }
        activeAudio = audio;
      });
      card.append(label, metadata, audio);
      grid.append(card);
    }
    samples.append(grid);
    panel.append(samples);
  }

  renderClassificationModelContext(key);
}

function activateDataset(key) {
  stopAudio();
  const panel = document.querySelector("#dataset-panel");
  for (const tab of document.querySelectorAll('[role="tab"][data-dataset]')) {
    const selected = tab.dataset.dataset === key;
    tab.setAttribute("aria-selected", selected);
    tab.tabIndex = selected ? 0 : -1;
    if (selected) {
      panel.setAttribute("aria-labelledby", tab.id);
      const tablist = tab.parentElement;
      const offset = tab.getBoundingClientRect().left - tablist.getBoundingClientRect().left + tablist.scrollLeft;
      tablist.scrollLeft = offset - (tablist.clientWidth - tab.offsetWidth) / 2;
    }
  }
  renderDataset(key, datasets[key]);
  if (window.location.hash !== `#${key}`) history.replaceState(null, "", `#${key}`);
}

async function initClassification() {
  const [datasetResponse, modelResponse] = await Promise.all([
    fetch(`${root}/assets/classification-data.json`),
    fetch(`${root}/assets/model-results.json`),
  ]);
  if (!datasetResponse.ok) throw new Error(`Dataset data failed to load: ${datasetResponse.status}`);
  if (!modelResponse.ok) throw new Error(`Model data failed to load: ${modelResponse.status}`);
  datasets = { ...(await datasetResponse.json()).datasets, traffic: trafficDataset };
  modelResults = await modelResponse.json();
  activateDataset(validKey(window.location.hash.slice(1)));
}

const classification = document.querySelector("[data-classification]");
if (classification) {
  const tabs = [...classification.querySelectorAll('[role="tab"][data-dataset]')];
  for (const [index, tab] of tabs.entries()) {
    tab.addEventListener("click", () => {
      window.location.hash = tab.dataset.dataset;
    });
    tab.addEventListener("keydown", event => {
      let next = index;
      if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      else return;
      event.preventDefault();
      tabs[next].focus();
      window.location.hash = tabs[next].dataset.dataset;
    });
  }
  initClassification().then(() => {
    window.addEventListener("hashchange", () => activateDataset(validKey(window.location.hash.slice(1))));
  }).catch(() => {
    const panel = document.querySelector("#dataset-panel");
    panel.replaceChildren();
    panel.setAttribute("role", "alert");
    panel.textContent = "Dataset information could not be loaded.";
    const context = document.querySelector("[data-classification-model-context]");
    if (context) {
      context.replaceChildren(elementWithText("p", "callout", "Model information could not be loaded."));
      context.setAttribute("role", "alert");
    }
  });
}

function elementWithText(tagName, className, value) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = value;
  return element;
}

function formatMetric(value, suffix = "") {
  if (value === null || value === undefined || value === "") return "-";
  return `${suffix === "%" ? value.toFixed(2) : value}${suffix}`;
}

function summaryTable(labels, rows) {
  const table = document.createElement("table");
  table.className = "data-table summary-table";
  const head = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const label of labels) {
    const cell = elementWithText("th", "", label);
    cell.scope = "col";
    headerRow.append(cell);
  }
  head.append(headerRow);
  table.append(head);
  const body = document.createElement("tbody");
  for (const row of rows) {
    const tableRow = document.createElement("tr");
    for (const [index, value] of row.entries()) {
      const numeric = ["Parameters", "Accuracy", "IoU", "Core inference latency"].includes(labels[index]);
      tableRow.append(elementWithText(index === 0 ? "th" : "td", numeric ? "numeric" : "", value));
    }
    tableRow.firstElementChild.scope = "row";
    body.append(tableRow);
  }
  table.append(body);
  return table;
}

function classificationTable(rows) {
  return summaryTable(["Scenario", "Parameters", "Accuracy"], rows.map(row => [
    row.scenario,
    row.parameters.toLocaleString("en-US"),
    formatMetric(row.accuracy, "%"),
  ]));
}

function renderMethodClassification(rows) {
  const container = document.querySelector("[data-method-classification]");
  if (!container) return;
  container.replaceChildren(classificationTable(rows));
}

function renderDownstreamResults(items) {
  const container = document.querySelector("[data-method-downstream]");
  if (!container) return;
  const table = summaryTable(["Scenario", "Task", "Parameters", "Result"], items.map(item => [
    item.scenario,
    item.task,
    item.parameters.toLocaleString("en-US"),
    item.results.map(result => `${result.label}: ${formatMetric(result.value, result.unit)}`).join("\n"),
  ]));
  table.classList.add("task-results-table");
  [...table.querySelectorAll("tbody tr")].forEach((row, index) => { row.id = items[index].id; });
  container.replaceChildren(table);
}

function renderDeploymentFacts(deployment) {
  const container = document.querySelector("[data-method-deployment]");
  if (!container) return;
  container.replaceChildren(summaryTable(["Scenario", "Core inference latency"], deployment.map(item => [
    item.scenario,
    `${item.latencyUs.toFixed(2)} μs`,
  ])));
}

async function initMethods() {
  const response = await fetch(`${root}/assets/model-results.json`);
  if (!response.ok) throw new Error(`Model data failed to load: ${response.status}`);
  modelResults = await response.json();
  renderMethodClassification(modelResults.classification);
  renderDownstreamResults(modelResults.downstream);
  renderDeploymentFacts(modelResults.deployment);
  const target = document.getElementById(window.location.hash.slice(1));
  if (target) target.scrollIntoView();
}

const methods = document.querySelector("[data-methods]");
if (methods) {
  initMethods().catch(() => {
    for (const container of methods.querySelectorAll("[data-method-classification], [data-method-downstream], [data-method-deployment]")) {
      container.replaceChildren(elementWithText("p", "callout", "Model information could not be loaded."));
      container.setAttribute("role", "alert");
    }
  });
}
