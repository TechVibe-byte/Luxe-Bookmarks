import { Injectable } from '@angular/core';

export interface ProductDetails {
  title: string;
  price: string;
  store: string;
}

@Injectable({
  providedIn: 'root'
})
export class SerpService {
  
  async fetchProductDetails(productUrl: string, apiKey: string): Promise<ProductDetails> {
    const store = this.detectStoreFromUrl(productUrl);
    const region = this.detectRegion(productUrl);

    // 1. Try Amazon Direct (Only if we can extract an ASIN)
    if (store === 'Amazon') {
      const asin = this.extractASIN(productUrl);
      if (asin) {
        try {
          const amazonDetails = await this.fetchAmazonDetails(asin, apiKey, region.amazon_domain);
          if (amazonDetails.price !== 'Check Price') {
            return amazonDetails;
          }
        } catch (e) {
          console.warn('Amazon direct fetch failed, falling back to search.', e);
        }
      }
    }

    // 2. Primary Search: Google Search for the URL
    let initialResult: ProductDetails | null = null;
    try {
      initialResult = await this.fetchGoogleDetails(productUrl, apiKey, store, region);
    } catch (e) {
      console.warn('Google URL search failed', e);
    }

    if (initialResult && initialResult.price !== 'Check Price') {
      return initialResult;
    }

    // 3. Fallback: Google Shopping Search
    if (initialResult && initialResult.title) {
      try {
        const shoppingPrice = await this.fetchGoogleShoppingPrice(initialResult.title, apiKey, region);
        if (shoppingPrice) {
          return {
            ...initialResult,
            price: shoppingPrice
          };
        }
      } catch (e) {
        console.warn('Google Shopping fallback failed', e);
      }
    }

    // 4. Last Resort: HTML Scraping
    if (initialResult) {
      try {
        const scrapedPrice = await this.tryHtmlScraping(productUrl);
        if (scrapedPrice) {
          return { ...initialResult, price: scrapedPrice };
        }
      } catch (e) { /* ignore */ }
      
      return initialResult;
    }

    throw new Error('Could not fetch product details. Please check the URL.');
  }

  // --- GOOGLE SHOPPING FALLBACK ---
  private async fetchGoogleShoppingPrice(query: string, apiKey: string, region: any): Promise<string | null> {
    let cleanQuery = query.split('|')[0].split('-')[0].trim();
    cleanQuery = cleanQuery.replace(/\.\.\.$/, '').trim();

    const url = `https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(cleanQuery)}&gl=${region.gl}&google_domain=${region.google_domain}&api_key=${apiKey}`;
    
    const data = await this.fetchJson(url);
    if (data.shopping_results && data.shopping_results.length > 0) {
      return data.shopping_results[0].price;
    }
    return null;
  }

  // --- AMAZON API ---
  private async fetchAmazonDetails(asin: string, apiKey: string, domain: string): Promise<ProductDetails> {
    const url = `https://serpapi.com/search.json?engine=amazon_product&product_id=${asin}&domain=${domain}&api_key=${apiKey}`;
    
    const data = await this.fetchJson(url);
    if (data.error) throw new Error(data.error);

    const result = data.product_result;
    if (!result) throw new Error('No product result found');

    let price = result.price;
    if (!price && result.buybox_winner?.price) price = result.buybox_winner.price;
    if (!price && result.price_string) price = result.price_string;
    if (!price && result.options?.[0]?.price) price = result.options[0].price;
    if (!price && result.used_price) price = result.used_price;

    return {
      title: result.title || 'Amazon Product',
      price: price || 'Check Price',
      store: 'Amazon'
    };
  }

