// cardconstructor.js - Article Card Generator

class CardConstructor {
    constructor(articlesPath = './articles') {
      this.articlesPath = articlesPath;
      this.articles = [];
    }
  
    /**
     * Scans the articles directory for article folders
     * Expected structure: articles/article-slug/metadata.json
     */
    async loadArticles() {
      try {
        // In a real implementation, you'd need a backend or build script
        // This simulates loading article metadata
        const response = await fetch(`${this.articlesPath}/manifest.json`);
        const manifest = await response.json();
        
        // Load each article's metadata
        const articlePromises = manifest.articles.map(slug => 
          this.loadArticle(slug)
        );
        
        this.articles = await Promise.all(articlePromises);
        return this.articles;
      } catch (error) {
        console.error('Error loading articles:', error);
        return [];
      }
    }
  
    /**
     * Loads a single article's metadata
     */
    async loadArticle(slug) {
      try {
        const response = await fetch(`${this.articlesPath}/${slug}/metadata.json`);
        const metadata = await response.json();
        return {
          slug,
          ...metadata
        };
      } catch (error) {
        console.error(`Error loading article ${slug}:`, error);
        return null;
      }
    }
  
    /**
     * Creates an article card HTML element
     */
    createCard(article) {
      if (!article) return null;
  
      const card = document.createElement('article');
      card.className = 'mb-4 border-2 border-borderLight dark:border-borderDark rounded-sm bg-cardLight dark:bg-cardDark p-4 shadow transition-all duration-100 hover:shadow-lg cursor-pointer';
      card.dataset.slug = article.slug;
  
      const header = document.createElement('header');
      header.className = 'mb-6';
  
      const title = document.createElement('h2');
      title.className = 'text-3xl font-bold mb-2 text-textLight dark:text-textDark';
      title.textContent = article.title.toUpperCase();
  
      const meta = document.createElement('div');
      meta.className = 'flex space-x-4 text-sm text-textMuted dark:text-textMutedDark';
      meta.innerHTML = `
        <span>${article.date}</span>
        <span>•</span>
        <span>${article.category.toUpperCase()}</span>
        <span>•</span>
        <span>${article.readTime} MIN READ</span>
      `;
  
      header.appendChild(title);
      header.appendChild(meta);
  
      const excerpt = document.createElement('p');
      excerpt.className = 'mb-4 leading-relaxed text-textMuted dark:text-textMutedDark';
      excerpt.textContent = article.excerpt;
  
      if (article.content) {
        const content = document.createElement('p');
        content.className = 'leading-relaxed text-textMuted dark:text-textMutedDark';
        content.textContent = article.content;
        card.appendChild(header);
        card.appendChild(excerpt);
        card.appendChild(content);
      } else {
        card.appendChild(header);
        card.appendChild(excerpt);
      }
  
// Add click handler to navigate to full article
card.setAttribute('onclick', `window.location.href='${article.slug}.html'`);
      
      return card;
    }
  
    /**
     * Renders all article cards to the specified container
     */ 
    renderCards(containerId = 'articles-container', limit = null) {
      const container = document.getElementById(containerId);
      if (!container) {
        console.error(`Container with id "${containerId}" not found`);
        return;
      }
  
      // Clear existing content
      container.innerHTML = '';
  
      // Determine how many articles to render
      const articlesToRender = limit ? this.articles.slice(0, limit) : this.articles;
  
      // Create and append cards
      articlesToRender.forEach(article => {
        if (article) {
          const card = this.createCard(article);
          if (card) {
            container.appendChild(card);
          }
        }
      });
    }
  
    /**
     * Filters articles by category
     */
    filterByCategory(category) {
      return this.articles.filter(article => 
        article.category.toLowerCase() === category.toLowerCase()
      );
    }
  
    /**
     * Sorts articles by date (newest first)
     */
    sortByDate() {
      this.articles.sort((a, b) => new Date(b.date) - new Date(a.date));
    }
  }
  
  // Usage example:
  // const cardConstructor = new CardConstructor('./articles');
  // await cardConstructor.loadArticles();
  // cardConstructor.sortByDate();
  // cardConstructor.renderCards('articles-container');
  
  // Export for use in other modules
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CardConstructor;
  }