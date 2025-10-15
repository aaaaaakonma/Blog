// prefetch.js - Intelligent Prefetch + Prerender for Vercel Blogs

class ArticlePrefetcher {
  constructor(options = {}) {
    this.options = {
      prefetchDelay: options.prefetchDelay || 50,
      useIntersectionObserver: options.useIntersectionObserver !== false,
      connectionThreshold: options.connectionThreshold || "3g",
      maxConcurrentPrefetch: options.maxConcurrentPrefetch || 3,
      autoHijackClicks: options.autoHijackClicks !== false, // enable instant navigation
      ...options,
    };

    this.prefetchedUrls = new Set();
    this.prefetchQueue = [];
    this.activePrefetches = 0;
    this.hoverTimers = new Map();
    this.prerenderContainer = null;

    this.shouldPrefetch = this.checkConnection();
    this.init();
  }

  // ---------- CONNECTION CHECK ----------
  checkConnection() {
    if (!navigator.connection) return true;
    const c = navigator.connection;
    if (c.saveData) return false;
    if (c.effectiveType === "slow-2g" || c.effectiveType === "2g") return false;
    return true;
  }

  // ---------- INIT ----------
  init() {
    if (!this.shouldPrefetch) {
      console.log("Prefetching disabled (connection too slow)");
      return;
    }

    if (this.options.useIntersectionObserver) {
      this.setupIntersectionObserver();
    }
    this.observeNewCards();

    if (this.options.autoHijackClicks) {
      this.hijackClicks();
    }
  }

