// prefetch.js - Intelligent Article Prefetching for Vercel

class ArticlePrefetcher {
    constructor(options = {}) {
      this.options = {
        prefetchDelay: options.prefetchDelay || 50, // ms delay before prefetch starts
        useIntersectionObserver: options.useIntersectionObserver !== false,
        connectionThreshold: options.connectionThreshold || '3g', // Only prefetch on 3g or better
        maxConcurrentPrefetch: options.maxConcurrentPrefetch || 3,
        ...options
      };
      
      this.prefetchedUrls = new Set();
      this.prefetchQueue = [];
      this.activePrefetches = 0;
      this.hoverTimers = new Map();
      
      // Check connection quality
      this.shouldPrefetch = this.checkConnection();
      
      this.init();
    }
  
    /**
     * Check if network connection is good enough for prefetching
     */
    checkConnection() {
      if (!navigator.connection) return true;
      
      const connection = navigator.connection;
      const effectiveType = connection.effectiveType;
      
      // Don't prefetch on slow connections or if data saver is on
      if (connection.saveData) return false;
      if (effectiveType === 'slow-2g' || effectiveType === '2g') return false;
      
      return true;
    }
  
    /**
     * Initialize prefetching listeners
     */
    init() {
      if (!this.shouldPrefetch) {
        console.log('Prefetching disabled due to connection quality');
        return;
      }
  
      // Use Intersection Observer for viewport detection
      if (this.options.useIntersectionObserver) {
        this.setupIntersectionObserver();
      }
  
      // Listen for dynamically added cards
      this.observeNewCards();
    }
  
