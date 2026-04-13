// Crypto.com Closing Markets/Derivatives - Find instruments expiring soon at extreme prices

import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config({ path: '../../apps/trader/.env' });

interface ClosingInstrument {
  platform: string;
  instrument: string;
  type: string;
  expiry: string;
  seconds_until_expiry: number;
  minutes_until_expiry: number;
  current_price: number;
  bid: number;
  ask: number;
  spread_pct: number;
  confidence: string;
}

class CryptoComClosingMarkets {
  private cryptoComUrl = 'https://api.crypto.com/v2';
  private apiKey = process.env.CRYPTO_COM_API_KEY;

  async getPublicInstruments(): Promise<ClosingInstrument[]> {
    try {
      // Crypto.com public market data endpoint
      const response = await fetch(
        `${this.cryptoComUrl}/public/get-instruments`,
        {
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
      const closingInstruments: ClosingInstrument[] = [];

      if (!data.result || !data.result.instruments) return [];

      data.result.instruments.forEach((instr: any) => {
        // Look for instruments with expiry dates (futures/options)
        const expireDate = instr.expire_date || instr.expiry || instr.settlement_date;

        if (!expireDate) return; // Skip perpetuals

        const expiryDate = new Date(expireDate);
        const now = new Date();
        const secondsLeft = (expiryDate.getTime() - now.getTime()) / 1000;
        const minutesLeft = secondsLeft / 60;

        // Only include if expiring within 10 minutes
        if (minutesLeft > 10 || minutesLeft <= 0) return;

        const bid = parseFloat(instr.bid || instr.b || '0');
        const ask = parseFloat(instr.ask || instr.a || '0');
        const mid = (bid + ask) / 2;
        const spread = ask - bid;
        const spreadPct = bid > 0 ? (spread / bid) * 100 : 0;

        // For binary-like instruments, extreme prices (0.01-0.99) indicate high confidence
        // Look for prices close to 0 or 1
        let confidence = 'Standard';
        if (bid < 0.05 || ask > 0.95) {
          confidence = 'HAMMER';
        }
        if (bid < 0.01 || ask > 0.99) {
          confidence = 'LOCK';
        }

        if (confidence !== 'Standard') {
          closingInstruments.push({
            platform: 'Crypto.com',
            instrument: instr.instrument_name || instr.symbol || instr.id,
            type: instr.type || 'unknown',
            expiry: expiryDate.toISOString(),
            seconds_until_expiry: secondsLeft,
            minutes_until_expiry: minutesLeft,
            current_price: mid,
            bid,
            ask,
            spread_pct: spreadPct,
            confidence,
          });
        }
      });

      return closingInstruments.sort(
        (a, b) => a.seconds_until_expiry - b.seconds_until_expiry
      );
    } catch (e) {
      console.log(`⚠️  Error fetching Crypto.com instruments: ${(e as Error).message}`);
      return [];
    }
  }

  async getTickers(): Promise<ClosingInstrument[]> {
    // Alternative: Check recent ticker data for any expiring instruments
    try {
      const response = await fetch(`${this.cryptoComUrl}/public/get-ticker`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) return [];

      const data = (await response.json()) as any;
      const closingInstruments: ClosingInstrument[] = [];

      if (!data.result || !data.result.data || !data.result.data.tickers)
        return [];

      data.result.data.tickers.forEach((ticker: any) => {
        const instrument = ticker.i || '';

        // Parse dated instruments (e.g., BTC_USDT_220415 = 2022-04-15)
        const dateMatch = instrument.match(/(\d{6})/);
        if (dateMatch) {
          const dateStr = dateMatch[1];
          const yy = parseInt(dateStr.substring(0, 2));
          const mm = parseInt(dateStr.substring(2, 4));
          const dd = parseInt(dateStr.substring(4, 6));

          const fullYear = yy < 50 ? 2000 + yy : 1900 + yy;
          const expiry = new Date(`${fullYear}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`);
          const now = new Date();
          const secondsLeft = (expiry.getTime() - now.getTime()) / 1000;
          const minutesLeft = secondsLeft / 60;

          if (minutesLeft > 10 || minutesLeft <= 0) return;

          const bid = parseFloat(ticker.b || '0');
          const ask = parseFloat(ticker.a || '0');
          const mid = (bid + ask) / 2;

          closingInstruments.push({
            platform: 'Crypto.com',
            instrument,
            type: 'future/dated',
            expiry: expiry.toISOString(),
            seconds_until_expiry: secondsLeft,
            minutes_until_expiry: minutesLeft,
            current_price: mid,
            bid,
            ask,
            spread_pct: bid > 0 ? ((ask - bid) / bid) * 100 : 0,
            confidence:
              mid < 0.05 || mid > 0.95 ? 'HAMMER' : 'Standard',
          });
        }
      });

      return closingInstruments.sort(
        (a, b) => a.seconds_until_expiry - b.seconds_until_expiry
      );
    } catch (e) {
      console.log(
        `⚠️  Error fetching Crypto.com tickers: ${(e as Error).message}`
      );
      return [];
    }
  }

  displayClosingInstruments(instruments: ClosingInstrument[]): void {
    console.log('\n⏰ CRYPTO.COM - CLOSING INSTRUMENTS (< 10 min)\n');
    console.log(
      '═══════════════════════════════════════════════════════════════════════════════════════════════════════\n'
    );

    if (instruments.length === 0) {
      console.log('❌ No closing instruments found\n');
      console.log('💡 Crypto.com primarily offers perpetuals (24/7, no expiry)\n');
      console.log('💡 This scanner looks for:\n');
      console.log('   - Weekly/monthly futures (e.g., BTC_USDT_WEEKLY)\n');
      console.log('   - Options expiring soon\n');
      console.log('   - Instruments with prices near 0 or 1 (high confidence)\n');
      return;
    }

    instruments.forEach((instr, idx) => {
      const badge = instr.confidence === 'LOCK' ? '🔒' : '🔨';

      console.log(`${idx + 1}. ${instr.instrument} (${instr.type})`);
      console.log(
        `   ${badge} Price: ${instr.current_price.toFixed(4)} | Bid: ${instr.bid.toFixed(4)} | Ask: ${instr.ask.toFixed(4)}`
      );
      console.log(
        `   ⚠️  CLOSING IN ${instr.minutes_until_expiry.toFixed(1)}m (${Math.floor(instr.seconds_until_expiry)}s)`
      );
      console.log(
        `   Spread: ${instr.spread_pct.toFixed(2)}% | Confidence: ${instr.confidence}\n`
      );
    });

    const locks = instruments.filter((i) => i.confidence === 'LOCK').length;
    const hammers = instruments.filter((i) => i.confidence === 'HAMMER').length;

    console.log(
      '═══════════════════════════════════════════════════════════════════════════════════════════════════════\n'
    );
    console.log(`📊 SUMMARY`);
    console.log(`   Total closing instruments: ${instruments.length}`);
    console.log(`   🔒 LOCKS: ${locks}`);
    console.log(`   🔨 HAMMERS: ${hammers}\n`);
  }
}

// Main
const scanner = new CryptoComClosingMarkets();

(async () => {
  console.log(
    '🔍 Scanning Crypto.com for closing instruments (<10 min expiry)...\n'
  );

  const [instruments, tickers] = await Promise.all([
    scanner.getPublicInstruments(),
    scanner.getTickers(),
  ]);

  const all = [...instruments, ...tickers];

  scanner.displayClosingInstruments(all);
})();

export default CryptoComClosingMarkets;
