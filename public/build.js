// build.js - Static Article Generator (keeps your existing index.html)
const fs = require('fs').promises;
const path = require('path');

class MarkdownRenderer {
  constructor() {
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

  render(markdown) {
    let html = markdown
      .replace(this.patterns.codeBlock, this.replacements.codeBlock)
      .replace(this.patterns.image, this.replacements.image)
      .replace(this.patterns.link, this.replacements.link)
      .replace(this.patterns.h3, this.replacements.h3)
      .replace(this.patterns.h2, this.replacements.h2)
      .replace(this.patterns.h1, this.replacements.h1)
      .replace(this.patterns.boldItalic, this.replacements.boldItalic)
      .replace(this.patterns.underBoldItalic, this.replacements.boldItalic)
      .replace(this.patterns.bold, this.replacements.bold)
      .replace(this.patterns.underBold, this.replacements.bold)
      .replace(this.patterns.italic, this.replacements.italic)
      .replace(this.patterns.underItalic, this.replacements.italic)
      .replace(this.patterns.inlineCode, this.replacements.inlineCode)
      .replace(this.patterns.blockquote, this.replacements.blockquote)
      .replace(this.patterns.hr, this.replacements.hr)
      .replace(this.patterns.ulStar, this.replacements.li)
      .replace(this.patterns.ulDash, this.replacements.li)
      .replace(this.patterns.ol, this.replacements.li)
      .replace(this.patterns.paragraph, this.replacements.paragraph);

    html = html.replace(/(<li class="ml-6 mb-2">.*?<\/li>\s*)+/g, (match) => {
      return `<ul class="list-disc my-4">${match}</ul>`;
    });

    return html;
  }
}

class BlogBuilder {
  constructor(options = {}) {
    this.articlesDir = options.articlesDir || './articles';
    this.outputDir = options.outputDir || './public';
    this.templatePath = options.templatePath || './article-template.html';
    this.renderer = new MarkdownRenderer();
  }

  async build() {
    console.log('🔨 Building static articles...\n');
    
    const startTime = Date.now();
    
    // Load template
    const template = await this.loadTemplate();
    
    // Get all articles
    const articles = await this.scanArticles();
    console.log(`📚 Found ${articles.length} articles\n`);
    
    // Build each article
    for (const article of articles) {
      await this.buildArticle(article, template);
    }
    
    // Generate manifest for your existing card constructor
    await this.generateManifest(articles);
    
    // Copy prefetch script
    await this.copyPrefetchScript();
    
    const duration = Date.now() - startTime;
    console.log(`\n✅ Build complete in ${duration}ms`);
    console.log(`📦 Output: ${this.outputDir}/`);
    console.log(`\n💡 Your index.html will load articles from manifest.json`);
  }

  async loadTemplate() {
    try {
      return await fs.readFile(this.templatePath, 'utf-8');
    } catch (err) {
      console.log('⚠️  No template found, using default');
      return this.getDefaultTemplate();
    }
  }

  async scanArticles() {
    const articles = [];
    const entries = await fs.readdir(this.articlesDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      
      const slug = entry.name;
      const metadataPath = path.join(this.articlesDir, slug, 'metadata.json');
      const markdownPath = path.join(this.articlesDir, slug, 'article.md');
      
      try {
        const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
        const markdown = await fs.readFile(markdownPath, 'utf-8');
        
        articles.push({
          slug,
          markdown,
          ...metadata
        });
      } catch (err) {
        console.warn(`⚠️  Skipping ${slug}: ${err.message}`);
      }
    }
    
    // Sort by date (newest first)
    articles.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    return articles;
  }

  async buildArticle(article, template) {
    const html = this.renderer.render(article.markdown);
    
    const articleHTML = `
      <div class="max-w-4xl mx-auto">
        <div class="mb-8">
          <a href="index.html" class="border-2 border-borderLight dark:border-borderDark rounded-sm px-4 py-2 bg-cardLight dark:bg-cardDark font-bold hover:shadow-lg transition-all duration-100 inline-block">
            ← BACK
          </a>
        </div>
        
        <article class="border-2 border-borderLight dark:border-borderDark rounded-sm bg-cardLight dark:bg-cardDark p-8 shadow-lg">
          <header class="mb-8 pb-8 border-b-2 border-borderLight dark:border-borderDark">
            <h1 class="text-5xl font-bold mb-4 text-textLight dark:text-textDark">
              ${this.escape(article.title.toUpperCase())}
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
            ${html}
          </div>
        </article>
      </div>
    `;
    
    const fullHTML = template
      .replace('{{TITLE}}', `${article.title} - Brutal Blog Box`)
      .replace('{{CONTENT}}', articleHTML);
    
    // Write to output directory
    const outputPath = path.join(this.outputDir, `${article.slug}.html`);
    await fs.mkdir(this.outputDir, { recursive: true });
    await fs.writeFile(outputPath, this.minifyHTML(fullHTML));
    
    console.log(`✓ Built: ${article.slug}.html`);
  }

