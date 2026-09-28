/* Fest gallery: featured banner, segment filters, infinite card grid,
   and <dialog> lightbox. Renders from window.GALLERY_DATA
   (see gallery-data.js). No dependencies. Built for 450+ photos:
   the grid shows small `thumb` files only, appends PAGE_SIZE cards at
   a time via infinite scroll, and lazy-loads everything off-screen.
   Each card + the lightbox offer a full-size (`src`) download. */
(function () {
  "use strict";

  var PAGE_SIZE = 24;

  // Canonical segment order for a professional album. Categories not in
  // this list still work — they sort after these, alphabetically.
  var CATEGORY_ORDER = ["Winners", "Opening Ceremony", "Competitions", "Closing Ceremony"];

  var grid = document.getElementById("galleryGrid");
  if (!grid) return;

  var data = window.GALLERY_DATA || { photos: [] };
  var photos = Array.isArray(data.photos) ? data.photos : [];
  var featuredWrap = document.getElementById("featuredWrap");
  var filtersEl = document.getElementById("galleryFilters");
  var emptyEl = document.getElementById("galleryEmpty");
  var countEl = document.getElementById("galleryCount");
  var moreWrap = document.getElementById("loadMoreWrap");
  var dialog = document.getElementById("lightbox");
  var dialogImg = document.getElementById("lightboxImg");
  var dialogCap = document.getElementById("lightboxCap");
  var dialogCount = document.getElementById("lightboxCount");

  var activeFilter = "All";
  var visibleList = photos.slice();
  var activeList = visibleList; // what the lightbox navigates
  var renderedCount = 0;
  var currentIndex = 0;
  var sentinelObserver = null;
  var isRendering = false;

  function rank(photo) {
    var i = CATEGORY_ORDER.indexOf(photo && photo.category);
    return i === -1 ? CATEGORY_ORDER.length : i;
  }

  function applyFilter() {
    if (activeFilter === "All") {
      // Keep segments together in CATEGORY_ORDER.
      visibleList = photos.slice().sort(function (a, b) {
        return rank(a) - rank(b);
      });
    } else {
      visibleList = photos.filter(function (p) { return p && p.category === activeFilter; });
    }
  }

  function categories() {
    var seen = [];
    photos.forEach(function (p) {
      if (p && p.category && seen.indexOf(p.category) === -1) seen.push(p.category);
    });
    var ordered = CATEGORY_ORDER.filter(function (c) { return seen.indexOf(c) !== -1; });
    var extra = seen.filter(function (c) { return CATEGORY_ORDER.indexOf(c) === -1; }).sort();
    return ordered.concat(extra);
  }

  /* ---------- Featured banner: the big BBCC family photo ---------- */
  function featuredPhoto() {
    var f = data.featured;
    if (!f || !f.src) return null;
    return {
      src: f.src,
      thumb: f.thumb || f.src,
      tag: f.tag || "The BBCC Family",
      alt: f.alt || "The BBCC family",
      caption: f.caption || f.alt || "The BBCC Family",
    };
  }

  function renderFeatured() {
    if (!featuredWrap) return;
    featuredWrap.innerHTML = "";
    var f = featuredPhoto();
    var card = document.createElement("article");
    card.className = "featured";

    if (!f) {
      card.className += " featured-empty";
      card.setAttribute("aria-label", "BBCC family photo coming soon");
      var empty = document.createElement("div");
      empty.className = "featured-placeholder";
      var t = document.createElement("span");
      t.className = "g-tag";
      t.textContent = "The BBCC Family";
      var h = document.createElement("p");
      h.className = "featured-placeholder-title";
      h.textContent = "Group photo coming soon";
      var s = document.createElement("p");
      s.className = "featured-placeholder-sub";
      s.textContent = "The big BBCC family portrait will headline the gallery here.";
      empty.appendChild(t);
      empty.appendChild(h);
      empty.appendChild(s);
      card.appendChild(empty);
      featuredWrap.appendChild(card);
      return;
    }

    card.setAttribute("tabindex", "0");
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", "View photo: " + f.alt);
    var figure = document.createElement("figure");
    var img = document.createElement("img");
    img.src = f.thumb;
    img.alt = f.alt;
    img.loading = "eager";
    img.decoding = "async";
    if ("fetchPriority" in img) img.fetchPriority = "high";
    figure.appendChild(img);
    var body = document.createElement("div");
    body.className = "featured-body";
    var tag = document.createElement("span");
    tag.className = "g-tag";
    tag.textContent = f.tag;
    var cap = document.createElement("p");
    cap.textContent = f.caption;
    body.appendChild(tag);
    body.appendChild(cap);
    card.appendChild(figure);
    card.appendChild(body);

    function open() { openLightboxSingle(f); }
    card.addEventListener("click", open);
    card.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    });
    featuredWrap.appendChild(card);
  }

  /* ---------- Segment filters ---------- */
  function renderFilters() {
    if (!filtersEl) return;
    filtersEl.innerHTML = "";
    var cats = ["All"].concat(categories());
    cats.forEach(function (cat) {
      var n = cat === "All" ? photos.length : photos.filter(function (p) { return p && p.category === cat; }).length;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "filter-btn";
      btn.setAttribute("aria-pressed", cat === activeFilter ? "true" : "false");
      btn.appendChild(document.createTextNode(cat + " "));
      var c = document.createElement("span");
      c.className = "count";
      c.textContent = "(" + n + ")";
      btn.appendChild(c);
      btn.addEventListener("click", function () {
        if (activeFilter === cat) return;
        activeFilter = cat;
        renderFilters();
        resetGrid();
      });
      filtersEl.appendChild(btn);
    });
  }

  /* ---------- Infinite grid ---------- */
  function gridSrc(photo) {
    return (photo && (photo.thumb || photo.src)) || "";
  }

  function fullSrc(photo) {
    return (photo && photo.src) || gridSrc(photo);
  }

  function fileNameOf(url) {
    if (!url) return "bbcc-ict-fest-photo.jpg";
    var clean = String(url).split("?")[0].split("#")[0];
    var base = clean.substring(clean.lastIndexOf("/") + 1) || "bbcc-ict-fest-photo.jpg";
    return base;
  }

  function cardTemplate(photo, index) {
    var card = document.createElement("article");
    card.className = "g-card";
    card.setAttribute("tabindex", "0");
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", "View photo: " + (photo.alt || photo.caption || "Fest photo"));

    var figure = document.createElement("figure");
    var img = document.createElement("img");
    img.src = gridSrc(photo);
    img.alt = photo.alt || photo.caption || "Photo from the 1st BBCC ICT Fest";
    img.loading = "lazy";
    img.decoding = "async";
    figure.appendChild(img);

    var cap = document.createElement("figcaption");
    if (photo.category) {
      var tag = document.createElement("span");
      tag.className = "g-tag";
      tag.textContent = photo.category;
      cap.appendChild(tag);
    }
    var row = document.createElement("div");
    row.className = "g-card-row";
    var text = document.createElement("p");
    text.textContent = photo.caption || photo.alt || "Fest moment";
    row.appendChild(text);

    var dl = document.createElement("a");
    dl.className = "g-download";
    dl.href = fullSrc(photo);
    dl.setAttribute("download", fileNameOf(fullSrc(photo)));
    dl.setAttribute("aria-label", "Download full-size photo: " + (photo.caption || photo.alt || "Fest photo"));
    dl.setAttribute("title", "Download");
    dl.addEventListener("click", function (e) { e.stopPropagation(); });
    dl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg><span>Download</span>';
    row.appendChild(dl);

    cap.appendChild(row);

    card.appendChild(figure);
    card.appendChild(cap);

    function open() { openLightbox(index); }
    card.addEventListener("click", open);
    card.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    });
    return card;
  }

  function hasMore() {
    return photos.length !== 0 && renderedCount < visibleList.length;
  }

  function updateSentinel() {
    if (!moreWrap) return;
    if (!hasMore()) {
      moreWrap.hidden = true;
      moreWrap.innerHTML = "";
      return;
    }
    moreWrap.hidden = false;
    if (!moreWrap.firstChild) {
      var loader = document.createElement("p");
      loader.className = "infinite-loader";
      loader.setAttribute("aria-live", "polite");
      var spinner = document.createElement("span");
      spinner.className = "infinite-spinner";
      spinner.setAttribute("aria-hidden", "true");
      loader.appendChild(spinner);
      loader.appendChild(document.createTextNode("Loading more photos…"));
      moreWrap.appendChild(loader);
    }
  }

  function renderNextPage() {
    if (isRendering) return;
    if (renderedCount >= visibleList.length) {
      updateSentinel();
      return;
    }
    isRendering = true;
    var frag = document.createDocumentFragment();
    var end = Math.min(renderedCount + PAGE_SIZE, visibleList.length);
    for (var i = renderedCount; i < end; i++) {
      frag.appendChild(cardTemplate(visibleList[i], i));
    }
    grid.appendChild(frag);
    renderedCount = end;
    isRendering = false;
    if (countEl && photos.length !== 0) {
      countEl.textContent = "Showing " + renderedCount + " of " + visibleList.length + " photos";
    }
    updateSentinel();
  }

  function setupInfiniteScroll() {
    if (!moreWrap) return;
    if (sentinelObserver) {
      sentinelObserver.disconnect();
      sentinelObserver = null;
    }
    if (!("IntersectionObserver" in window)) {
      // Fallback: load more on scroll when near the bottom.
      if (window.__galleryScrollFallback) {
        window.removeEventListener("scroll", window.__galleryScrollFallback);
      }
      var onScroll = function () {
        if (!hasMore()) return;
        var rect = moreWrap.getBoundingClientRect();
        if (rect.top - window.innerHeight < 600) renderNextPage();
      };
      window.__galleryScrollFallback = onScroll;
      window.addEventListener("scroll", onScroll, { passive: true });
      return;
    }
    sentinelObserver = new IntersectionObserver(function (entries) {
      if (entries && entries[0] && entries[0].isIntersecting) renderNextPage();
    }, { root: null, rootMargin: "600px 0px", threshold: 0 });
    sentinelObserver.observe(moreWrap);
  }

  function resetGrid() {
    applyFilter();
    grid.innerHTML = "";
    renderedCount = 0;
    if (moreWrap) moreWrap.innerHTML = "";
    var isEmpty = visibleList.length === 0;
    grid.hidden = isEmpty && photos.length === 0;
    if (emptyEl) emptyEl.hidden = photos.length !== 0;
    if (countEl && photos.length === 0) countEl.textContent = "";
    if (!isEmpty) renderNextPage();
    else updateSentinel();
  }

  /* ---------- Lightbox ---------- */
  function preload(src) {
    if (!src) return;
    var im = new Image();
    im.decoding = "async";
    im.src = src;
  }

  function showCurrent() {
    var photo = activeList[currentIndex];
    if (!photo) return;
    dialogImg.src = photo.src;
    dialogImg.alt = photo.alt || photo.caption || "Photo from the 1st BBCC ICT Fest";
    dialogCap.textContent = photo.caption || photo.alt || "";
    dialogCount.textContent = activeList.length > 1 ? (currentIndex + 1) + " / " + activeList.length : "";
    var dlBtn = document.getElementById("lightboxDownload");
    if (dlBtn) {
      var full = (photo && photo.src) || "";
      dlBtn.href = full;
      dlBtn.setAttribute("download", fileNameOf(full));
      dlBtn.setAttribute("aria-label", "Download full-size photo: " + (photo.caption || photo.alt || "Fest photo"));
      dlBtn.style.display = full ? "" : "none";
    }
    var prev = activeList[(currentIndex - 1 + activeList.length) % activeList.length];
    var next = activeList[(currentIndex + 1) % activeList.length];
    if (prev) preload(prev.src);
    if (next) preload(next.src);
    var hasMany = activeList.length > 1;
    var prevBtn = document.getElementById("lightboxPrev");
    var nextBtn = document.getElementById("lightboxNext");
    if (prevBtn) prevBtn.hidden = !hasMany;
    if (nextBtn) nextBtn.hidden = !hasMany;
  }

  function step(d) {
    if (activeList.length < 2) return;
    currentIndex = (currentIndex + d + activeList.length) % activeList.length;
    showCurrent();
  }

  function present() {
    if (!dialog || typeof dialog.showModal !== "function") {
      window.open(activeList[currentIndex].src, "_blank", "noopener");
      return;
    }
    showCurrent();
    dialog.showModal();
  }

  function openLightbox(index) {
    activeList = visibleList;
    currentIndex = index;
    present();
  }

  function openLightboxSingle(photo) {
    activeList = [photo];
    currentIndex = 0;
    present();
  }

  if (dialog) {
    var closeBtn = document.getElementById("lightboxClose");
    var prevBtn = document.getElementById("lightboxPrev");
    var nextBtn = document.getElementById("lightboxNext");
    if (closeBtn) closeBtn.addEventListener("click", function () { dialog.close(); });
    if (prevBtn) prevBtn.addEventListener("click", function () { step(-1); });
    if (nextBtn) nextBtn.addEventListener("click", function () { step(1); });
    dialog.addEventListener("click", function (e) {
      if (e.target === dialog) dialog.close();
    });
    dialog.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
    });
  }

  renderFeatured();
  renderFilters();
  resetGrid();
  setupInfiniteScroll();
})();
