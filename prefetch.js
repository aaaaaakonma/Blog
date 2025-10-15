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

    this.prefetchedSlugs = new Set();
    this.htmlCache = new Map();
    this.prefetchQueue = [];
    this.activePrefetches = 0;
    this.hoverTimers = new Map();
    this.renderer = null; // Will be initialized later

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
    
    // Defer initialization until MarkdownRenderer is available
    const checkDependencies = () => {
      if (typeof MarkdownRenderer !== 'undefined') {
        this.renderer = new MarkdownRenderer();
        if (this.options.useIntersectionObserver) {
          this.setupIntersectionObserver();
        }
        this.observeNewCards();

        if (this.options.autoHijackClicks) {
          this.hijackClicks();
        }
      } else {
        setTimeout(checkDependencies, 50); // Check again shortly
      }
    };
    checkDependencies();
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
    if (this.prefetchedSlugs.has(slug)) return;
    if (this.activePrefetches >= this.options.maxConcurrentPrefetch) {
      this.prefetchQueue.push(slug);
      return;
    }
    
    if (!this.renderer) {
        console.error("MarkdownRenderer not available for prefetching.");
        return;
    }

    const articleMdUrl = `./articles/${slug}/article.md`;

    try {
      this.activePrefetches++;
      this.prefetchedSlugs.add(slug);

      const html = await this.renderer.renderFile(articleMdUrl);
      this.htmlCache.set(slug, html);

      console.log(`✓ Prefetched and rendered: ${slug}`);
    } catch (err) {
      console.error(`✗ Failed to prefetch/render ${slug}:`, err);
      this.prefetchedSlugs.delete(slug); // Allow retrying
    } finally {
      this.activePrefetches--;
      this.processQueue();
    }
  }

  processQueue() {
    if (this.prefetchQueue.length === 0) return;
    if (this.activePrefetches >= this.options.maxConcurrentPrefetch) return;
    const slug = this.prefetchQueue.shift();
    this.prefetchArticle(slug);
  }

  // ---------- NAVIGATION ----------
  hijackClicks() {
    document.addEventListener("click", async (e) => {
      const articleCard = e.target.closest("article[data-slug]");
      if (!articleCard) return;

      const slug = articleCard.dataset.slug;
      if (!slug) return;

      e.preventDefault();

      if (window.ArticleNavigator) {
        const navigator = new ArticleNavigator();
        await navigator.init();

        if (this.htmlCache.has(slug)) {
          const htmlContent = this.htmlCache.get(slug);
          const metadataResponse = await fetch(`./articles/${slug}/metadata.json`);
          const metadata = await metadataResponse.json();

          navigator.currentArticle = {
            slug,
            ...metadata,
            htmlContent,
          };
          navigator.renderArticlePage();
          history.pushState({ slug }, "", `?article=${slug}`);
          console.log(`⚡ Instant render from cache: ${slug}`);
        } else {
          await navigator.loadArticle(slug);
          history.pushState({ slug }, "", `?article=${slug}`);
        }
      } else {
        window.location.href = `?article=${slug}`;
      }
    });

    window.addEventListener("popstate", (event) => {
      const urlParams = new URLSearchParams(window.location.search);
      const articleSlug = urlParams.get("article");
      if (articleSlug) {
        if (window.ArticleNavigator) {
            const navigator = new ArticleNavigator();
            navigator.init().then(() => navigator.loadArticle(articleSlug));
        } else {
            window.location.href = `?article=${articleSlug}`;
        }
      } else {
        window.location.href = window.location.pathname;
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
    this.prefetchedSlugs.clear();
    this.htmlCache.clear();
    this.prefetchQueue = [];
    this.hoverTimers.forEach((t) => clearTimeout(t));
    this.hoverTimers.clear();
  }

  getStats() {
    return {
      prefetched: this.prefetchedSlugs.size,
      cached: this.htmlCache.size,
      queued: this.prefetchQueue.length,
      active: this.activePrefetches,
      slugs: Array.from(this.prefetchedSlugs),
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