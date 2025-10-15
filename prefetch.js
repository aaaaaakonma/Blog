// prefetch.js — Generator-Compatible Prefetch + Prerender

class ArticlePrefetcher {
  constructor(options = {}) {
    this.options = {
      prefetchDelay: options.prefetchDelay || 60,
      maxConcurrentPrefetch: options.maxConcurrentPrefetch || 2,
      useIntersectionObserver: options.useIntersectionObserver !== false,
      ...options,
    };

    this.prefetched = new Set();
    this.renderCache = {};
    this.prefetchQueue = [];
    this.hoverTimers = new Map();
    this.activePrefetches = 0;

    this.shouldPrefetch = this.checkConnection();
    this.init();
  }

  checkConnection() {
    if (!navigator.connection) return true;
    const c = navigator.connection;
    if (c.saveData) return false;
    if (c.effectiveType === "slow-2g" || c.effectiveType === "2g") return false;
    return true;
  }

  init() {
    if (!this.shouldPrefetch) {
      console.log("⚠️ Prefetch disabled (slow connection)");
      return;
    }

    if (this.options.useIntersectionObserver) this.setupObserver();
    this.observeNewCards();
    this.hijackClicks();
  }

  setupObserver() {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) this.attachHover(entry.target);
        });
      },
      { rootMargin: "50px", threshold: 0.1 }
    );
    this.intersectionObserver = obs;
    this.observeAllCards();
  }

  observeAllCards() {
    document.querySelectorAll("article[data-slug]").forEach((card) => {
      if (this.intersectionObserver) {
        this.intersectionObserver.observe(card);
      } else {
        this.attachHover(card);
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
            this.attachHover(node);
          }
        }
      }
    });
    mo.observe(container, { childList: true, subtree: true });
  }

  attachHover(card) {
    const slug = card.dataset.slug;
    if (!slug) return;
    card.addEventListener("mouseenter", () => this.onHover(slug, card));
    card.addEventListener("mouseleave", () => this.onLeave(slug));
  }

  onHover(slug, card) {
    if (this.hoverTimers.has(slug)) clearTimeout(this.hoverTimers.get(slug));
    const t = setTimeout(() => {
      this.prefetchArticle(slug);
      this.hoverTimers.delete(slug);
      card.style.transform = "translateY(-2px)";
    }, this.options.prefetchDelay);
    this.hoverTimers.set(slug, t);
  }

  onLeave(slug) {
    const card = document.querySelector(`article[data-slug="${slug}"]`);
    if (card) card.style.transform = "";
    if (this.hoverTimers.has(slug)) {
      clearTimeout(this.hoverTimers.get(slug));
      this.hoverTimers.delete(slug);
    }
  }

  async prefetchArticle(slug) {
    if (this.prefetched.has(slug)) return;
    if (this.activePrefetches >= this.options.maxConcurrentPrefetch) {
      this.prefetchQueue.push(slug);
      return;
    }

    try {
      this.activePrefetches++;
      this.prefetched.add(slug);

      const articleNavigator = window.articleNavigator;
      const renderer = articleNavigator.renderer;

      // Load metadata and markdown, but don’t render to <main>
      const metadataResponse = await fetch(`${articleNavigator.articlesPath}/${slug}/metadata.json`);
      const metadata = await metadataResponse.json();
      const htmlContent = await renderer.renderFile(`${articleNavigator.articlesPath}/${slug}/article.md`);

      const html = articleNavigator.generateArticleHTML({
        slug,
        ...metadata,
        htmlContent,
      });

      // Cache as detached node
      const wrapper = document.createElement("div");
      wrapper.innerHTML = html;
      this.renderCache[slug] = wrapper.firstElementChild;

      console.log(`✓ Prerendered: ${slug}`);
    } catch (err) {
      console.error(`✗ Failed prerender ${slug}`, err);
      this.prefetched.delete(slug);
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

  hijackClicks() {
    document.addEventListener("click", (e) => {
      const card = e.target.closest("article[data-slug]");
      if (!card) return;
      e.preventDefault();
      const slug = card.dataset.slug;

      // Instant render if cached
      if (this.renderCache[slug]) {
        const main = document.querySelector("main");
        main.innerHTML = "";
        main.appendChild(this.renderCache[slug].cloneNode(true));
        document.title = `${slug} - Brutal Blog Box`;
        window.history.pushState({}, "", `?article=${slug}`);
        window.scrollTo({ top: 0, behavior: "instant" });
        console.log(`⚡ Instant render: ${slug}`);
      } else {
        window.articleNavigator.loadArticle(slug);
      }
    });
  }
}

// Extend your navigator with a static HTML builder
if (typeof window !== "undefined" && window.ArticleNavigator) {
  window.ArticleNavigator.prototype.generateArticleHTML = function (article) {
    return `
      <div class="max-w-4xl mx-auto">
        <div class="mb-8">
          <button onclick="window.history.back()" class="border-2 border-borderLight dark:border-borderDark rounded-sm px-4 py-2 bg-cardLight dark:bg-cardDark font-bold hover:shadow-lg transition-all duration-100">
            ← BACK
          </button>
        </div>
        <article class="border-2 border-borderLight dark:border-borderDark rounded-sm bg-cardLight dark:bg-cardDark p-8 shadow-lg">
          <header class="mb-8 pb-8 border-b-2 border-borderLight dark:border-borderDark">
            <h1 class="text-5xl font-bold mb-4 text-textLight dark:text-textDark">${article.title.toUpperCase()}</h1>
            <div class="flex space-x-4 text-sm text-textMuted dark:text-textMutedDark">
              <span>${article.date}</span>
              <span>•</span>
              <span>${article.category.toUpperCase()}</span>
              <span>•</span>
              <span>${article.readTime} MIN READ</span>
            </div>
          </header>
          <div class="prose prose-lg max-w-none article-content">${article.htmlContent}</div>
        </article>
      </div>
    `;
  };

  // Auto-init
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      window.articlePrefetcher = new ArticlePrefetcher();
    });
  } else {
    window.articlePrefetcher = new ArticlePrefetcher();
  }
}