    /**
     * Setup Intersection Observer to detect cards entering viewport
     */
    setupIntersectionObserver() {
      const observerOptions = {
        root: null,
        rootMargin: '50px', // Start prefetching slightly before card enters viewport
        threshold: 0.1
      };
  
      this.intersectionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            this.attachHoverListener(entry.target);
          }
        });
      }, observerOptions);
  
      // Observe all existing article cards
      this.observeAllCards();
    }
  
    /**
     * Observe all article cards currently in DOM
     */
    observeAllCards() {
      const cards = document.querySelectorAll('article[data-slug]');
      cards.forEach(card => {
        if (this.intersectionObserver) {
          this.intersectionObserver.observe(card);
        } else {
          this.attachHoverListener(card);
        }
      });
    }
  
    /**
     * Watch for new cards being added to the DOM
     */
    observeNewCards() {
      const container = document.getElementById('articles-container');
      if (!container) return;
  
      const mutationObserver = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1 && node.matches('article[data-slug]')) {
              if (this.intersectionObserver) {
                this.intersectionObserver.observe(node);
              } else {
                this.attachHoverListener(node);
              }
            }
          });
        });
      });
  
      mutationObserver.observe(container, {
        childList: true,
        subtree: true
      });
    }
  
    /**
     * Attach hover listeners to a card
     */
    attachHoverListener(card) {
      const slug = card.dataset.slug;
      if (!slug) return;
  
      // Mouse enter - start prefetch timer
      card.addEventListener('mouseenter', () => {
        this.handleMouseEnter(slug, card);
      });
  
      // Mouse leave - cancel prefetch if not started
      card.addEventListener('mouseleave', () => {
        this.handleMouseLeave(slug);
      });
  
      // Touch devices - prefetch on touch
      card.addEventListener('touchstart', () => {
        this.prefetchArticle(slug);
      }, { passive: true });
    }
  
    /**
     * Handle mouse enter event
     */
    handleMouseEnter(slug, card) {
      // Clear any existing timer for this card
      if (this.hoverTimers.has(slug)) {
        clearTimeout(this.hoverTimers.get(slug));
      }
  
      // Set timer to prefetch after delay
      const timer = setTimeout(() => {
        this.prefetchArticle(slug);
        this.hoverTimers.delete(slug);
        
        // Add visual feedback (optional)
        card.style.transform = 'translateY(-2px)';
      }, this.options.prefetchDelay);
  
      this.hoverTimers.set(slug, timer);
    }
  
    /**
     * Handle mouse leave event
     */
    handleMouseLeave(slug) {
      const card = document.querySelector(`article[data-slug="${slug}"]`);
      if (card) {
        card.style.transform = '';
      }
  
      // Cancel prefetch timer if it hasn't fired yet
      if (this.hoverTimers.has(slug)) {
        clearTimeout(this.hoverTimers.get(slug));
        this.hoverTimers.delete(slug);
      }
    }
  
    /**
     * Prefetch an article
     */
    async prefetchArticle(slug) {
      // Don't prefetch if already done
      if (this.prefetchedUrls.has(slug)) return;
  
      // Check if we're at max concurrent prefetches
      if (this.activePrefetches >= this.options.maxConcurrentPrefetch) {
        this.prefetchQueue.push(slug);
        return;
      }
  
      const articleUrl = `./articles/${slug}/index.html`;
      
      try {
        this.activePrefetches++;
        this.prefetchedUrls.add(slug);
  
        // Use link prefetch for browsers that support it
        if (document.createElement('link').relList.supports('prefetch')) {
          this.prefetchWithLink(articleUrl);
        } else {
          // Fallback to fetch
          await this.prefetchWithFetch(articleUrl);
        }
  
        console.log(`✓ Prefetched: ${slug}`);
      } catch (error) {
        console.error(`✗ Failed to prefetch ${slug}:`, error);
        this.prefetchedUrls.delete(slug);
      } finally {
        this.activePrefetches--;
        this.processQueue();
      }
    }
  
    /**
     * Prefetch using link rel="prefetch" (most efficient)
     */
    prefetchWithLink(url) {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = url;
      link.as = 'document';
      document.head.appendChild(link);
    }
  
    /**
     * Prefetch using fetch API (fallback)
     */
    async prefetchWithFetch(url) {
      const response = await fetch(url, {
        priority: 'low',
        cache: 'default'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
  
      // Clone and cache the response
      const clone = response.clone();
      await clone.text();
    }
  
    /**
     * Process queued prefetch requests
     */
    processQueue() {
      if (this.prefetchQueue.length === 0) return;
      if (this.activePrefetches >= this.options.maxConcurrentPrefetch) return;
  
      const slug = this.prefetchQueue.shift();
      this.prefetchArticle(slug);
    }
  
    /**
     * Manually prefetch a specific article
     */
    prefetch(slug) {
      return this.prefetchArticle(slug);
    }
  
    /**
     * Prefetch all visible articles
     */
    prefetchAll() {
      const cards = document.querySelectorAll('article[data-slug]');
      cards.forEach(card => {
        const slug = card.dataset.slug;
        if (slug) {
          this.prefetchQueue.push(slug);
        }
      });
      this.processQueue();
    }
  
    /**
     * Clear all prefetch data
     */
    clear() {
      this.prefetchedUrls.clear();
      this.prefetchQueue = [];
      this.hoverTimers.forEach(timer => clearTimeout(timer));
      this.hoverTimers.clear();
    }
  
    /**
     * Get prefetch statistics
     */
    getStats() {
      return {
        prefetched: this.prefetchedUrls.size,
        queued: this.prefetchQueue.length,
        active: this.activePrefetches,
        urls: Array.from(this.prefetchedUrls)
      };
    }
  }
  
  // Auto-initialize on page load
  if (typeof window !== 'undefined') {
    window.ArticlePrefetcher = ArticlePrefetcher;
    
    // Initialize after DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        window.articlePrefetcher = new ArticlePrefetcher({
          prefetchDelay: 50,
          maxConcurrentPrefetch: 2
        });
      });
    } else {
      window.articlePrefetcher = new ArticlePrefetcher({
        prefetchDelay: 50,
        maxConcurrentPrefetch: 2
      });
    }
  }
  
  // Export for module usage
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ArticlePrefetcher;
  }