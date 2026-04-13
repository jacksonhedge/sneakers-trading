// Crypto.com Prediction Markets Scanner - Find closing markets at 97%+

import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config({ path: '../../apps/trader/.env' });

interface PredictionMarket {
  asset: string;
  strike: string;
  expiry_label: string;
  seconds_until_expiry: number;
  minutes_until_expiry: number;
  side: 'YES' | 'NO';
  probability: number;
  odds: string;
  confidence: 'LOCK' | 'HAMMER' | 'GOOD';
  position_size: number;
  estimated_return: number;
}

class CryptoComPredictionScanner {
  private eventDurationsUrl =
    'https://web.crypto.com/api/proxy/private/knock-out/predictions/api/v1/event-durations';
  private contractsUrl =
    'https://web.crypto.com/api/proxy/public/knock-out/predictions/public/api/v2/contracts';

  async getActiveMarkets(): Promise<PredictionMarket[]> {
    try {
      // Step 1: Get active events for each asset
      const assets = ['BTC', 'ETH', 'LTC', 'BCH', 'DOGE', 'AVAX', 'LINK', 'DOT', 'SHIB'];
      const allEventIds: string[] = [];

      for (const asset of assets) {
        try {
          const response = await fetch(
            `${this.eventDurationsUrl}?event_kind=${asset}`,
            {
              headers: {
                'Content-Type': 'application/json',
              },
            }
          );

          if (response.ok) {
            const data = (await response.json()) as any;
            if (data.data && Array.isArray(data.data)) {
              data.data.forEach((event: any) => {
                if (event.event_id) allEventIds.push(event.event_id);
              });
            }
          }
        } catch {
          // Continue to next asset
        }
      }

      if (allEventIds.length === 0) {
        console.log('⚠️  No active events found');
        return [];
      }

      // Step 2: Fetch contract data for all events
      const contractParams = `?event_id=${allEventIds.join(',')}`;
      const response = await fetch(`${this.contractsUrl}${contractParams}`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.log(`⚠️  Failed to fetch contracts: ${response.status}`);
        return [];
      }

      const data = (await response.json()) as any;
      return this.parseMarkets(data);
    } catch (e) {
      console.error(
        'Error fetching Crypto.com markets:',
        (e as Error).message
      );
      return [];
    }
  }

