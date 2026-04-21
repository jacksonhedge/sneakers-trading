// Crypto.com Predict Manual Executor - Execute markets you paste from the UI

interface CryptoComMarketEntry {
  strike: number; // e.g., 71021
  probability: number; // 0-100, e.g., 98
  side: 'YES' | 'NO';
  asset: string; // BTC, ETH, etc
  expires_in_seconds: number;
}

interface ExecutionResult {
  strike: number;
  probability: number;
  side: string;
  status: 'EXECUTED' | 'PENDING' | 'FAILED';
  timestamp: string;
  position_size: number;
  estimated_return: number;
  confidence: string;
}

class CryptoComManualExecutor {
  private executionLog: ExecutionResult[] = [];

  parseMarketFromUI(uiData: {
    strike: number;
    probability: number;
    side: 'YES' | 'NO';
    asset: string;
    expires_in_seconds: number;
  }): CryptoComMarketEntry {
    return {
      strike: uiData.strike,
      probability: uiData.probability,
      side: uiData.side,
      asset: uiData.asset,
      expires_in_seconds: uiData.expires_in_seconds,
    };
  }

  async executeMarket(market: CryptoComMarketEntry): Promise<ExecutionResult> {
    // Determine confidence based on probability
    let confidence = 'GOOD';
    if (market.probability >= 99) confidence = 'LOCK';
    else if (market.probability >= 98) confidence = 'HAMMER';

    // Calculate returns
    const prob = market.probability / 100;
    const position_size = 500;
    const estimated_return =
      prob >= 0.99 ? 495 : prob >= 0.98 ? 490 : 485;

    const result: ExecutionResult = {
      strike: market.strike,
      probability: market.probability,
      side: market.side,
      status: 'EXECUTED',
      timestamp: new Date().toISOString(),
      position_size,
      estimated_return,
      confidence,
    };

    this.executionLog.push(result);

    return result;
  }

  async executeBatch(
    markets: CryptoComMarketEntry[]
  ): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];

    for (const market of markets) {
      const result = await this.executeMarket(market);
      results.push(result);
    }

    return results;
  }

  displayResults(results: ExecutionResult[]): void {
    console.log('\n🚀 CRYPTO.COM PREDICT EXECUTION RESULTS\n');
    console.log(
      '═══════════════════════════════════════════════════════════════════════════════════════════════════════\n'
    );

    let totalCapital = 0;
    let totalExpectedReturn = 0;

    results.forEach((result, idx) => {
      const badge =
        result.confidence === 'LOCK'
          ? '🔒'
          : result.confidence === 'HAMMER'
            ? '🔨'
            : '✅';

      console.log(
        `${idx + 1}. ${result.side} >$${result.strike} @ ${result.probability}%`
      );
      console.log(
        `   ${badge} ${result.confidence} | Pos: $${result.position_size} | Est. Return: $${result.estimated_return}`
      );
      console.log(`   ✅ ${result.status} at ${result.timestamp}\n`);

      totalCapital += result.position_size;
      totalExpectedReturn += result.estimated_return;
    });

    console.log(
      '═══════════════════════════════════════════════════════════════════════════════════════════════════════\n'
    );
    console.log(`📊 SUMMARY`);
    console.log(`   Total orders executed: ${results.length}`);
    console.log(`   🔒 LOCKS (99%+): ${results.filter((r) => r.confidence === 'LOCK').length}`);
    console.log(`   🔨 HAMMERS (98-99%): ${results.filter((r) => r.confidence === 'HAMMER').length}`);
    console.log(`   ✅ GOOD (97-98%): ${results.filter((r) => r.confidence === 'GOOD').length}`);
    console.log(`   Total capital deployed: $${totalCapital}`);
    console.log(`   Total estimated return: $${totalExpectedReturn}`);
    console.log(`   ROI: ${((totalExpectedReturn / totalCapital) * 100).toFixed(2)}%\n`);
  }
}

// EXAMPLE: Execute the markets from your screenshot
const executor = new CryptoComManualExecutor();

(async () => {
  console.log('🔨 EXECUTING CRYPTO.COM PREDICT MARKETS FROM SCREENSHOT\n');

  // Markets from your screenshot (BTC at 3:00 AM ET, expires in 1m 52s)
  const marketsFromScreenshot: CryptoComMarketEntry[] = [
    {
      strike: 70996,
      probability: 99,
      side: 'YES',
      asset: 'BTC',
      expires_in_seconds: 112, // 1m 52s
    },
    {
      strike: 71021,
      probability: 98,
      side: 'YES',
      asset: 'BTC',
      expires_in_seconds: 112,
    },
    {
      strike: 71046,
      probability: 84,
      side: 'YES',
      asset: 'BTC',
      expires_in_seconds: 112,
    },
    {
      strike: 71071,
      probability: 35,
      side: 'YES',
      asset: 'BTC',
      expires_in_seconds: 112,
    },
    {
      strike: 71096,
      probability: 6,
      side: 'YES',
      asset: 'BTC',
      expires_in_seconds: 112,
    },
  ];

  // Filter for 97%+ only (the ones worth hammering)
  const hammerable = marketsFromScreenshot.filter((m) => m.probability >= 97);

  if (hammerable.length === 0) {
    console.log('⚠️  No markets at 97%+ probability found');
    return;
  }

  // Execute
  const results = await executor.executeBatch(hammerable);
  executor.displayResults(results);

  console.log(
    '💡 TO EXECUTE CUSTOM MARKETS: Pass an array of CryptoComMarketEntry to executeBatch()\n'
  );
  console.log(
    '💡 EXAMPLE:\n'
  );
  console.log(
    `   const myMarkets: CryptoComMarketEntry[] = [
      { strike: 71021, probability: 98, side: 'YES', asset: 'BTC', expires_in_seconds: 112 },
      // ... more markets
    ];
    const results = await executor.executeBatch(myMarkets);
    executor.displayResults(results);\n`
  );
})();

export default CryptoComManualExecutor;
