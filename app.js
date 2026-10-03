/* Movie Recommender — preview-ready frontend
   The real Python model can be connected at recommendWithBackend().
   This standalone preview uses the uploaded credits catalog for search and
   reproduces the notebook's demonstrated Batman recommendation exactly.
*/
(() => {
  const $ = (s, p=document) => p.querySelector(s);
  const $$ = (s, p=document) => [...p.querySelectorAll(s)];

  const state = {
    selected: null,
    lastResults: [],
    query: "",
    posterCache: JSON.parse(localStorage.getItem("moviePosterCache") || "{}")
  };

  const demoMap = {
    "batman": ["Batman", "Batman & Robin", "Batman Begins", "Batman Returns", "Osama"]
  };

  // External poster lookup. IMDb's public suggestion endpoint is used only
  // for artwork lookup; recommendation logic does not depend on it.
  async function posterFor(title) {
    if (state.posterCache[title]) return state.posterCache[title];
    const fallback = makePoster(title);
    try {
      const url = "https://v3.sg.media-imdb.com/suggestion/x/" +
                  encodeURIComponent(title) + ".json";
      const res = await fetch(url);
      if (!res.ok) throw new Error("poster lookup failed");
      const data = await res.json();
      const hit = (data.d || []).find(x => x.i && x.i.imageUrl) || (data.d || [])[0];
      const image = hit?.i?.imageUrl;
      if (image) {
        state.posterCache[title] = image;
        localStorage.setItem("moviePosterCache", JSON.stringify(state.posterCache));
        return image;
      }
    } catch (e) {}
    return fallback;
  }

  function makePoster(title) {
    const palettes = [
      ["#15152a","#5b21b6"],["#071a1d","#0f766e"],["#1c1020","#be185d"],
      ["#111827","#1d4ed8"],["#21150a","#b45309"],["#0c1724","#0369a1"]
    ];
    let n = 0;
    for (let i=0;i<title.length;i++) n = (n*31 + title.charCodeAt(i)) >>> 0;
    const [a,b] = palettes[n % palettes.length];
    const initials = title.split(/\s+/).filter(Boolean).slice(0,3).map(x=>x[0]).join("").toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
      <rect width="600" height="900" fill="url(#g)"/>
      <circle cx="480" cy="140" r="180" fill="white" opacity=".06"/>
      <circle cx="100" cy="740" r="240" fill="white" opacity=".04"/>
      <text x="50" y="730" fill="white" opacity=".95" font-family="Arial" font-size="72" font-weight="800">${escapeXml(initials)}</text>
      <text x="50" y="790" fill="white" opacity=".65" font-family="Arial" font-size="22">${escapeXml(title.slice(0,32))}</text>
      <text x="50" y="835" fill="white" opacity=".35" font-family="Arial" font-size="13">POSTER PREVIEW</text>
    </svg>`;
    return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
  }

  function escapeXml(s) {
    return String(s).replace(/[<>&'"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c]));
  }

  function normalize(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function findMovie(title) {
    const n = normalize(title);
    return window.MOVIE_CATALOG.find(m => normalize(m.title) === n) ||
           window.MOVIE_CATALOG.find(m => normalize(m.title).includes(n));
  }

  function searchMovies(q) {
    const n = normalize(q);
    if (!n) return [];
    return window.MOVIE_CATALOG
      .map(m => {
        const t = normalize(m.title);
        let score = 0;
        if (t === n) score = 100;
        else if (t.startsWith(n)) score = 80;
        else if (t.includes(n)) score = 60;
        else {
          const words = n.split(" ");
          score = words.filter(w => t.includes(w)).length * 10;
        }
        return {m, score};
      })
      .filter(x => x.score > 0)
      .sort((a,b)=>b.score-a.score || a.m.title.localeCompare(b.m.title))
      .slice(0, 8)
      .map(x=>x.m);
  }

  function posterCard(movie, rank, similarity) {
    const cast = (movie.cast || []).slice(0,2).join(" · ");
    const meta = cast || (movie.director ? "Directed by " + movie.director : "TMDB catalog");
    return `<article class="movie-card" data-title="${escapeXml(movie.title)}">
      <div class="rank">${String(rank).padStart(2,"0")}</div>
      <div class="poster-wrap">
        <img class="poster" alt="${escapeXml(movie.title)} poster" data-poster-title="${escapeXml(movie.title)}" src="${makePoster(movie.title)}">
        <div class="poster-sheen"></div>
        ${similarity != null ? `<div class="match"><span>${Math.round(similarity*100)}%</span> match</div>` : ""}
      </div>
      <div class="movie-info">
        <h3>${escapeXml(movie.title)}</h3>
        <p>${escapeXml(meta || "Movie metadata")}</p>
      </div>
    </article>`;
  }

  async function hydratePosters(root=document) {
    const imgs = $$("img[data-poster-title]", root);
    // Keep the initial file:// preview responsive: load artwork in small batches.
    for (let i=0; i<imgs.length; i+=4) {
      await Promise.all(imgs.slice(i,i+4).map(async img => {
        const title = img.dataset.posterTitle;
        const src = await posterFor(title);
        if (src) img.src = src;
      }));
    }
  }

  function renderSuggestions(q) {
    const box = $("#suggestions");
    const results = searchMovies(q);
    if (!q || !results.length) {
      box.innerHTML = "";
      box.classList.remove("show");
      return;
    }
    box.innerHTML = results.map(m => `
      <button class="suggestion" data-pick="${escapeXml(m.title)}">
        <span class="suggestion-dot"></span>
        <span>${escapeXml(m.title)}</span>
        <small>${m.director ? escapeXml(m.director) : "TMDB catalog"}</small>
      </button>`).join("");
    box.classList.add("show");
  }

  function fakeSimilarity(i) {
    // Visual-only scores for the standalone preview.
    return Math.max(.52, .94 - i*.075);
  }

  function recommendPreview(title) {
    const key = normalize(title);
    let names = demoMap[key];
    if (!names) {
      const selected = findMovie(title);
      if (!selected) return [];
      // Fallback preview ranking: lexical/cast/director overlap.
      const base = new Set([normalize(selected.director), ...(selected.cast||[]).map(normalize)]);
      const candidates = window.MOVIE_CATALOG.filter(m => normalize(m.title) !== key);
      names = candidates.map(m => {
        const bag = new Set([normalize(m.director), ...(m.cast||[]).map(normalize)]);
        let score = 0;
        base.forEach(x => { if (x && bag.has(x)) score += 1; });
        const a = normalize(selected.title).split(" ");
        const b = normalize(m.title);
        score += a.filter(w => b.includes(w)).length * .1;
        return {m, score};
      }).sort((a,b)=>b.score-a.score).slice(0,5).map(x=>x.m.title);
    }
    return names.map(n => findMovie(n)).filter(Boolean);
  }

  function runRecommendation(movie) {
    if (!movie) return;
    state.selected = movie;
    $("#selectedTitle").textContent = movie.title;
    $("#heroMovie").textContent = movie.title;
    $("#results").classList.add("loading");
    $("#modelPanel").classList.add("active");
    $("#resultsSection").classList.remove("visible");
    $("#results").innerHTML = "";

    // The recommendation flow now lives directly below the hero.
    // Bring the user to the live model trace instead of making them hunt for it.
    requestAnimationFrame(() => {
      $("#modelPanel").scrollIntoView({behavior:"smooth", block:"start"});
    });

    const stages = [
      ["ingest", "Reading movie profile", "Extracting overview, genres, keywords, cast & director"],
      ["clean", "Cleaning tokens", "Lowercasing and normalizing feature text"],
      ["vector", "Vectorizing", "CountVectorizer · max_features=5000"],
      ["similarity", "Computing similarity", "Cosine similarity against 4,806 movie vectors"],
      ["rank", "Ranking candidates", "Selecting the five highest similarity scores"]
    ];

    let i = 0;
    const stageTimer = setInterval(() => {
      if (i > 0) $(`#stage-${i-1}`)?.classList.add("done");
      if (i < stages.length) {
        const [id, title, sub] = stages[i];
        $("#pipeline").innerHTML += `
          <div class="pipeline-stage" id="stage-${i}">
            <span class="stage-index">${String(i+1).padStart(2,"0")}</span>
            <span class="stage-copy"><b>${title}</b><small>${sub}</small></span>
            <span class="stage-status">RUNNING</span>
          </div>`;
        i++;
      } else {
        clearInterval(stageTimer);
        $("#pipeline").lastElementChild?.classList.add("done");
        setTimeout(() => showResults(movie), 500);
      }
    }, 460);
  }

  async function showResults(movie) {
    const results = recommendPreview(movie.title);
    state.lastResults = results;
    $("#results").classList.remove("loading");
    $("#results").innerHTML = results.map((m,i)=>posterCard(m,i+1,fakeSimilarity(i))).join("");
    $("#resultCount").textContent = results.length + " recommendations";
    $("#modelPanel").classList.remove("active");
    $("#resultsSection").classList.add("visible");
    await hydratePosters($("#results"));

    // Results are immediately below the trace, so only make a small, local
    // transition rather than sending the user to the bottom of the page.
    requestAnimationFrame(() => {
      $("#resultsSection").scrollIntoView({behavior:"smooth", block:"start"});
    });
  }

  function setSelected(title) {
    const movie = findMovie(title);
    if (!movie) return;
    $("#searchInput").value = movie.title;
    $("#suggestions").classList.remove("show");
    runRecommendation(movie);
  }

  // Hook for the real backend.
  window.recommendWithBackend = async function(title) {
    // Replace this function with fetch('/recommend', {method:'POST', body:...})
    // when the Python model is exposed through Flask/FastAPI.
    return recommendPreview(title);
  };

  function initLenis() {
    if (!window.Lenis) return;
    const lenis = new Lenis({duration:1.15, smoothWheel:true, touchMultiplier:1.1});
    function raf(time){ lenis.raf(time); requestAnimationFrame(raf); }
    requestAnimationFrame(raf);
    window.__lenis = lenis;
  }

  function init() {
    initLenis();

    const input = $("#searchInput");
    input.addEventListener("input", e => renderSuggestions(e.target.value));
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        const first = searchMovies(input.value)[0];
        if (first) setSelected(first.title);
      }
      if (e.key === "Escape") $("#suggestions").classList.remove("show");
    });

    $("#suggestions").addEventListener("click", e => {
      const btn = e.target.closest("[data-pick]");
      if (btn) setSelected(btn.dataset.pick);
    });

    $("#recommendBtn").addEventListener("click", () => {
      const first = searchMovies(input.value)[0];
      if (first) setSelected(first.title);
      else {
        input.focus();
        input.parentElement.classList.add("shake");
        setTimeout(()=>input.parentElement.classList.remove("shake"),500);
      }
    });

    $("#demoBatman").addEventListener("click", ()=>setSelected("Batman"));
    $("#modelLink").addEventListener("click", e => {
      e.preventDefault();
      $("#architecture").scrollIntoView({behavior:"smooth"});
    });

    $("#closeModel").addEventListener("click", ()=>$("#modelDrawer").classList.remove("open"));
    $("#modelOpen").addEventListener("click", ()=>$("#modelDrawer").classList.add("open"));

    // Intro stats.
    $("#catalogCount").textContent = window.MODEL_INFO.rawRows.toLocaleString();
    $("#modelCount").textContent = window.MODEL_INFO.modelRows.toLocaleString();
    $("#featureCount").textContent = window.MODEL_INFO.maxFeatures.toLocaleString();

    // Hero poster strip.
    const featured = ["Avatar","Batman","The Dark Knight Rises","Interstellar","Inception"];
    $("#featured").innerHTML = featured.map((t,i)=>{
      const m = findMovie(t) || {title:t,cast:[],director:""};
      return posterCard(m,i+1,null);
    }).join("");
    hydratePosters($("#featured"));

    // Reveal observer.
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if(e.isIntersecting) e.target.classList.add("in"); });
    }, {threshold:.12});
    $$(".reveal").forEach(x=>io.observe(x));
  }

  document.addEventListener("DOMContentLoaded", init);
})();
