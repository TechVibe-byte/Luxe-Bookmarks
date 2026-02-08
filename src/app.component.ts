import { Component, signal, effect, inject, OnInit, ViewChild, ElementRef } from '@angular/core';
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
  
  // Settings Menu State
  showSettingsMenu = signal<boolean>(false);
  
  // API Key State
  serpApiKey = signal<string>('');
  showKeyInput = signal<boolean>(false);

  // Manual Mode State
  manualMode = signal<boolean>(false);
  manualPriceInput = signal<string>('');

  // PWA Install State
  deferredPrompt = signal<any>(null);
  showInstallButton = signal<boolean>(false);

  constructor() {
    // Load API Key
    const savedKey = localStorage.getItem('serp_api_key');
    if (savedKey) {
      this.serpApiKey.set(savedKey);
    } else {
      this.showKeyInput.set(true);
    }

    // Load Bookmarks from LocalStorage
    this.loadBookmarks();

    // Persistence Effect: Save bookmarks whenever they change
    effect(() => {
      localStorage.setItem('luxe_bookmarks', JSON.stringify(this.bookmarks()));
    });

    // Theme effect
    effect(() => {
      if (this.darkMode()) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    });

    // PWA Install Listener
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        this.deferredPrompt.set(e);
        this.showInstallButton.set(true);
      });

      window.addEventListener('appinstalled', () => {
        this.showInstallButton.set(false);
        this.deferredPrompt.set(null);
        console.log('PWA was installed');
      });
    }
  }

  private loadBookmarks() {
    const saved = localStorage.getItem('luxe_bookmarks');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          this.bookmarks.set(parsed);
          return;
        }
      } catch (e) {
        console.error('Failed to load bookmarks', e);
      }
    }
    // Default to empty array (No mock data for new users)
    this.bookmarks.set([]);
  }

  ngOnInit(): void {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        const path = window.location.pathname;
        const directory = path.substring(0, path.lastIndexOf('/') + 1);
        const swUrl = `${window.location.origin}${directory}sw.js`;

        navigator.serviceWorker.register(swUrl, { scope: './' })
          .then(registration => {
            console.log('PWA Service Worker registered with scope:', registration.scope);
          })
          .catch(err => {
            console.error('PWA Service Worker registration failed:', err);
          });
      } catch (e) {
        console.warn('PWA initialization failed:', e);
      }
    }
  }

  // --- Actions ---

  toggleSettingsMenu() {
    this.showSettingsMenu.update(v => !v);
  }

  closeSettingsMenu() {
    this.showSettingsMenu.set(false);
  }

  toggleTheme() {
    this.darkMode.update(v => !v);
    this.closeSettingsMenu();
  }

  toggleManualMode() {
    this.manualMode.update(v => !v);
    if (this.manualMode()) {
      this.showKeyInput.set(false);
    }
    // Don't close menu immediately so user can see toggle change
  }

  toggleKeyInput() {
    this.showKeyInput.update(v => !v);
    if (this.showKeyInput()) {
      this.manualMode.set(false);
    }
    this.closeSettingsMenu();
  }

  saveApiKey() {
    const key = this.serpApiKey().trim();
    if (key) {
      localStorage.setItem('serp_api_key', key);
      this.showKeyInput.set(false);
      this.errorMessage.set(null);
    }
  }

  async installPwa() {
    const promptEvent = this.deferredPrompt();
    if (!promptEvent) return;
    promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    this.deferredPrompt.set(null);
    this.showInstallButton.set(false);
  }

  // --- Import / Export ---

  exportCsv() {
    if (this.bookmarks().length === 0) {
      this.showError('No bookmarks to export');
      return;
    }

    const headers = ['Title', 'Price', 'Store', 'Date', 'URL'];
    const rows = this.bookmarks().map(b => [
      `"${b.title.replace(/"/g, '""')}"`,
      `"${b.price}"`,
      `"${b.store}"`,
      `"${new Date(b.timestamp).toLocaleDateString()}"`,
      `"${b.url}"`
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    this.downloadFile(csvContent, `luxemarks_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8;');
    this.closeSettingsMenu();
  }

  exportJson() {
    if (this.bookmarks().length === 0) {
      this.showError('No bookmarks to export');
      return;
    }
    const data = JSON.stringify(this.bookmarks(), null, 2);
    this.downloadFile(data, `luxemarks_backup_${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
    this.closeSettingsMenu();
  }

  triggerImport() {
    const fileInput = document.getElementById('fileUpload') as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
    this.closeSettingsMenu();
  }

  handleFileImport(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content);

        if (Array.isArray(parsed)) {
          // Merge strategy: Add new ones, update existing ones based on ID?
          // For simplicity in this app, we'll append unique ones or replace if ID matches.
          // Let's just replace the whole list or merge? "Import" usually implies merging.
          
          const currentBookmarks = this.bookmarks();
          const newBookmarks: Bookmark[] = [];
          const currentIds = new Set(currentBookmarks.map(b => b.id));

          let addedCount = 0;

          parsed.forEach((item: any) => {
            // Basic validation
            if (item.url && item.title) {
               // Assign new ID if missing to avoid collision? 
               // Or if it's a backup restore, keep ID.
               // We will check if ID exists.
               if (!item.id || !currentIds.has(item.id)) {
                 const cleanItem: Bookmark = {
                   id: item.id || crypto.randomUUID(),
                   url: item.url,
                   title: item.title,
                   price: item.price || 'Check Price',
                   store: item.store || 'Web',
                   timestamp: item.timestamp || Date.now(),
                   loading: false
                 };
                 newBookmarks.push(cleanItem);
                 addedCount++;
               }
            }
          });

          if (addedCount > 0) {
            this.bookmarks.update(prev => [...newBookmarks, ...prev]);
            this.showError(`Imported ${addedCount} bookmarks successfully.`);
          } else {
             this.showError('No new bookmarks found in file.');
          }
        } else {
          this.showError('Invalid file format. Expected a JSON array.');
        }
      } catch (err) {
        console.error(err);
        this.showError('Failed to parse file. Please upload a valid JSON backup.');
      }
      
      // Reset input
      input.value = '';
    };

    reader.readAsText(file);
  }

  private downloadFile(content: string, fileName: string, contentType: string) {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // --- Add / Manage ---

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
    setTimeout(() => this.errorMessage.set(null), 3000);
  }

  hasBookmarks = () => this.bookmarks().length > 0;
}