import { Component, signal, effect, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SerpService } from './services/serp.service';
import { MicrolinkService } from './services/microlink.service';
import { BookmarkCardComponent, Bookmark } from './components/bookmark-card.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, BookmarkCardComponent],
  templateUrl: './app.component.html',
  styleUrls: []
})
export class AppComponent implements OnInit {
  private serpService = inject(SerpService);
  private microlinkService = inject(MicrolinkService);

  // State
  darkMode = signal<boolean>(true);
  urlInput = signal<string>('');
  bookmarks = signal<Bookmark[]>([]);
  isAdding = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  
  // API Key State
  serpApiKey = signal<string>('');
  showKeyInput = signal<boolean>(false);

  // Manual Mode State
  manualMode = signal<boolean>(false);
  manualPriceInput = signal<string>('');

  constructor() {
    // Load API Key
    const savedKey = localStorage.getItem('serp_api_key');
    if (savedKey) {
      this.serpApiKey.set(savedKey);
    } else {
      this.showKeyInput.set(true);
    }

    // Initial Load bookmarks (Mock Data)
    this.bookmarks.set([
      {
        id: '1',
        url: 'https://amazon.com/example',
        title: 'Sony WH-1000XM5 Noise Canceling Headphones',
        price: '$348.00',
        store: 'Amazon',
        timestamp: Date.now() - 1000000,
        loading: false
      },
      {
        id: '2',
        url: 'https://flipkart.com/example',
        title: 'Apple iPhone 15 (Black, 128 GB)',
        price: '₹72,999',
        store: 'Flipkart',
        timestamp: Date.now() - 5000000,
        loading: false
      }
    ]);

    // Theme effect
    effect(() => {
      if (this.darkMode()) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    });
  }

  ngOnInit(): void {
    if ('serviceWorker' in navigator) {
      // FIX: Use explicit relative path './sw.js' and scope './'
      navigator.serviceWorker.register('./sw.js', { scope: './' })
        .then(registration => {
          console.log('PWA Service Worker registered with scope:', registration.scope);
        })
        .catch(err => {
          console.error('PWA Service Worker registration failed:', err);
        });
    }
  }

  toggleTheme() {
    this.darkMode.update(v => !v);
  }

  toggleManualMode() {
    this.manualMode.update(v => !v);
    if (this.manualMode()) {
      this.showKeyInput.set(false); // Hide API key when switching to manual
    }
  }

  toggleKeyInput() {
    this.showKeyInput.update(v => !v);
    if (this.showKeyInput()) {
      this.manualMode.set(false); // Ensure manual mode is off when opening API key settings
    }
  }

  saveApiKey() {
    const key = this.serpApiKey().trim();
    if (key) {
      localStorage.setItem('serp_api_key', key);
      this.showKeyInput.set(false);
      this.errorMessage.set(null);
    }
  }

  async addLink() {
    const url = this.urlInput().trim();
    if (!url) return;

    if (!this.isValidUrl(url)) {
      this.showError('Please enter a valid URL');
      return;
    }

    this.isAdding.set(true);
    const tempId = crypto.randomUUID();

    if (this.manualMode()) {
      // --- MANUAL MODE ---
      const price = this.manualPriceInput().trim();
      if (!price) {
        this.showError('Please enter a price for the bookmark.');
        this.isAdding.set(false);
        return;
      }

      const newBookmark: Bookmark = {
        id: tempId, url, title: 'Fetching title...', price: price,
        store: 'Loading...', timestamp: Date.now(), loading: true
      };
      this.bookmarks.update(prev => [newBookmark, ...prev]);
      this.urlInput.set('');
      this.manualPriceInput.set('');

      try {
        const details = await this.microlinkService.fetchDetails(url);
        this.bookmarks.update(prev => prev.map(b => (b.id === tempId) ? {
          ...b, title: details.title, store: details.store, loading: false
        } : b));
      } catch (err: any) {
        console.error(err);
        this.showError('Could not fetch title. Saved with URL as title.');
        this.bookmarks.update(prev => prev.map(b => (b.id === tempId) ? {
          ...b, title: url, store: 'Web Store', loading: false
        } : b));
      } finally {
        this.isAdding.set(false);
      }
    } else {
      // --- API MODE ---
      if (!this.serpApiKey()) {
        this.showKeyInput.set(true);
        this.showError('Please enter your SerpApi Key first');
        this.isAdding.set(false);
        return;
      }
      
      const newBookmark: Bookmark = {
        id: tempId, url: url, title: 'Fetching details from web...', price: '...',
        store: 'Loading...', timestamp: Date.now(), loading: true
      };
      this.bookmarks.update(prev => [newBookmark, ...prev]);
      this.urlInput.set('');

      try {
        const details = await this.serpService.fetchProductDetails(url, this.serpApiKey());
        this.bookmarks.update(prev => prev.map(b => (b.id === tempId) ? {
          ...b, title: details.title, price: details.price, store: details.store, loading: false
        } : b));
      } catch (err: any) {
        console.error(err);
        
        let userMessage = 'Failed to fetch details. Please check the URL or your connection.';
        const errorMessage = (err.message || '').toLowerCase();

        if (errorMessage.includes('invalid api key')) {
          userMessage = 'Your SerpApi Key is invalid. Please enter a valid key.';
          this.showKeyInput.set(true);
        } else if (errorMessage.includes('rate limit') || errorMessage.includes('monthly limit')) {
          userMessage = "SerpApi plan limit reached. Try using Manual Mode.";
        } else if (errorMessage.includes('all api proxies failed')) {
          userMessage = 'Could not connect to the lookup service. Please try again later.';
        }

        this.showError(userMessage);
        
        this.bookmarks.update(prev => prev.map(b => (b.id === tempId) ? {
          ...b, title: url, store: 'Link', price: 'Error', loading: false
        } : b));
      } finally {
        this.isAdding.set(false);
      }
    }
  }

  deleteBookmark(id: string) {
    this.bookmarks.update(prev => prev.filter(b => b.id !== id));
  }
  
  updateBookmark(updatedBookmark: Bookmark) {
    this.bookmarks.update(bookmarks => 
      bookmarks.map(b => b.id === updatedBookmark.id ? updatedBookmark : b)
    );
  }

  private isValidUrl(string: string): boolean {
    let urlString = string.trim();
    if (!/^(https?:\/\/)/i.test(urlString)) {
      urlString = 'https://' + urlString;
    }
    try {
      new URL(urlString);
      return true;
    } catch (_) {
      return false;
    }
  }

  private showError(msg: string) {
    this.errorMessage.set(msg);
    setTimeout(() => this.errorMessage.set(null), 5000);
  }

  hasBookmarks = () => this.bookmarks().length > 0;
}