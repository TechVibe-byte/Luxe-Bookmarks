import { Component, input, output, computed, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface Bookmark {
  id: string;
  url: string;
  title: string;
  price: string;
  store: string;
  timestamp: number;
  loading: boolean;
}

@Component({
  selector: 'app-bookmark-card',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="'relative flex flex-col h-full rounded-xl transition-all duration-300 border bg-white border-gray-200 shadow-sm hover:shadow-md dark:bg-oled-gray dark:border-gray-800 p-4 ' + storeClass()">
      
      <!-- Header: Store & Actions -->
      <div class="flex items-start justify-between mb-3">
        <span [class]="badgeClass()">
          {{ bookmark().store }}
        </span>
        
        <div class="flex items-center gap-2 sm:gap-1">
          <a [href]="bookmark().url" target="_blank" 
             class="p-2 sm:p-1.5 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors rounded-md hover:bg-gray-100 dark:hover:bg-gray-800" 
             title="Open Link">
            <span class="material-icons-round text-xl sm:text-lg">open_in_new</span>
          </a>
          <button (click)="copyUrl()"
                  [title]="isCopied() ? 'Copied!' : 'Copy URL'"
                  class="p-2 sm:p-1.5 text-gray-400 transition-colors rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
                  [class.text-emerald-500]="isCopied()"
                  [class.hover:text-gray-600]="!isCopied()"
                  [class.dark:hover:text-gray-300]="!isCopied()">
            <span class="material-icons-round text-xl sm:text-lg">{{ isCopied() ? 'check' : 'content_copy' }}</span>
          </button>
           <button (click)="toggleEditMode()" 
                  class="p-2 sm:p-1.5 text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors rounded-md hover:bg-gray-100 dark:hover:bg-gray-800" 
                  title="Edit">
            <span class="material-icons-round text-xl sm:text-lg">edit</span>
          </button>
          <button (click)="onDelete.emit(bookmark().id)" 
                  class="p-2 sm:p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors rounded-md hover:bg-gray-100 dark:hover:bg-gray-800" 
                  title="Delete">
            <span class="material-icons-round text-xl sm:text-lg">delete</span>
          </button>
        </div>
      </div>

      <!-- Title & URL -->
      <div class="flex-grow mb-4">
        @if (bookmark().loading) {
          <div class="animate-pulse space-y-2">
            <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
            <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
          </div>
        } @else if (isEditing()) {
          <div class="space-y-3">
            <div>
              <label class="block text-[10px] uppercase text-gray-400 dark:text-gray-500 font-bold mb-1 ml-1 tracking-wider">Title</label>
              <input type="text" [(ngModel)]="editedTitle" placeholder="Product Title" 
                     class="w-full bg-gray-50 dark:bg-black/40 border border-indigo-200 dark:border-gray-700 rounded-lg px-3 py-2 text-base sm:text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all shadow-inner text-gray-900 dark:text-gray-100">
            </div>
            <div>
               <label class="block text-[10px] uppercase text-gray-400 dark:text-gray-500 font-bold mb-1 ml-1 tracking-wider">URL</label>
               <input type="text" [(ngModel)]="editedUrl" placeholder="https://..." 
                      class="w-full bg-gray-50 dark:bg-black/40 border border-indigo-200 dark:border-gray-700 rounded-lg px-3 py-2 text-base sm:text-xs font-mono text-gray-600 dark:text-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all shadow-inner">
            </div>
          </div>
        } @else {
          <h3 class="font-medium text-lg leading-snug line-clamp-3 text-gray-800 dark:text-gray-100" [title]="bookmark().title">
            {{ bookmark().title }}
          </h3>
          <p class="mt-1 text-xs text-gray-400 dark:text-gray-500 truncate font-mono">
            {{ bookmark().url }}
          </p>
        }
      </div>
      
      <!-- Footer: Price & Date / Edit Controls -->
      <div class="flex items-end justify-between pt-3 border-t border-gray-100 dark:border-gray-800/50">
        @if (bookmark().loading) {
           <div class="h-6 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
        } @else if (isEditing()) {
          <div class="flex items-center gap-2 w-full">
            <div class="flex-grow">
               <label class="block text-[10px] uppercase text-gray-400 dark:text-gray-500 font-bold mb-1 ml-1 tracking-wider">Price</label>
               <input type="text" [(ngModel)]="editedPrice" placeholder="Price" 
                      class="w-full bg-gray-50 dark:bg-black/40 border border-indigo-200 dark:border-gray-700 rounded-lg px-3 py-2 text-base sm:text-sm font-bold text-emerald-600 dark:text-emerald-400 focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-inner">
            </div>
            <div class="flex items-center gap-1 mt-5">
              <button (click)="cancelEdit()" class="p-2 text-gray-500 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20" title="Cancel">
                <span class="material-icons-round text-lg">close</span>
              </button>
              <button (click)="saveEdit()" class="p-2 text-white bg-indigo-600 hover:bg-indigo-700 transition-colors rounded-lg shadow-lg shadow-indigo-500/20" title="Save">
                <span class="material-icons-round text-lg">check</span>
              </button>
            </div>
          </div>
        } @else {
          <div class="text-xl font-bold text-emerald-600 dark:text-emerald-400 tracking-tight">
            {{ bookmark().price }}
          </div>
          <div class="text-xs text-gray-400 dark:text-gray-600">
            {{ dateDisplay() }}
          </div>
        }
      </div>
    </div>
  `,
  styles: []
})
export class BookmarkCardComponent {
  bookmark = input.required<Bookmark>();
  onDelete = output<string>();
  onUpdate = output<Bookmark>();

  isEditing = signal(false);
  editedTitle = signal('');
  editedPrice = signal('');
  editedUrl = signal('');
  
  isCopied = signal(false);

  dateDisplay = computed(() => {
    return new Date(this.bookmark().timestamp).toLocaleDateString();
  });
  
  toggleEditMode() {
    this.isEditing.set(true);
    this.editedTitle.set(this.bookmark().title);
    this.editedPrice.set(this.bookmark().price);
    this.editedUrl.set(this.bookmark().url);
  }
  
  async copyUrl() {
    if (this.isCopied()) return;
    try {
      await navigator.clipboard.writeText(this.bookmark().url);
      this.isCopied.set(true);
      setTimeout(() => this.isCopied.set(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  }

  cancelEdit() {
    this.isEditing.set(false);
  }

  saveEdit() {
    const updatedBookmark: Bookmark = {
      ...this.bookmark(),
      title: this.editedTitle(),
      price: this.editedPrice(),
      url: this.editedUrl(),
    };
    this.onUpdate.emit(updatedBookmark);
    this.isEditing.set(false);
  }

  storeClass = computed(() => {
    const store = (this.bookmark().store || '').toLowerCase();
    
    // Returns hover classes for specific stores
    if (store.includes('amazon')) return 'hover:shadow-[#FF9900]/20 hover:border-[#FF9900]/50 dark:hover:border-[#FF9900]/50';
    if (store.includes('flipkart')) return 'hover:shadow-[#2874F0]/20 hover:border-[#2874F0]/50 dark:hover:border-[#2874F0]/50';
    if (store.includes('myntra')) return 'hover:shadow-[#FF3F6C]/20 hover:border-[#FF3F6C]/50 dark:hover:border-[#FF3F6C]/50';
    if (store.includes('ajio')) return 'hover:shadow-[#2C4152]/20 hover:border-[#2C4152]/50 dark:hover:border-[#2C4152]/50';
    if (store.includes('jio')) return 'hover:shadow-[#0f3cc9]/20 hover:border-[#0f3cc9]/50 dark:hover:border-[#0f3cc9]/50';
    
    // Default fallback
    return 'hover:border-indigo-500/50 dark:hover:border-indigo-500/50';
  });

  badgeClass = computed(() => {
    const base = "px-2.5 py-1 text-xs font-bold rounded-md uppercase tracking-wider";
    const store = (this.bookmark().store || 'Web').toLowerCase();
    
    if (store.includes('amazon')) return `${base} bg-[#FF9900]/10 text-[#FF9900] border border-[#FF9900]/20`;
    if (store.includes('flipkart')) return `${base} bg-[#2874F0]/10 text-[#2874F0] border border-[#2874F0]/20`;
    if (store.includes('myntra')) return `${base} bg-[#FF3F6C]/10 text-[#FF3F6C] border border-[#FF3F6C]/20`;
    if (store.includes('ajio')) return `${base} bg-[#2C4152]/10 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600`;
    if (store.includes('jio')) return `${base} bg-[#0f3cc9]/10 text-[#0f3cc9] border border-[#0f3cc9]/20`;
    
    return `${base} bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700`;
  });
}