  private parseMarkets(data: any): PredictionMarket[] {
    const markets: PredictionMarket[] = [];

    // Crypto.com returns contracts array
    const contracts = data.data || data.contracts || data || [];
    const items = Array.isArray(contracts) ? contracts : [];

    items.forEach((contract: any) => {
      try {
        // Parse contract info
        const title = contract.label || contract.title || contract.name || '';
        const assetMatch = title.match(/BTC|ETH|LTC|BCH|DOGE|AVAX|LINK|DOT|SHIB|XLM|HBAR/);
        const asset = assetMatch ? assetMatch[0] : 'UNKNOWN';

        // Parse strike price from label
        const strikeMatch = title.match(/>\$?([\d,]+(?:\.\d{2})?)/);
        const strike = strikeMatch ? strikeMatch[1] : 'unknown';

        // Parse expiry timestamp
        const expiryTime = contract.settlement_time || contract.expiry_time || contract.end_time;
        if (!expiryTime) return;

        const expiryDate = new Date(expiryTime);
        const now = new Date();
        const secondsLeft = (expiryDate.getTime() - now.getTime()) / 1000;
        const minutesLeft = secondsLeft / 60;

        // Only include markets expiring within 30 minutes
        if (minutesLeft > 30 || minutesLeft <= 0) return;

        // Parse YES/NO probabilities from contract
        // Crypto.com may return: yes_price, no_price, or yes_probability, no_probability
        let yesProb = contract.yes_price || contract.yes_probability || 0;
        let noProb = contract.no_price || contract.no_probability || 0;

        // Probabilities might be in 0-1 format already
        if (yesProb > 1) yesProb = yesProb / 100;
        if (noProb > 1) noProb = noProb / 100;

        const expiryLabel = expiryDate.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });

        // Look for 97%+ outcomes
        if (yesProb >= 0.97) {
          markets.push({
            asset,
            strike,
            expiry_label: expiryLabel,
            seconds_until_expiry: secondsLeft,
            minutes_until_expiry: minutesLeft,
            side: 'YES',
            probability: yesProb,
            odds: `${(yesProb * 100).toFixed(1)}%`,
            confidence:
              yesProb >= 0.99 ? 'LOCK' : yesProb >= 0.98 ? 'HAMMER' : 'GOOD',
            position_size: 500,
            estimated_return:
              yesProb >= 0.99 ? 495 : yesProb >= 0.98 ? 490 : 485,
          });
        }

        if (noProb >= 0.97) {
          markets.push({
            asset,
            strike,
            expiry_label: expiryLabel,
            seconds_until_expiry: secondsLeft,
            minutes_until_expiry: minutesLeft,
            side: 'NO',
            probability: noProb,
            odds: `${(noProb * 100).toFixed(1)}%`,
            confidence:
              noProb >= 0.99 ? 'LOCK' : noProb >= 0.98 ? 'HAMMER' : 'GOOD',
            position_size: 500,
            estimated_return:
              noProb >= 0.99 ? 495 : noProb >= 0.98 ? 490 : 485,
          });
        }
      } catch {
        // Skip malformed entries
      }
    });

    return markets.sort((a, b) => a.seconds_until_expiry - b.seconds_until_expiry);
  }

  displayClosingMarkets(markets: PredictionMarket[]): void {
    console.log('\n⏰ CRYPTO.COM PREDICTION - CLOSING MARKETS (97%+, <30 min)\n');
    console.log(
      '═══════════════════════════════════════════════════════════════════════════════════════════════════════\n'
    );

    if (markets.length === 0) {
      console.log('❌ No closing prediction markets at 97%+ probability\n');
      console.log('💡 To find the API endpoint:\n');
      console.log('   1. Open https://crypto.com/predict in your browser\n');
      console.log('   2. Open DevTools (F12) → Network tab\n');
      console.log('   3. Refresh the page\n');
      console.log('   4. Look for API calls (filter by "Fetch/XHR")\n');
      console.log('   5. Share the request URL with format like:\n');
      console.log('      https://crypto.com/predict/api/v1/...\n');
      return;
    }

    markets.forEach((market, idx) => {
      const badge =
        market.confidence === 'LOCK'
          ? '🔒'
          : market.confidence === 'HAMMER'
            ? '🔨'
            : '✅';

      console.log(
        `${idx + 1}. ${market.asset} > $${market.strike} (${market.expiry_label})`
      );
      console.log(
        `   ${badge} BET ${market.side} @ ${market.odds} | Pos: $${market.position_size} | Return: ~$${market.estimated_return}`
      );
      console.log(
        `   ⏱️  CLOSING IN ${market.minutes_until_expiry.toFixed(0)}m (${Math.floor(market.seconds_until_expiry)}s)`
      );
      console.log(`   Confidence: ${market.confidence}\n`);
    });

    const locks = markets.filter((m) => m.confidence === 'LOCK').length;
    const hammers = markets.filter((m) => m.confidence === 'HAMMER').length;
    const goods = markets.filter((m) => m.confidence === 'GOOD').length;

    console.log(
      '═══════════════════════════════════════════════════════════════════════════════════════════════════════\n'
    );
    console.log(`📊 SUMMARY`);
    console.log(`   Total closing opportunities: ${markets.length}`);
    console.log(`   🔒 LOCKS (99%+): ${locks}`);
    console.log(`   🔨 HAMMERS (98-99%): ${hammers}`);
    console.log(`   ✅ GOOD (97-98%): ${goods}`);
    console.log(
      `   Total capital available: $${markets.length * 500} | Max profit: ~$${markets.length * 45}\n`
    );
  }
}

// Main
const scanner = new CryptoComPredictionScanner();

(async () => {
  console.log(
    '🔍 Scanning Crypto.com Prediction for closing markets (97%+, <30 min)...\n'
  );

  const closingMarkets = await scanner.getActiveMarkets();
  scanner.displayClosingMarkets(closingMarkets);
})();

export default CryptoComPredictionScanner;
