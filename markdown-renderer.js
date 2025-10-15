// markdown-renderer.js - Markdown to Brutal HTML Renderer

class MarkdownRenderer {
    constructor() {
      // Pre-compile regex patterns for better performance
      this.patterns = {
        codeBlock: /```([\s\S]*?)```/g,
        inlineCode: /`([^`]+)`/g,
        image: /!\[([^\]]*)\]\(([^)]+)\)/g,
        link: /\[([^\]]+)\]\(([^)]+)\)/g,
        h3: /^### (.+)$/gm,
        h2: /^## (.+)$/gm,
        h1: /^# (.+)$/gm,
        boldItalic: /\*\*\*([^*]+)\*\*\*/g,
        bold: /\*\*([^*]+)\*\*/g,
        italic: /\*([^*]+)\*/g,
        underBoldItalic: /___([^_]+)___/g,
        underBold: /__([^_]+)__/g,
        underItalic: /_([^_]+)_/g,
        blockquote: /^> (.+)$/gm,
        hr: /^---$/gm,
        ulStar: /^\* (.+)$/gm,
        ulDash: /^- (.+)$/gm,
        ol: /^\d+\. (.+)$/gm,
        paragraph: /^(?!<[^>]+>)(.+)$/gm
      };
      
      // Pre-built replacement strings
      this.replacements = {
        h1: '<h1 class="text-4xl font-bold mb-6 mt-8 text-textLight dark:text-textDark">$1</h1>',
        h2: '<h2 class="text-3xl font-bold mb-4 mt-8 text-textLight dark:text-textDark">$1</h2>',
        h3: '<h3 class="text-2xl font-bold mb-4 mt-6 text-textLight dark:text-textDark">$1</h3>',
        codeBlock: '<pre class="bg-black dark:bg-white text-white dark:text-black p-4 rounded-sm overflow-x-auto my-4 border-2 border-borderLight dark:border-borderDark"><code>$1</code></pre>',
        inlineCode: '<code class="bg-black dark:bg-white text-white dark:text-black px-2 py-1 rounded-sm font-mono text-sm">$1</code>',
        image: '<img src="$2" alt="$1" class="my-4 border-2 border-borderLight dark:border-borderDark rounded-sm" />',
        link: '<a href="$2" class="underline hover:no-underline font-bold">$1</a>',
        boldItalic: '<strong class="font-bold"><em>$1</em></strong>',
        bold: '<strong class="font-bold">$1</strong>',
        italic: '<em>$1</em>',
        blockquote: '<blockquote class="border-l-4 border-borderLight dark:border-borderDark pl-4 my-4 italic text-textMuted dark:text-textMutedDark">$1</blockquote>',
        hr: '<hr class="border-t-2 border-borderLight dark:border-borderDark my-8" />',
        li: '<li class="ml-6 mb-2">$1</li>',
        paragraph: '<p class="mb-4 leading-relaxed text-textMuted dark:text-textMutedDark">$1</p>'
      };
    }
  
    /**
     * Render markdown to HTML (optimized)
     */
    render(markdown) {
      // Process in optimal order: blocks first, then inline elements
      let html = markdown
        // Code blocks (protect from other processing)
        .replace(this.patterns.codeBlock, this.replacements.codeBlock)
        // Images (before links)
        .replace(this.patterns.image, this.replacements.image)
        // Links
        .replace(this.patterns.link, this.replacements.link)
        // Headers (largest to smallest)
        .replace(this.patterns.h3, this.replacements.h3)
        .replace(this.patterns.h2, this.replacements.h2)
        .replace(this.patterns.h1, this.replacements.h1)
        // Bold/Italic (specific to general)
        .replace(this.patterns.boldItalic, this.replacements.boldItalic)
        .replace(this.patterns.underBoldItalic, this.replacements.boldItalic)
        .replace(this.patterns.bold, this.replacements.bold)
        .replace(this.patterns.underBold, this.replacements.bold)
        .replace(this.patterns.italic, this.replacements.italic)
        .replace(this.patterns.underItalic, this.replacements.italic)
        // Inline code (after bold/italic)
        .replace(this.patterns.inlineCode, this.replacements.inlineCode)
        // Block elements
        .replace(this.patterns.blockquote, this.replacements.blockquote)
        .replace(this.patterns.hr, this.replacements.hr)
        // Lists
        .replace(this.patterns.ulStar, this.replacements.li)
        .replace(this.patterns.ulDash, this.replacements.li)
        .replace(this.patterns.ol, this.replacements.li)
        // Paragraphs
        .replace(this.patterns.paragraph, this.replacements.paragraph);
  
      // Wrap consecutive <li> in <ul> (single pass)
      html = html.replace(/(<li class="ml-6 mb-2">.*?<\/li>\s*)+/g, (match) => {
        return `<ul class="list-disc my-4">${match}</ul>`;
      });
  
      return html;
    }
  
    /**
     * Load and render markdown from a file (optimized)
     */
    async renderFile(url) {
      try {
        const response = await fetch(url, { priority: 'high' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const markdown = await response.text();
        return this.render(markdown);
      } catch (error) {
        console.error('Error loading markdown file:', error);
        return '<p class="text-red-500">Error loading article content.</p>';
      }
    }
  }
  
  // Article Navigator
  class ArticleNavigator {
    constructor(articlesPath = './articles') {
      this.articlesPath = articlesPath;
      this.renderer = new MarkdownRenderer();
      this.currentArticle = null;
      this.articles = [];
    }
  
    async init() {
      if (window.cardConstructor) {
        this.articles = window.cardConstructor.articles;
      }
  
      const urlParams = new URLSearchParams(window.location.search);
      const articleSlug = urlParams.get('article');
      
      if (articleSlug) {
        await this.loadArticle(articleSlug);
      }
    }
  
    async loadArticle(slug) {
      try {
        const metadataResponse = await fetch(`${this.articlesPath}/${slug}/metadata.json`);
        const metadata = await metadataResponse.json();
        
        const markdownUrl = `${this.articlesPath}/${slug}/article.md`;
        const htmlContent = await this.renderer.renderFile(markdownUrl);
        
        this.currentArticle = { slug, ...metadata, htmlContent };
        this.renderArticlePage();
      } catch (error) {
        console.error('Error loading article:', error);
        this.renderError();
      }
    }
  
    renderArticlePage() {
      const article = this.currentArticle;
      
      const articleHTML = `
        <div class="max-w-4xl mx-auto">
          <div class="mb-8">
            <button onclick="window.history.back()" class="border-2 border-borderLight dark:border-borderDark rounded-sm px-4 py-2 bg-cardLight dark:bg-cardDark font-bold hover:shadow-lg transition-all duration-100">
              ← BACK
            </button>
          </div>
          
