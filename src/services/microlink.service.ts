import { Injectable } from '@angular/core';

export interface MicrolinkDetails {
  title: string;
  store: string;
}

interface MicrolinkResponse {
  status: string;
  data: {
    title: string;
    publisher: string;
    url: string;
  }
}

@Injectable({
  providedIn: 'root'
})
export class MicrolinkService {
  async fetchDetails(productUrl: string): Promise<MicrolinkDetails> {
    const apiUrl = `https://api.microlink.io/?url=${encodeURIComponent(productUrl)}`;
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8-second timeout

      const response = await fetch(apiUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Microlink API returned status ${response.status}`);
      }
      
      const result: MicrolinkResponse = await response.json();

      if (result.status === 'success' && result.data) {
        return {
          title: result.data.title || 'Unknown Product',
          store: result.data.publisher || this.detectStoreFromUrl(productUrl)
        };
      } else {
        throw new Error('Microlink could not process the URL.');
      }
    } catch (error) {
      console.warn('Microlink fetch failed, falling back to direct scraping:', error);
      // Fallback to direct HTML scraping if Microlink fails
      return this.scrapeHtml(productUrl);
    }
  }

  private async scrapeHtml(url: string): Promise<MicrolinkDetails> {
    try {
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error('Proxy fetch failed');

        const html = await response.text();

        let title = 'Bookmark';
        let store = this.detectStoreFromUrl(url);

        // Try to get og:title first, as it's often cleaner
        const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
        if (ogTitleMatch && ogTitleMatch[1]) {
            title = ogTitleMatch[1];
        } else {
            // Fallback to the <title> tag
            const titleTagMatch = html.match(/<title>([^<]+)<\/title>/i);
            if (titleTagMatch && titleTagMatch[1]) {
                title = titleTagMatch[1];
            }
        }
        
        // Try to get the site name
        const ogSiteNameMatch = html.match(/<meta\s+property=["']og:site_name["']\s+content=["']([^"']+)["']/i);
        if (ogSiteNameMatch && ogSiteNameMatch[1]) {
            store = ogSiteNameMatch[1];
        }

        // Clean up title
        if (title.includes('|')) title = title.split('|')[0].trim();
        else if (title.includes(' - ')) title = title.split(' - ')[0].trim();

        return { title, store };

    } catch (scrapeError) {
        console.error("Direct scraping also failed:", scrapeError);
        // Absolute fallback
        return {
            title: url,
            store: this.detectStoreFromUrl(url)
        };
    }
  }

  private detectStoreFromUrl(url: string): string {
    const lower = url.toLowerCase();
    if (lower.includes('amazon') || lower.includes('amzn')) return 'Amazon';
    if (lower.includes('flipkart')) return 'Flipkart';
    if (lower.includes('myntra')) return 'Myntra';
    if (lower.includes('ajio')) return 'Ajio';
    if (lower.includes('jiomart')) return 'JioMart';
    return 'Web Store';
  }
}
