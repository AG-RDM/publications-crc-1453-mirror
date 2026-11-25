const API_URL = "https://fredato-1453.imbi.uni-freiburg.de/public/api/publications/1453";
const PAGE_DELAY_MS = 250;
const MAX_FETCH_ATTEMPTS = 3;

const FACETS = {
  year: { label: "Publication year", limit: 8, sort: (a, b) => Number(b) - Number(a) },
  data: { label: "Data availability", limit: 5 },
  organism: { label: "Organism", limit: 8 },
  material: { label: "Research material", limit: 8 },
  method: { label: "Method / readout", limit: 8 },
  intervention: { label: "Intervention", limit: 8 },
  journal: { label: "Journal", limit: 8 },
  topic: { label: "Publication topic", limit: 8 },
};

const state = {
  records: [],
  search: "",
  sort: "year-desc",
  selected: Object.fromEntries(Object.keys(FACETS).map((key) => [key, new Set()])),
  expanded: new Set(),
};

const elements = {
  searchForm: document.querySelector("#search-form"),
  search: document.querySelector("#search"),
  facets: document.querySelector("#facet-list"),
  activeFilters: document.querySelector("#active-filters"),
  reset: document.querySelector("#reset-filters"),
  sort: document.querySelector("#sort-filter"),
  list: document.querySelector("#publication-list"),
  loading: document.querySelector("#loading"),
  error: document.querySelector("#error"),
  empty: document.querySelector("#empty"),
  resultCount: document.querySelector("#result-count"),
  resultSummary: document.querySelector("#result-summary"),
  statusDot: document.querySelector("#status-dot"),
  syncStatus: document.querySelector("#sync-status"),
  refresh: document.querySelector("#refresh-data"),
  lastUpdated: document.querySelector("#last-updated"),
};

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

function safeUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function datasetsFor(item) {
  return Array.isArray(item.dataSources?.dataSource) ? item.dataSources.dataSource : [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function categorizeChips(datasets) {
  const categories = { organism: [], material: [], method: [], intervention: [] };

  datasets.flatMap((dataset) => dataset.chips || []).forEach((chip) => {
    const tooltip = (chip.tooltip || "").toLocaleLowerCase("en");
    if (!chip.title) return;

    if (tooltip.includes("organism")) categories.organism.push(chip.title);
    if (["tissue", "blood component", "cell type", "sample preparation", "cell line"].some((term) => tooltip.includes(term))) {
      categories.material.push(chip.title);
    }
    if (["read out", "readout", "sequencing"].some((term) => tooltip.includes(term))) {
      categories.method.push(chip.title);
    }
    if (["intervention", "target gene", "infection"].some((term) => tooltip.includes(term))) {
      categories.intervention.push(chip.title);
    }
  });

  return Object.fromEntries(Object.entries(categories).map(([key, values]) => [key, unique(values)]));
}

function normalizeRecord(item) {
  const publication = item.publication || {};
  const datasets = datasetsFor(item);
  const chips = categorizeChips(datasets);
  const authors = (publication.authors || []).map((author) =>
    [author.givenName, author.familyName].filter(Boolean).join(" "),
  ).filter(Boolean);
  const topics = unique((publication.publicationClasses || []).map((entry) => entry.display));
  const datasetText = datasets.flatMap((dataset) => [
    dataset.name,
    dataset.description,
    dataset.publicationService,
    ...(dataset.chips || []).flatMap((chip) => [chip.title, chip.tooltip]),
  ]);
  const data = [];
  if (datasets.some((dataset) => dataset.isPublished === true)) data.push("Published data");
  if (datasets.some((dataset) => dataset.isPublished === false)) data.push("Data on request");
  if (datasets.some((dataset) => dataset.isPublished !== true && dataset.isPublished !== false)) {
    data.push("Availability not specified");
  }
  if (datasets.length === 0) data.push("No linked datasets");

  return {
    item,
    publication,
    datasets,
    authors,
    facets: {
      year: publication.publicationYear ? [publication.publicationYear] : [],
      data,
      organism: chips.organism,
      material: chips.material,
      method: chips.method,
      intervention: chips.intervention,
      journal: publication.journalTitle ? [publication.journalTitle] : [],
      topic: topics,
    },
    searchText: [
      publication.publicationTitle,
      publication.journalTitle,
      publication.publicationYear,
      publication.doi,
      ...authors,
      ...topics,
      ...datasetText,
    ].filter(Boolean).join(" ").toLocaleLowerCase("en"),
  };
}

async function fetchPage(page) {
  const params = new URLSearchParams({ currentPage: page, pageSize: "100" });
  for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt += 1) {
    let response;
    try {
      response = await fetch(`${API_URL}?${params}`, { cache: "no-store" });
    } catch (error) {
      if (attempt === MAX_FETCH_ATTEMPTS - 1) throw error;
      await sleep(1000 * (2 ** attempt));
      continue;
    }

    if (response.ok) return response.json();
    if (response.status !== 429 || attempt === MAX_FETCH_ATTEMPTS - 1) {
      throw new Error(`FREDATO returned HTTP ${response.status}.`);
    }

    const retryAfter = Number(response.headers.get("Retry-After"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : 1000 * (2 ** attempt));
  }

  throw new Error("FREDATO could not be reached after multiple attempts.");
}

async function loadPublications() {
  elements.loading.hidden = false;
  elements.error.hidden = true;
  elements.refresh.disabled = true;
  elements.statusDot.className = "status-dot";
  elements.syncStatus.textContent = "Loading current data from FREDATO";

  try {
    const first = await fetchPage(1);
    const pages = [first];
    const lastPage = first.pagination?.lastPage || 1;
    for (let page = 2; page <= lastPage; page += 1) {
      elements.syncStatus.textContent = `Loading page ${page} of ${lastPage} from FREDATO`;
      await sleep(PAGE_DELAY_MS);
      pages.push(await fetchPage(page));
    }
    state.records = pages.flatMap((page) => page.results || []).map(normalizeRecord);

    const now = new Date();
    elements.lastUpdated.dateTime = now.toISOString();
    elements.lastUpdated.textContent = now.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
    elements.statusDot.className = "status-dot online";
    elements.syncStatus.textContent = `${state.records.length} publications loaded from FREDATO`;
    render();
  } catch (error) {
    elements.error.hidden = false;
    elements.error.textContent = `Publications could not be loaded. ${error.message}`;
    elements.statusDot.className = "status-dot error";
    elements.syncStatus.textContent = "Could not connect to FREDATO";
  } finally {
    elements.loading.hidden = true;
    elements.refresh.disabled = false;
  }
}

function matchesFilters(record, exceptFacet = "") {
  if (state.search && !record.searchText.includes(state.search)) return false;
  return Object.entries(state.selected).every(([facet, selected]) => {
    if (facet === exceptFacet || selected.size === 0) return true;
    return record.facets[facet].some((value) => selected.has(value));
  });
}

function facetValues(facet) {
  return unique(state.records.flatMap((record) => record.facets[facet]));
}

function facetCounts(facet) {
  const counts = new Map();
  state.records.filter((record) => matchesFilters(record, facet)).forEach((record) => {
    record.facets[facet].forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  });
  return counts;
}

function sortedFacetValues(facet) {
  const config = FACETS[facet];
  const counts = facetCounts(facet);
  return facetValues(facet).sort(config.sort || ((a, b) =>
    (counts.get(b) || 0) - (counts.get(a) || 0) || a.localeCompare(b, "en")
  ));
}

function renderFacets() {
  elements.facets.innerHTML = Object.entries(FACETS).map(([facet, config]) => {
    const allValues = sortedFacetValues(facet);
    const selected = state.selected[facet];
    const isExpanded = state.expanded.has(facet);
    const visibleValues = isExpanded
      ? allValues
      : allValues.filter((value, index) => index < config.limit || selected.has(value));
    const counts = facetCounts(facet);

    return `
      <section class="facet-group" aria-labelledby="facet-${facet}">
        <h3 id="facet-${facet}">${escapeHtml(config.label)}</h3>
        <div class="facet-options">
          ${visibleValues.map((value) => `
            <label class="facet-option">
              <input type="checkbox" data-facet="${facet}" data-value="${escapeHtml(value)}" ${selected.has(value) ? "checked" : ""} ${(counts.get(value) || 0) === 0 && !selected.has(value) ? "disabled" : ""}>
              <span class="label">${escapeHtml(value)}</span>
              <span class="count">${counts.get(value) || 0}</span>
            </label>`).join("")}
        </div>
        ${allValues.length > config.limit ? `<button class="facet-more" type="button" data-expand="${facet}">${isExpanded ? "Show less" : `Show all (${allValues.length})`}</button>` : ""}
      </section>`;
  }).join("");
}

function renderActiveFilters() {
  const filters = Object.entries(state.selected).flatMap(([facet, values]) =>
    [...values].map((value) => ({ facet, value })),
  );
  elements.activeFilters.innerHTML = filters.map(({ facet, value }) => `
    <button class="active-filter" type="button" data-remove-facet="${facet}" data-remove-value="${escapeHtml(value)}" title="Remove filter">
      <span>${escapeHtml(value)}</span> ×
    </button>`).join("");
  elements.reset.hidden = filters.length === 0 && !state.search;
}

function filteredRecords() {
  const records = state.records.filter((record) => matchesFilters(record));
  return records.sort((a, b) => {
    if (state.sort === "year-asc") return Number(a.publication.publicationYear) - Number(b.publication.publicationYear);
    if (state.sort === "title-asc") return (a.publication.publicationTitle || "").localeCompare(b.publication.publicationTitle || "", "en");
    if (state.sort === "datasets-desc") return b.datasets.length - a.datasets.length;
    return Number(b.publication.publicationYear) - Number(a.publication.publicationYear)
      || (a.publication.publicationTitle || "").localeCompare(b.publication.publicationTitle || "", "en");
  });
}

function datasetUrl(dataset) {
  if (dataset.identifier?.url) return safeUrl(dataset.identifier.url);
  if (dataset.identifier?.doi) return safeUrl(`https://doi.org/${dataset.identifier.doi}`);
  return "";
}

function datasetAvailability(dataset) {
  if (dataset.isPublished === true) return "Published";
  if (dataset.isPublished === false) return "On request";
  return "Availability not specified";
}

function renderDataset(dataset) {
  const url = datasetUrl(dataset);
  const features = unique((dataset.chips || []).map((chip) => chip.title)).slice(0, 10);
  return `
    <li>
      <span class="dataset-name">${escapeHtml(dataset.name || "Dataset")}</span>
      <span>${escapeHtml(dataset.publicationService || datasetAvailability(dataset))}</span>
      ${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">Open dataset</a>` : ""}
      ${features.length ? `<span class="dataset-features">${features.map(escapeHtml).join(" · ")}</span>` : ""}
    </li>`;
}

function renderPublication(record) {
  const publication = record.publication;
  const doiUrl = publication.doi ? safeUrl(`https://doi.org/${publication.doi}`) : "";
  const published = record.datasets.filter((dataset) => dataset.isPublished === true).length;
  const requested = record.datasets.filter((dataset) => dataset.isPublished === false).length;
  const unspecified = record.datasets.length - published - requested;
  const authors = record.authors.length > 12
    ? `${record.authors.slice(0, 12).join(", ")} et al.`
    : record.authors.join(", ");
  const topics = record.facets.topic.slice(0, 4);

  return `
    <li class="publication-item">
      <article>
        <h3>${doiUrl ? `<a href="${escapeHtml(doiUrl)}" target="_blank" rel="noreferrer">${escapeHtml(publication.publicationTitle || "Untitled publication")}</a>` : escapeHtml(publication.publicationTitle || "Untitled publication")}</h3>
        ${authors ? `<p class="authors">${escapeHtml(authors)}</p>` : ""}
        <p class="citation">
          ${publication.journalTitle ? `${escapeHtml(publication.journalTitle)}. ` : ""}${escapeHtml(publication.publicationYear || "")}${publication.doi ? `; <span class="identifier">doi: ${escapeHtml(publication.doi)}</span>` : ""}
        </p>
        <div class="metadata-row">
          ${published ? `<span class="metadata-tag published">${published} published dataset${published === 1 ? "" : "s"}</span>` : ""}
          ${requested ? `<span class="metadata-tag request">${requested} dataset${requested === 1 ? "" : "s"} on request</span>` : ""}
          ${unspecified ? `<span class="metadata-tag">${unspecified} dataset${unspecified === 1 ? "" : "s"} with unspecified availability</span>` : ""}
          ${topics.map((topic) => `<span class="metadata-tag">${escapeHtml(topic)}</span>`).join("")}
        </div>
        ${record.datasets.length ? `
          <details class="dataset-details">
            <summary>Show ${record.datasets.length} associated dataset${record.datasets.length === 1 ? "" : "s"}</summary>
            <ul class="dataset-list">${record.datasets.map(renderDataset).join("")}</ul>
          </details>` : ""}
      </article>
    </li>`;
}

function renderResults() {
  const records = filteredRecords();
  const datasetCount = records.reduce((total, record) => total + record.datasets.length, 0);
  elements.resultCount.textContent = records.length.toLocaleString("en-GB");
  elements.resultSummary.textContent = `${datasetCount.toLocaleString("en-GB")} associated datasets`;
  elements.list.innerHTML = records.map(renderPublication).join("");
  elements.empty.hidden = records.length !== 0 || state.records.length === 0;
}

function render() {
  renderFacets();
  renderActiveFilters();
  renderResults();
}

elements.searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  state.search = elements.search.value.trim().toLocaleLowerCase("en");
  render();
});

elements.search.addEventListener("search", () => {
  state.search = elements.search.value.trim().toLocaleLowerCase("en");
  render();
});

elements.sort.addEventListener("change", () => {
  state.sort = elements.sort.value;
  renderResults();
});

elements.facets.addEventListener("change", (event) => {
  const input = event.target.closest("input[data-facet]");
  if (!input) return;
  const values = state.selected[input.dataset.facet];
  input.checked ? values.add(input.dataset.value) : values.delete(input.dataset.value);
  render();
});

elements.facets.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-expand]");
  if (!button) return;
  const facet = button.dataset.expand;
  state.expanded.has(facet) ? state.expanded.delete(facet) : state.expanded.add(facet);
  renderFacets();
});

elements.activeFilters.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-remove-facet]");
  if (!button) return;
  state.selected[button.dataset.removeFacet].delete(button.dataset.removeValue);
  render();
});

elements.reset.addEventListener("click", () => {
  Object.values(state.selected).forEach((values) => values.clear());
  state.search = "";
  elements.search.value = "";
  render();
});

elements.refresh.addEventListener("click", loadPublications);
loadPublications();