          <article class="border-2 border-borderLight dark:border-borderDark rounded-sm bg-cardLight dark:bg-cardDark p-8 shadow-lg">
            <header class="mb-8 pb-8 border-b-2 border-borderLight dark:border-borderDark">
              <h1 class="text-5xl font-bold mb-4 text-textLight dark:text-textDark">
                ${article.title.toUpperCase()}
              </h1>
              <div class="flex space-x-4 text-sm text-textMuted dark:text-textMutedDark">
                <span>${article.date}</span>
                <span>•</span>
                <span>${article.category.toUpperCase()}</span>
                <span>•</span>
                <span>${article.readTime} MIN READ</span>
              </div>
            </header>
            
            <div class="prose prose-lg max-w-none article-content">
              ${article.htmlContent}
            </div>
          </article>
          
          <div class="mt-8">
            ${this.renderArticleNavigation()}
          </div>
        </div>
      `;
      
      const main = document.querySelector('main');
      if (main) main.innerHTML = articleHTML;
      document.title = `${article.title} - Brutal Blog Box`;
    }
  
    renderArticleNavigation() {
      if (this.articles.length === 0) return '';
      
      const currentIndex = this.articles.findIndex(a => a.slug === this.currentArticle.slug);
      const prevArticle = currentIndex > 0 ? this.articles[currentIndex - 1] : null;
      const nextArticle = currentIndex < this.articles.length - 1 ? this.articles[currentIndex + 1] : null;
      
      return `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${prevArticle ? `
            <a href="?article=${prevArticle.slug}" class="border-2 border-borderLight dark:border-borderDark rounded-sm bg-cardLight dark:bg-cardDark p-4 hover:shadow-lg transition-all duration-100">
              <div class="text-sm text-textMuted dark:text-textMutedDark mb-2">← PREVIOUS</div>
              <div class="font-bold">${prevArticle.title.toUpperCase()}</div>
            </a>
          ` : '<div></div>'}
          
          ${nextArticle ? `
            <a href="?article=${nextArticle.slug}" class="border-2 border-borderLight dark:border-borderDark rounded-sm bg-cardLight dark:bg-cardDark p-4 hover:shadow-lg transition-all duration-100 text-right">
              <div class="text-sm text-textMuted dark:text-textMutedDark mb-2">NEXT →</div>
              <div class="font-bold">${nextArticle.title.toUpperCase()}</div>
            </a>
          ` : '<div></div>'}
        </div>
      `;
    }
  
    renderError() {
      const main = document.querySelector('main');
      if (main) {
        main.innerHTML = `
          <div class="max-w-4xl mx-auto text-center py-16">
            <div class="border-2 border-borderLight dark:border-borderDark rounded-sm bg-cardLight dark:bg-cardDark p-8">
              <h1 class="text-4xl font-bold mb-4">404</h1>
              <p class="text-xl mb-6">ARTICLE NOT FOUND</p>
              <button onclick="window.location.href='/'" class="border-2 border-borderLight dark:border-borderDark rounded-sm px-4 py-2 bg-cardLight dark:bg-cardDark font-bold">
                ← BACK TO HOME
              </button>
            </div>
          </div>
        `;
      }
    }
  
    navigate(slug) {
      window.location.href = `?article=${slug}`;
    }
  }
  
  // Export for module usage
  if (typeof window !== 'undefined') {
    window.MarkdownRenderer = MarkdownRenderer;
    window.ArticleNavigator = ArticleNavigator;
  }
  
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MarkdownRenderer, ArticleNavigator };
  }
  