const API_URL = "https://fredato.imbi.uni-freiburg.de/public/api/publications/tr-359";

const state = {
  publications: [],
  filters: { search: "", year: "", journal: "", feature: "", data: "", sort: "year-desc" },
};

const elements = {
  list: document.querySelector("#publication-list"),
  loading: document.querySelector("#loading"),
  error: document.querySelector("#error"),
  empty: document.querySelector("#empty"),
  resultCount: document.querySelector("#result-count"),
  publicationCount: document.querySelector("#publication-count"),
  datasetCount: document.querySelector("#dataset-count"),
  yearRange: document.querySelector("#year-range"),
  statusDot: document.querySelector("#status-dot"),
  syncStatus: document.querySelector("#sync-status"),
  lastUpdated: document.querySelector("#last-updated"),
  refresh: document.querySelector("#refresh-data"),
};

const filterElements = {
  search: document.querySelector("#search"),
  year: document.querySelector("#year-filter"),
  journal: document.querySelector("#journal-filter"),
  feature: document.querySelector("#feature-filter"),
  data: document.querySelector("#data-filter"),
  sort: document.querySelector("#sort-filter"),
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

function getDatasets(publication) {
  return Array.isArray(publication.dataSources?.dataSource) ? publication.dataSources.dataSource : [];
}

function getFeatures(publication) {
  return [...new Set(getDatasets(publication).flatMap((dataset) =>
    (dataset.chips || []).map((chip) => chip.title).filter(Boolean),
  ))];
}

function searchableText(publication) {
  const entry = publication.publication || {};
  const authors = (entry.authors || []).flatMap((author) => [author.givenName, author.familyName, author.orcid]);
  const classes = (entry.publicationClasses || []).map((item) => item.display);
  const datasets = getDatasets(publication).flatMap((dataset) => [
    dataset.name, dataset.description, dataset.publicationService,
    ...(dataset.chips || []).flatMap((chip) => [chip.title, chip.tooltip]),
  ]);
  return [entry.publicationTitle, entry.journalTitle, entry.publicationYear, entry.doi, ...authors, ...classes, ...datasets]
    .filter(Boolean).join(" ").toLocaleLowerCase("de");
}

async function fetchPage(page) {
  const params = new URLSearchParams({ currentPage: page, filterByDatasources: "false" });
  const response = await fetch(`${API_URL}?${params}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`FREDATO antwortet mit Status ${response.status}.`);
  return response.json();
}

async function loadPublications() {
  elements.loading.hidden = false;
  elements.error.hidden = true;
  elements.refresh.disabled = true;
  elements.syncStatus.textContent = "Daten werden geladen";
  elements.statusDot.className = "";

  try {
    const firstPage = await fetchPage(1);
    const lastPage = firstPage.pagination?.lastPage || 1;
    const remainingPages = await Promise.all(
      Array.from({ length: Math.max(0, lastPage - 1) }, (_, index) => fetchPage(index + 2)),
    );
    state.publications = [firstPage, ...remainingPages].flatMap((page) => page.results || []);
    populateFilters();
    updateSummary();
    render();

    const now = new Date();
    elements.lastUpdated.dateTime = now.toISOString();
    elements.lastUpdated.textContent = now.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
    elements.syncStatus.textContent = "Live mit FREDATO verbunden";
    elements.statusDot.className = "online";
  } catch (error) {
    elements.error.hidden = false;
    elements.error.innerHTML = `<strong>Daten konnten nicht geladen werden.</strong><br>${escapeHtml(error.message)} Bitte versuche es später erneut.`;
    elements.syncStatus.textContent = "Verbindung fehlgeschlagen";
    elements.statusDot.className = "error";
  } finally {
    elements.loading.hidden = true;
    elements.refresh.disabled = false;
  }
}

function setOptions(select, values, initialLabel) {
  const current = select.value;
  select.replaceChildren(new Option(initialLabel, ""));
  values.forEach((value) => select.add(new Option(value, value)));
  select.value = values.includes(current) ? current : "";
}

function populateFilters() {
  const years = [...new Set(state.publications.map((item) => item.publication?.publicationYear).filter(Boolean))]
    .sort((a, b) => Number(b) - Number(a));
  const journals = [...new Set(state.publications.map((item) => item.publication?.journalTitle).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "de"));
  const features = [...new Set(state.publications.flatMap(getFeatures))]
    .sort((a, b) => a.localeCompare(b, "de"));

  setOptions(filterElements.year, years, "Alle Jahre");
  setOptions(filterElements.journal, journals, "Alle Journals");
  setOptions(filterElements.feature, features, "Alle Merkmale");
}

function updateSummary() {
  const years = state.publications.map((item) => Number(item.publication?.publicationYear)).filter(Boolean);
  const datasets = state.publications.flatMap(getDatasets);
  elements.publicationCount.textContent = state.publications.length.toLocaleString("de-DE");
  elements.datasetCount.textContent = datasets.length.toLocaleString("de-DE");
  elements.yearRange.textContent = years.length ? `${Math.min(...years)}–${Math.max(...years)}` : "–";
}

function matchesDataFilter(publication, filter) {
  if (!filter) return true;
  const datasets = getDatasets(publication);
  if (filter === "published") return datasets.some((dataset) => dataset.isPublished);
  if (filter === "request") return datasets.some((dataset) => !dataset.isPublished);
  return datasets.length === 0;
}

function getFilteredPublications() {
  const query = state.filters.search.trim().toLocaleLowerCase("de");
  const filtered = state.publications.filter((item) => {
    const publication = item.publication || {};
    return (!query || searchableText(item).includes(query))
      && (!state.filters.year || publication.publicationYear === state.filters.year)
      && (!state.filters.journal || publication.journalTitle === state.filters.journal)
      && (!state.filters.feature || getFeatures(item).includes(state.filters.feature))
      && matchesDataFilter(item, state.filters.data);
  });

  return filtered.sort((a, b) => {
    if (state.filters.sort === "year-asc") return Number(a.publication?.publicationYear) - Number(b.publication?.publicationYear);
    if (state.filters.sort === "title-asc") return (a.publication?.publicationTitle || "").localeCompare(b.publication?.publicationTitle || "", "de");
    if (state.filters.sort === "datasets-desc") return getDatasets(b).length - getDatasets(a).length;
    return Number(b.publication?.publicationYear) - Number(a.publication?.publicationYear);
  });
}

function authorLabel(author) {
  return [author.givenName, author.familyName].filter(Boolean).join(" ");
}

function datasetLink(dataset) {
  if (dataset.identifier?.url) return safeUrl(dataset.identifier.url);
  if (dataset.identifier?.doi) return safeUrl(`https://doi.org/${dataset.identifier.doi}`);
  return "";
}

function renderDataset(dataset) {
  const link = datasetLink(dataset);
  const chips = [...new Set((dataset.chips || []).map((chip) => chip.title).filter(Boolean))].slice(0, 12);
  return `
    <article class="dataset ${dataset.isPublished ? "published" : ""}">
      <div class="dataset-head">
        <strong>${escapeHtml(dataset.name || dataset.publicationService || "Datensatz")}</strong>
        ${link ? `<a href="${escapeHtml(link)}" target="_blank" rel="noreferrer">${escapeHtml(dataset.publicationService || "Öffnen")} ↗</a>` : `<span class="tag request">Auf Anfrage</span>`}
      </div>
      ${chips.length ? `<div class="dataset-chips">${chips.map((chip) => `<span>${escapeHtml(chip)}</span>`).join("")}</div>` : ""}
    </article>`;
}

function renderPublication(item) {
  const publication = item.publication || {};
  const datasets = getDatasets(item);
  const publishedCount = datasets.filter((dataset) => dataset.isPublished).length;
  const requestCount = datasets.length - publishedCount;
  const doiUrl = publication.doi ? safeUrl(`https://doi.org/${publication.doi}`) : "";
  const authors = (publication.authors || []).map(authorLabel).filter(Boolean);
  const visibleAuthors = authors.slice(0, 8).join(", ") + (authors.length > 8 ? ` + ${authors.length - 8} weitere` : "");
  const features = getFeatures(item).slice(0, 5);

  return `
    <article class="publication-card">
      <div class="publication-year">${escapeHtml(publication.publicationYear || "–")}</div>
      <div class="publication-main">
        ${publication.journalTitle ? `<p class="journal">${escapeHtml(publication.journalTitle)}</p>` : ""}
        <h3>${doiUrl ? `<a href="${escapeHtml(doiUrl)}" target="_blank" rel="noreferrer">${escapeHtml(publication.publicationTitle || "Ohne Titel")}</a>` : escapeHtml(publication.publicationTitle || "Ohne Titel")}</h3>
        ${visibleAuthors ? `<p class="authors">${escapeHtml(visibleAuthors)}</p>` : ""}
        <div class="card-meta">
          ${publishedCount ? `<span class="tag data">${publishedCount} veröffentlicht${publishedCount === 1 ? "er Datensatz" : "e Datensätze"}</span>` : ""}
          ${requestCount ? `<span class="tag request">${requestCount} auf Anfrage</span>` : ""}
          ${features.map((feature) => `<span class="tag">${escapeHtml(feature)}</span>`).join("")}
        </div>
      </div>
      <div class="publication-action">
        ${doiUrl ? `<a class="doi-link" href="${escapeHtml(doiUrl)}" target="_blank" rel="noreferrer" aria-label="DOI öffnen" title="DOI öffnen">↗</a>` : ""}
      </div>
      ${datasets.length ? `<details class="datasets"><summary>${datasets.length} zugehörige${datasets.length === 1 ? "n Datensatz" : " Datensätze"} anzeigen</summary><div class="dataset-grid">${datasets.map(renderDataset).join("")}</div></details>` : ""}
    </article>`;
}

function render() {
  const publications = getFilteredPublications();
  elements.resultCount.textContent = publications.length.toLocaleString("de-DE");
  elements.list.innerHTML = publications.map(renderPublication).join("");
  elements.empty.hidden = publications.length !== 0 || state.publications.length === 0;
}

Object.entries(filterElements).forEach(([name, element]) => {
  element.addEventListener(name === "search" ? "input" : "change", () => {
    state.filters[name] = element.value;
    render();
  });
});

document.querySelector("#reset-filters").addEventListener("click", () => {
  state.filters = { search: "", year: "", journal: "", feature: "", data: "", sort: "year-desc" };
  Object.entries(filterElements).forEach(([name, element]) => { element.value = state.filters[name]; });
  render();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "/" && document.activeElement?.tagName !== "INPUT") {
    event.preventDefault();
    filterElements.search.focus();
  }
});

elements.refresh.addEventListener("click", loadPublications);
loadPublications();
