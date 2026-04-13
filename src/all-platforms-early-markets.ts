// Scan Crypto.com, Coinbase, Robinhood for early morning expiring markets

import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config({ path: '../../apps/trader/.env' });

interface EarlyMarket {
  platform: string;
  instrument: string;
  type: string; // 'option', 'future', 'prediction', etc.
  expiry: string;
  hours_until_expiry: number;
  bid: number;
  ask: number;
  spread: number;
}

class AllPlatformsEarlyMarkets {
  private coinbaseKey = process.env.COINBASE_API_KEY;
  private coinbaseSecret = process.env.COINBASE_API_SECRET;
  private cryptoComKey = process.env.CRYPTO_COM_API_KEY;
  private robinhoodToken = process.env.ROBINHOOD_API_TOKEN;

  // ========== COINBASE ==========
  async getCoinbaseEarlyMarkets(): Promise<EarlyMarket[]> {
    try {
      // Coinbase Advanced Trading API - check for options/futures expiring soon
      const response = await fetch(
        'https://api.coinbase.com/api/v3/brokerage/orders',
        {
          headers: {
            Authorization: `Bearer ${this.coinbaseKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        console.log(`⚠️  Coinbase API error: ${response.status}`);
        return [];
      }

      const data = (await response.json()) as any;

      // Check for any open option positions with near-term expiry
      const earlyMarkets: EarlyMarket[] = [];

      // Coinbase doesn't expose prediction markets, but has perpetuals
      // Let's check for any expiring positions
      if (data.orders && Array.isArray(data.orders)) {
        data.orders.forEach((order: any) => {
          // Look for filled orders with expiry info
          if (order.filled_size && order.product_id) {
            earlyMarkets.push({
              platform: 'Coinbase',
              instrument: order.product_id,
              type: 'perpetual',
              expiry: 'perpetual (no expiry)',
              hours_until_expiry: Infinity,
              bid: parseFloat(order.price) || 0,
              ask: parseFloat(order.price) || 0,
              spread: 0,
            });
          }
        });
      }

      return earlyMarkets;
    } catch (e) {
      console.log(
        `⚠️  Coinbase fetch error: ${(e as Error).message}`
      );
      return [];
    }
  }

  // ========== CRYPTO.COM ==========
  async getCryptoComEarlyMarkets(): Promise<EarlyMarket[]> {
    try {
      // Crypto.com Derivatives API
      const response = await fetch(
        'https://uat-api.3ona.co/v2/public/get-ticker',
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        console.log(`⚠️  Crypto.com API error: ${response.status}`);
        return [];
      }

      const data = (await response.json()) as any;
      const earlyMarkets: EarlyMarket[] = [];

      // Crypto.com returns perpetual futures with 24/7 trading
      if (data.result && data.result.data && Array.isArray(data.result.data.tickers)) {
        data.result.data.tickers.forEach((ticker: any) => {
          // Look for instruments with expiry in the next 12 hours
          const instrument = ticker.i || ticker.instrument_name || 'unknown';

          // If it's a dated instrument (like BTC_USDT_220415), parse the date
          const dateMatch = instrument.match(/(\d{6})/);
          if (dateMatch) {
            // Format: YYMMDD
            const dateStr = dateMatch[1];
            const yy = parseInt(dateStr.substring(0, 2));
            const mm = parseInt(dateStr.substring(2, 4));
            const dd = parseInt(dateStr.substring(4, 6));

            const fullYear = yy < 50 ? 2000 + yy : 1900 + yy;
            const expiry = new Date(`${fullYear}-${mm}-${dd}`);
            const now = new Date();
            const hoursLeft = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60);

            if (hoursLeft < 12 && hoursLeft > 0) {
              earlyMarkets.push({
                platform: 'Crypto.com',
                instrument,
                type: 'perpetual/future',
                expiry: expiry.toISOString().split('T')[0],
                hours_until_expiry: hoursLeft,
                bid: parseFloat(ticker.b || '0') || 0,
                ask: parseFloat(ticker.a || '0') || 0,
                spread: (parseFloat(ticker.a || '0') - parseFloat(ticker.b || '0')) / parseFloat(ticker.b || '1'),
              });
            }
          }
        });
      }

      return earlyMarkets.sort((a, b) => a.hours_until_expiry - b.hours_until_expiry);
    } catch (e) {
      console.log(
        `⚠️  Crypto.com fetch error: ${(e as Error).message}`
      );
      return [];
    }
  }

  // ========== ROBINHOOD ==========
  async getRobinhoodEarlyMarkets(): Promise<EarlyMarket[]> {
    try {
      // Robinhood has 24/7 crypto trading + options
      const response = await fetch('https://api.robinhood.com/crypto/watchlists/', {
        headers: {
          Authorization: `Bearer ${this.robinhoodToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.log(`⚠️  Robinhood API error: ${response.status}`);
        return [];
      }

      const data = (await response.json()) as any;
      const earlyMarkets: EarlyMarket[] = [];

      // Robinhood crypto is perpetual (24/7, no expiry)
      // But check for any listed options expiring early
      if (data.results && Array.isArray(data.results)) {
        data.results.forEach((item: any) => {
          earlyMarkets.push({
            platform: 'Robinhood',
            instrument: item.currency?.code || item.id || 'unknown',
            type: 'crypto',
            expiry: '24/7 (no expiry)',
            hours_until_expiry: Infinity,
            bid: parseFloat(item.ask_price || '0') || 0,
            ask: parseFloat(item.bid_price || '0') || 0,
            spread: 0,
          });
        });
      }

      return earlyMarkets;
    } catch (e) {
      console.log(
        `⚠️  Robinhood fetch error: ${(e as Error).message}`
      );
      return [];
    }
  }

  displayResults(
    coinbaseMarkets: EarlyMarket[],
    cryptoComMarkets: EarlyMarket[],
    robinhoodMarkets: EarlyMarket[]
  ): void {
    const all = [
      ...coinbaseMarkets.filter((m) => m.hours_until_expiry < 24),
      ...cryptoComMarkets.filter((m) => m.hours_until_expiry < 24),
      ...robinhoodMarkets.filter((m) => m.hours_until_expiry < 24),
    ].sort((a, b) => a.hours_until_expiry - b.hours_until_expiry);

    console.log('\n🌙 EARLY MORNING MARKETS (< 24h expiry across all platforms)\n');
    console.log(
      '═══════════════════════════════════════════════════════════════════════════════════════════════════════\n'
    );

    if (all.length === 0) {
      console.log('❌ No markets with <24h expiry found\n');
      console.log('📊 Platform status:');
      console.log(`   Coinbase: ${coinbaseMarkets.length} instruments checked`);
      console.log(`   Crypto.com: ${cryptoComMarkets.length} instruments checked`);
      console.log(`   Robinhood: ${robinhoodMarkets.length} instruments checked`);
      console.log(
        '\n💡 Note: Crypto.com & Robinhood trade perpetuals (24/7, no expiry)\n'
      );
      console.log(
        '💡 To find early morning markets, we need to check for:\n'
      );
      console.log('   - Weekly/monthly futures contracts on Crypto.com\n');
      console.log('   - Options with Friday/weekly expiry on Robinhood\n');
      return;
    }

    all.forEach((market, idx) => {
      console.log(
        `${idx + 1}. [${market.platform}] ${market.instrument} (${market.type})`
      );
      console.log(
        `   Expiry: ${market.expiry} | ${market.hours_until_expiry < Infinity ? market.hours_until_expiry.toFixed(1) + 'h left' : 'perpetual'}`
      );
      console.log(
        `   Bid: ${market.bid.toFixed(4)} | Ask: ${market.ask.toFixed(4)} | Spread: ${(market.spread * 100).toFixed(2)}%\n`
      );
    });

    console.log(
      '═══════════════════════════════════════════════════════════════════════════════════════════════════════\n'
    );
  }
}

// Main
const scanner = new AllPlatformsEarlyMarkets();

(async () => {
  console.log('🔍 Scanning Coinbase, Crypto.com, Robinhood for early morning markets...\n');

  const [coinbase, cryptoCom, robinhood] = await Promise.all([
    scanner.getCoinbaseEarlyMarkets(),
    scanner.getCryptoComEarlyMarkets(),
    scanner.getRobinhoodEarlyMarkets(),
  ]);

  scanner.displayResults(coinbase, cryptoCom, robinhood);
})();

export default AllPlatformsEarlyMarkets;
