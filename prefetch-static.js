// prefetch-static.js - Aggressive prefetching for static HTML blog

class StaticPrefetcher {
  constructor(options = {}) {
    this.options = {
      hoverDelay: options.hoverDelay || 20,           // ms before prefetch on hover
      maxConcurrent: options.maxConcurrent || 3,      // max simultaneous prefetches
      aggressiveMode: options.aggressiveMode || true, // prefetch all visible links
      instantNavigation: options.instantNavigation !== tre, // hijack clicks for instant nav
      ...options
    };

    this.prefetched = new Set();
    this.cache = new Map();
    this.hoverTimers = new Map();
    this.prefetchQueue = [];
    this.activePrefetches = 0;

    this.shouldPrefetch = this.checkConnection();
    this.init();
  }

  checkConnection() {
    if (!navigator.connection) return true;
    const c = navigator.connection;
    if (c.saveData) return false;
    if (c.effectiveType === 'slow-2g' || c.effectiveType === '2g') return false;
    return true;
  }

  init() {
    if (!this.shouldPrefetch) {
      console.log('⚠️ Prefetch disabled (save-data or slow connection)');
      return;
    }

    console.log('⚡ StaticPrefetcher initialized');

    // Set up hover-based prefetching
    this.setupHoverPrefetch();

    // Set up instant navigation
    if (this.options.instantNavigation) {
      this.setupInstantNav();
    }

    // Aggressive mode: prefetch all visible articles immediately
    if (this.options.aggressiveMode) {
      this.prefetchVisible();
    }

    // Prefetch on viewport intersection
    this.setupIntersectionPrefetch();
  }

  setupHoverPrefetch() {
    // Delegate event listener for better performance
    document.addEventListener('mouseenter', (e) => {
      if (!e.target || !e.target.closest) return;
      const article = e.target.closest('article[onclick]');
      if (!article) return;

      const url = this.extractURL(article);
      if (!url) return;

      this.scheduleHoverPrefetch(url, article);
    }, true); // Use capture phase

    document.addEventListener('mouseleave', (e) => {
      if (!e.target || !e.target.closest) return;
      const article = e.target.closest('article[onclick]');
      if (!article) return;

      const url = this.extractURL(article);
      if (url && this.hoverTimers.has(url)) {
        clearTimeout(this.hoverTimers.get(url));
        this.hoverTimers.delete(url);
      }
    }, true);
  }

  scheduleHoverPrefetch(url, article) {
    if (this.hoverTimers.has(url)) return;

    const timer = setTimeout(() => {
      this.prefetch(url);
      this.hoverTimers.delete(url);
      
      // Subtle hover feedback
      article.style.transform = 'translateY(-2px)';
      setTimeout(() => {
        article.style.transform = '';
      }, 150);
    }, this.options.hoverDelay);

    this.hoverTimers.set(url, timer);
  }

  setupIntersectionPrefetch() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const url = this.extractURL(entry.target);
          if (url) {
            // Low priority prefetch for articles in viewport
            setTimeout(() => this.prefetch(url, 'low'), 1000);
          }
        }
      });
    }, {
      rootMargin: '100px',
      threshold: 0.1
    });

    document.querySelectorAll('article[onclick]').forEach(article => {
      observer.observe(article);
    });

    this.intersectionObserver = observer;
  }

  prefetchVisible() {
    const articles = Array.from(document.querySelectorAll('article[onclick]'));
    articles.forEach((article, i) => {
      const url = this.extractURL(article);
      if (url) {
        // Stagger prefetches to avoid blocking
        setTimeout(() => this.prefetch(url, 'low'), i * 200);
      }
    });
  }

  extractURL(article) {
    const onclick = article.getAttribute('onclick');
    if (!onclick) return null;
    
    const match = onclick.match(/['"]([^'"]+\.html)['"]/);
    return match ? match[1] : null;
  }

  async prefetch(url, priority = 'high') {
    if (this.prefetched.has(url)) return;
    if (this.cache.has(url)) return;

    // Queue if too many active prefetches
    if (this.activePrefetches >= this.options.maxConcurrent) {
      if (!this.prefetchQueue.includes(url)) {
        this.prefetchQueue.push(url);
      }
      return;
    }

    try {
      this.activePrefetches++;
      this.prefetched.add(url);

      const startTime = performance.now();
      
      // Fetch with appropriate priority
      const response = await fetch(url, {
        priority: priority,
        cache: 'force-cache'
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const html = await response.text();
      
      // Parse and cache the HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      this.cache.set(url, {
        html: html,
        doc: doc,
        timestamp: Date.now()
      });

      const duration = (performance.now() - startTime).toFixed(0);
      console.log(`✓ Prefetched: ${url} (${duration}ms)`);

    } catch (err) {
      console.warn(`✗ Prefetch failed: ${url}`, err);
      this.prefetched.delete(url);
    } finally {
      this.activePrefetches--;
      this.processQueue();
    }
  }

  processQueue() {
    if (this.prefetchQueue.length === 0) return;
    if (this.activePrefetches >= this.options.maxConcurrent) return;
    
    const url = this.prefetchQueue.shift();
    this.prefetch(url);
  }

  setupInstantNav() {
    document.addEventListener('click', (e) => {
      if (!e.target || !e.target.closest) return;
      const article = e.target.closest('article[onclick]');
      if (!article) return;

      const url = this.extractURL(article);
      if (!url) return;

      e.preventDefault();
      e.stopPropagation();

      this.navigate(url);
    }, true);
  }

  navigate(url) {
    const cached = this.cache.get(url);

    if (cached) {
      // INSTANT navigation from cache
      const startTime = performance.now();
      
      // Extract the main content
      const newMain = cached.doc.querySelector('main');
      const currentMain = document.querySelector('main');
      
      if (newMain && currentMain) {
        // Replace content
        currentMain.innerHTML = newMain.innerHTML;
        
        // Update title
        document.title = cached.doc.title;
        
        // Update URL
        window.history.pushState({}, '', url);
        
        // Scroll to top instantly
        window.scrollTo({ top: 0, behavior: 'instant' });
        
        const duration = (performance.now() - startTime).toFixed(1);
        console.log(`⚡ INSTANT NAV: ${url} (${duration}ms)`);
      }
    } else {
      // Fallback to normal navigation
      console.log(`→ Normal nav: ${url}`);
      window.location.href = url;
    }
  }

  // Public API
  clearCache() {
    this.cache.clear();
    this.prefetched.clear();
    console.log('🗑️ Cache cleared');
  }

  getCacheStats() {
    return {
      cached: this.cache.size,
      prefetched: this.prefetched.size,
      queueLength: this.prefetchQueue.length,
      active: this.activePrefetches
    };
  }

  prefetchURL(url) {
    this.prefetch(url, 'high');
  }
}

// Auto-initialize
if (typeof window !== 'undefined') {
  // Wait for DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.prefetcher = new StaticPrefetcher({
        hoverDelay: 65,
        maxConcurrent: 3,
        aggressiveMode: false,  // Set to true for maximum speed
        instantNavigation: true
      });
    });
  } else {
    window.prefetcher = new StaticPrefetcher({
      hoverDelay: 65,
      maxConcurrent: 3,
      aggressiveMode: false,
      instantNavigation: true
    });
  }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StaticPrefetcher;
}