  async generateManifest(articles) {
    const manifest = {
      articles: articles.map(a => a.slug),
      buildTime: new Date().toISOString()
    };
    
    // Create articles directory first
    const articlesDir = path.join(this.outputDir, 'articles');
    await fs.mkdir(articlesDir, { recursive: true });
    
    await fs.writeFile(
      path.join(articlesDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    );
    
    // Also copy metadata files for runtime access
    for (const article of articles) {
      const srcPath = path.join(this.articlesDir, article.slug, 'metadata.json');
      const destDir = path.join(articlesDir, article.slug);
      const destPath = path.join(destDir, 'metadata.json');
      
      await fs.mkdir(destDir, { recursive: true });
      await fs.copyFile(srcPath, destPath);
    }
    
    console.log('✓ Generated: manifest.json + metadata files');
  }

  async copyPrefetchScript() {
    try {
      const src = './prefetch-static.js';
      const dest = path.join(this.outputDir, 'prefetch-static.js');
      await fs.copyFile(src, dest);
      console.log('✓ Copied: prefetch-static.js');
    } catch (err) {
      console.warn('⚠️  prefetch-static.js not found, skipping');
    }
  }

  minifyHTML(html) {
    return html
      .replace(/\n\s+/g, '\n')
      .replace(/>\s+</g, '><')
      .trim();
  }

  escape(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  getDefaultTemplate() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{{TITLE}}</title>
  <link href="./output.css" rel="stylesheet">
  <style>
    @import url("https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap");
    body {
      font-family: "Space Mono", monospace;
    }
  </style>
</head>
<body class="bg-bgLight dark:bg-bgDark text-textLight dark:text-textDark transition-colors duration-200">
  <header class="container mx-auto my-7">
    <div class="flex justify-between items-center">
      <h1 class="text-4xl font-bold tracking-tighter">BRUTAL BLOG BOX</h1>
      <nav>
        <ul class="flex space-x-3">
          <li class="border-2 border-borderLight dark:border-borderDark rounded-sm px-4 py-2 font-bold">
            ARCHIVE
          </li>
          <button class="border-2 border-borderLight dark:border-borderDark rounded-sm px-4 py-2 font-bold">
            ABOUT
          </button>
          <button id="darkModeToggle" class="border-2 border-borderLight dark:border-borderDark rounded-sm w-20 px-4 py-1 font-bold">
            DARK
          </button>
        </ul>
      </nav>
    </div>
  </header>
  <main class="container mx-auto">
    {{CONTENT}}
  </main>
  <footer class="container mx-auto mt-16 mb-8 text-sm">
    <div class="border-2 border-borderLight dark:border-borderDark rounded-sm p-2">
      <div class="flex justify-between items-center">
        <p>© 2023 BRUTAL BLOG BOX. NO RIGHTS RESERVED.</p>
        <p>BUILT WITH HTML AND RAGE</p>
      </div>
    </div>
  </footer>
  <script src="prefetch-static.js"></script>
  <script>
    // Dark mode toggle
    const darkToggle = document.getElementById("darkModeToggle");
    if (darkToggle) {
      darkToggle.addEventListener("mousedown", () => {
        document.documentElement.classList.toggle("dark");
        darkToggle.textContent = document.documentElement.classList.contains("dark") ? "LIGHT" : "DARK";
      });
    }
  </script>
</body>
</html>`;
  }
}

// Run if called directly
if (require.main === module) {
  const builder = new BlogBuilder({
    articlesDir: './articles',
    outputDir: './public',
    templatePath: './article-template.html'
  });
  
  builder.build().catch(err => {
    console.error('❌ Build failed:', err);
    process.exit(1);
  });
}

module.exports = BlogBuilder;