  // --- GOOGLE SEARCH (URL LOOKUP) ---
  private async fetchGoogleDetails(productUrl: string, apiKey: string, storeName: string, region: any): Promise<ProductDetails> {
    const encodedUrl = encodeURIComponent(productUrl);
    const url = `https://serpapi.com/search.json?engine=google&q=${encodedUrl}&gl=${region.gl}&google_domain=${region.google_domain}&api_key=${apiKey}`;

    const data = await this.fetchJson(url);
    if (data.error) throw new Error(data.error);

    const organicResult = data.organic_results?.[0];
    if (!organicResult) {
      throw new Error('No search results found');
    }

    let title = organicResult.title || 'Unknown Product';
    if (title.includes('|')) title = title.split('|')[0];
    else if (title.includes('-')) {
       if (title.includes(' - ')) title = title.split(' - ')[0];
    }
    title = title.trim();

    let price = '';
    const richSnippet = organicResult.rich_snippet?.top;
    
    if (richSnippet?.detected_extensions) {
      const ext = richSnippet.detected_extensions;
      const priceKey = Object.keys(ext).find(k => 
        k.toLowerCase().includes('price') || k.includes('₹') || k.includes('$')
      );
      if (priceKey) price = ext[priceKey];
    }

    if (!price && richSnippet?.attributes) {
       const attrValues = Object.values(richSnippet.attributes).map(v => String(v));
       const priceAttr = attrValues.find(v => v.includes('₹') || v.includes('$'));
       if (priceAttr) price = priceAttr;
    }

    if (!price && organicResult.snippet) {
      const priceRegex = /(?:₹|Rs\.?|INR|\$|€|£|GBP|USD)\s?[\d,]+(?:\.\d{2})?/i;
      const match = organicResult.snippet.match(priceRegex);
      if (match) price = match[0];
    }

    if (!price && organicResult.snippet) {
       const explicitPrice = organicResult.snippet.match(/Price:\s*([^.]*)/i);
       if (explicitPrice && explicitPrice[1]) {
          const pMatch = explicitPrice[1].match(/(?:₹|Rs\.?|INR|\$)\s?[\d,]+/i);
          if (pMatch) price = pMatch[0];
       }
    }

    return {
      title,
      price: price || 'Check Price',
      store: storeName
    };
  }

  // --- HTML SCRAPING FALLBACK ---
  private async tryHtmlScraping(url: string): Promise<string | null> {
    try {
      const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) return null;
      
      const html = await response.text();

      const metaMatch = html.match(/<meta[^>]+(?:property|name)=["'](?:og:price:amount|product:price:amount|twitter:data1)["'][^>]+content=["']([^"']+)["']/i);
      if (metaMatch && metaMatch[1]) return this.formatPrice(metaMatch[1], url);

      const jsonLdMatch = html.match(/"price"\s*:\s*["']?(\d+(?:,\d+)*(?:\.\d+)?)["']?/i);
      if (jsonLdMatch && jsonLdMatch[1]) return this.formatPrice(jsonLdMatch[1], url);
      
      return null;
    } catch { return null; }
  }

  private formatPrice(raw: string, url: string): string {
     let cleaned = raw.trim();
     if (/^[\d,.]+$/.test(cleaned)) {
        if (url.includes('.in') || url.includes('flipkart') || url.includes('myntra') || url.includes('ajio')) return `₹${cleaned}`;
        return `$${cleaned}`;
     }
     return cleaned;
  }

  // --- UTILS ---
  private async fetchJson(targetUrl: string): Promise<any> {
    const proxies = [
      {
        name: 'AllOrigins',
        createUrl: (url: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
        parser: async (response: Response) => {
            const data = await response.json();
            if (data.contents) {
                // The actual response from the target URL is a string in 'contents'
                return JSON.parse(data.contents);
            }
            throw new Error('Invalid AllOrigins response format');
        }
      },
      {
        name: 'CORS.IO',
        createUrl: (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
        parser: (response: Response) => response.json()
      },
    ];

    let lastError: Error | null = null;
    for (const proxy of proxies) {
      try {
        const proxyUrl = proxy.createUrl(targetUrl);
        const response = await fetch(proxyUrl);
        if (!response.ok) {
            throw new Error(`Proxy '${proxy.name}' returned status ${response.status}`);
        }
        
        const data = await proxy.parser(response);
        
        // Check for SerpApi's specific error message within the data
        if (data.error) {
            // This is a valid response from SerpApi, but it's an error (e.g., bad API key)
            // We should stop and propagate this error.
            throw new Error(data.error);
        }

        return data; // Success!

      } catch (err: any) {
        console.warn(`Proxy '${proxy.name}' failed:`, err.message);
        lastError = err;
        // If it's a clear API key error, we should stop trying other proxies.
        if (err.message?.includes('API key')) {
            break;
        }
      }
    }

    if (lastError) {
        throw new Error(`All API proxies failed. Last error: ${lastError.message}`);
    }
    
    throw new Error('Failed to fetch from API after trying all proxies.');
  }

  private detectRegion(url: string) {
    const lower = url.toLowerCase();
    if (lower.includes('.in/') || lower.endsWith('.in') || lower.includes('flipkart') || lower.includes('myntra')) {
       return { gl: 'in', google_domain: 'google.co.in', amazon_domain: 'amazon.in' };
    }
    if (lower.includes('.co.uk')) {
       return { gl: 'uk', google_domain: 'google.co.uk', amazon_domain: 'amazon.co.uk' };
    }
    return { gl: 'us', google_domain: 'google.com', amazon_domain: 'amazon.com' };
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

  private extractASIN(url: string): string | null {
    const match = url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/);
    if (match) return match[1];
    try {
      const u = new URL(url);
      if (u.searchParams.get('pd_rd_i')) return u.searchParams.get('pd_rd_i');
    } catch {}
    return null;
  }
}