// Arbitrage Detector: Monitors bid-ask spreads and detects profitable opportunities

import PriceFeedService from './price-feed';

interface ArbOpportunity {
  id?: string;
  asset: string;
  polymarket_id: string;
  kalshi_id: string;
  poly_price: number;
  kalshi_price: number;
  spread_pct: number;
  roi_potential: number;
  poly_expires_at: Date;
  kalshi_expires_at: Date;
  detected_at: Date;
  executed: boolean;
}

class ArbitrageDetector {
  private priceFeedService: PriceFeedService;
  private opportunities: Map<string, ArbOpportunity> = new Map();
  private executedOpportunities: Set<string> = new Set();
  private minSpreadThreshold = 2; // Minimum 2% spread to trigger

  constructor(priceFeedService: PriceFeedService) {
    this.priceFeedService = priceFeedService;
  }

  // Main arbitrage detection loop
  async scanForArbitrage(interval: number = 10000): Promise<void> {
    setInterval(async () => {
      try {
        const opportunities = await this.priceFeedService.detectArbOpportunities();

        opportunities.forEach((opp) => {
          const key = `${opp.polymarket_id}-${opp.kalshi_id}`;

          if (!this.executedOpportunities.has(key)) {
            this.opportunities.set(key, {
              ...opp,
              executed: false,
            });

            if (opp.spread_pct > this.minSpreadThreshold && opp.roi_potential > 1.5) {
              console.log(`🔥 ARB OPPORTUNITY: ${opp.asset}`);
              console.log(`  Spread: ${opp.spread_pct.toFixed(2)}%`);
              console.log(`  ROI: ${opp.roi_potential.toFixed(2)}%`);
              console.log(`  Poly: $${opp.poly_price.toFixed(4)} | Kalshi: $${opp.kalshi_price.toFixed(4)}`);
            }
          }
        });
      } catch (error) {
        console.error('Arbitrage scan error:', error);
      }
    }, interval);
  }

  // Get top opportunities by ROI
  getTopOpportunities(limit: number = 10): ArbOpportunity[] {
    return Array.from(this.opportunities.values())
      .filter((opp) => !opp.executed && opp.roi_potential > this.minSpreadThreshold - 0.5)
      .sort((a, b) => b.roi_potential - a.roi_potential)
      .slice(0, limit);
  }

  // Mark opportunity as executed
  markAsExecuted(polymarketId: string, kalshiId: string): void {
    const key = `${polymarketId}-${kalshiId}`;
    this.executedOpportunities.add(key);
    this.opportunities.delete(key);
  }

  // Filter by time-to-expiry (avoid opportunities expiring too soon)
  filterByTimeToExpiry(opportunities: ArbOpportunity[], minSeconds: number = 30): ArbOpportunity[] {
    return opportunities.filter((opp) => {
      const polyTime = opp.poly_expires_at.getTime() - Date.now();
      const kalshiTime = opp.kalshi_expires_at.getTime() - Date.now();
      return polyTime > minSeconds * 1000 && kalshiTime > minSeconds * 1000;
    });
  }

  // Filter by minimum ROI after fees
  filterByROI(opportunities: ArbOpportunity[], minROI: number = 1.5): ArbOpportunity[] {
    return opportunities.filter((opp) => opp.roi_potential >= minROI);
  }

  // Get statistics
  getStats() {
    const all = Array.from(this.opportunities.values());
    return {
      total_opportunities: all.length,
      executed: this.executedOpportunities.size,
      avg_spread_pct: (
        all.reduce((sum, opp) => sum + opp.spread_pct, 0) / all.length
      ).toFixed(2),
      max_spread_pct: Math.max(...all.map((opp) => opp.spread_pct)).toFixed(2),
      avg_roi: (all.reduce((sum, opp) => sum + opp.roi_potential, 0) / all.length).toFixed(2),
    };
  }
}

export default ArbitrageDetector;
