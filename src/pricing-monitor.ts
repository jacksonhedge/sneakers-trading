// Pricing Monitor: Continuously monitor and analyze YES/NO pricing

import PricingAnalyzer from './services/pricing-analyzer';
import dotenv from 'dotenv';

dotenv.config();

class PricingMonitor {
  private analyzer: PricingAnalyzer;

  constructor() {
    this.analyzer = new PricingAnalyzer();
  }

  async start(): Promise<void> {
    console.log('🚀 Pricing Monitor Started\n');
    console.log('📊 Analyzing YES/NO pricing across:');
    console.log('   • Polymarket (price gauge)');
    console.log('   • Kalshi (execution)');
    console.log('   • Limitless (execution)\n');

    // Start monitoring every 30 seconds
    await this.analyzer.startMonitoring(30);

    // Keep process alive
    setInterval(() => {
      // Just monitoring
    }, 60000);
  }
}

const monitor = new PricingMonitor();
monitor.start();

process.on('SIGINT', () => {
  console.log('\n\n🛑 Stopping monitor...');
  process.exit(0);
});