  setupIntersectionObserver() {
    const opts = {
      root: null,
      rootMargin: "50px",
      threshold: 0.1,
    };

    this.intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) this.attachHoverListener(entry.target);
      });
    }, opts);

    this.observeAllCards();
  }

  observeAllCards() {
    document.querySelectorAll("article[data-slug]").forEach((card) => {
      if (this.intersectionObserver) {
        this.intersectionObserver.observe(card);
      } else {
        this.attachHoverListener(card);
      }
    });
  }

  observeNewCards() {
    const container = document.getElementById("articles-container");
    if (!container) return;

    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1 && node.matches("article[data-slug]")) {
            if (this.intersectionObserver) {
              this.intersectionObserver.observe(node);
            } else {
              this.attachHoverListener(node);
            }
          }
        }
      }
    });

    mo.observe(container, { childList: true, subtree: true });
  }

  // ---------- HOVER / PREFETCH ----------
  attachHoverListener(card) {
    const slug = card.dataset.slug;
    if (!slug) return;

    card.addEventListener("mouseenter", () => this.handleMouseEnter(slug, card));
    card.addEventListener("mouseleave", () => this.handleMouseLeave(slug));
    card.addEventListener("touchstart", () => this.prefetchArticle(slug), { passive: true });
  }

  handleMouseEnter(slug, card) {
    if (this.hoverTimers.has(slug)) clearTimeout(this.hoverTimers.get(slug));
    const timer = setTimeout(() => {
      this.prefetchArticle(slug);
      this.hoverTimers.delete(slug);
      card.style.transform = "translateY(-2px)";
    }, this.options.prefetchDelay);
    this.hoverTimers.set(slug, timer);
  }

  handleMouseLeave(slug) {
    const card = document.querySelector(`article[data-slug="${slug}"]`);
    if (card) card.style.transform = "";
    if (this.hoverTimers.has(slug)) {
      clearTimeout(this.hoverTimers.get(slug));
      this.hoverTimers.delete(slug);
    }
  }

  // ---------- PREFETCH + PRERENDER ----------
  async prefetchArticle(slug) {
    if (this.prefetchedUrls.has(slug)) return;
    if (this.activePrefetches >= this.options.maxConcurrentPrefetch) {
      this.prefetchQueue.push(slug);
      return;
    }

    const articleUrl = `./articles/${slug}/index.html`;

    try {
      this.activePrefetches++;
      this.prefetchedUrls.add(slug);

      const html = await this.prefetchAndGetHTML(articleUrl);
      this.prerenderArticle(slug, html);

      console.log(`✓ Prefetched + Prerendered: ${slug}`);
    } catch (err) {
      console.error(`✗ Failed to prerender ${slug}:`, err);
      this.prefetchedUrls.delete(slug);
    } finally {
      this.activePrefetches--;
      this.processQueue();
    }
  }

  async prefetchAndGetHTML(url) {
    const res = await fetch(url, { priority: "low", cache: "force-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  }

  prerenderArticle(slug, htmlContent) {
    if (!this.prerenderContainer) {
      this.prerenderContainer = document.createElement("div");
      Object.assign(this.prerenderContainer.style, {
        position: "absolute",
        width: "0",
        height: "0",
        overflow: "hidden",
        opacity: "0",
        pointerEvents: "none",
      });
      document.body.appendChild(this.prerenderContainer);
    }

    // Replace if already exists
    const old = this.getPrerendered(slug);
    if (old) old.remove();

    const wrapper = document.createElement("div");
    wrapper.dataset.slug = slug;
    wrapper.innerHTML = htmlContent;
    this.prerenderContainer.appendChild(wrapper);
  }

  getPrerendered(slug) {
    return this.prerenderContainer?.querySelector(`[data-slug="${slug}"]`) || null;
  }

  processQueue() {
    if (this.prefetchQueue.length === 0) return;
    if (this.activePrefetches >= this.options.maxConcurrentPrefetch) return;
    const slug = this.prefetchQueue.shift();
    this.prefetchArticle(slug);
  }

  // ---------- NAVIGATION ----------
  hijackClicks() {
    document.addEventListener("click", (e) => {
      const article = e.target.closest("article[data-slug]");
      if (!article) return;

      const slug = article.dataset.slug;
      if (!slug) return;

      e.preventDefault();

      const prerendered = this.getPrerendered(slug);
      if (prerendered) {
        const container = document.getElementById("articles-container");
        if (container) {
          container.innerHTML = prerendered.innerHTML;
          window.scrollTo({ top: 0, behavior: "instant" });
          console.log(`⚡ Instant render: ${slug}`);
        }
      } else {
        // fallback: fetch and render
        fetch(`./articles/${slug}/index.html`)
          .then((r) => r.text())
          .then((html) => {
            const container = document.getElementById("articles-container");
            if (container) container.innerHTML = html;
          });
      }
    });
  }

  // ---------- UTILITIES ----------
  prefetch(slug) {
    return this.prefetchArticle(slug);
  }

  prefetchAll() {
    document.querySelectorAll("article[data-slug]").forEach((c) => {
      const slug = c.dataset.slug;
      if (slug) this.prefetchQueue.push(slug);
    });
    this.processQueue();
  }

  clear() {
    this.prefetchedUrls.clear();
    this.prefetchQueue = [];
    this.hoverTimers.forEach((t) => clearTimeout(t));
    this.hoverTimers.clear();
    if (this.prerenderContainer) this.prerenderContainer.innerHTML = "";
  }

  getStats() {
    return {
      prefetched: this.prefetchedUrls.size,
      queued: this.prefetchQueue.length,
      active: this.activePrefetches,
      urls: Array.from(this.prefetchedUrls),
    };
  }
}

// Auto-init
if (typeof window !== "undefined") {
  window.ArticlePrefetcher = ArticlePrefetcher;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      window.articlePrefetcher = new ArticlePrefetcher({
        prefetchDelay: 50,
        maxConcurrentPrefetch: 2,
      });
    });
  } else {
    window.articlePrefetcher = new ArticlePrefetcher({
      prefetchDelay: 50,
      maxConcurrentPrefetch: 2,
    });
  }
}

// For module usage
if (typeof module !== "undefined" && module.exports) {
  module.exports = ArticlePrefetcher;
}
