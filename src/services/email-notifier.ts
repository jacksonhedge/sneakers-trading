// Email Trade Notifier
// Sends trade alerts via Gmail SMTP using nodemailer

import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

import nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { ExecutionResult } from './polymarket-executor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const getEmailConfig = () => ({
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  to: process.env.NOTIFY_EMAIL || '',
});

class EmailNotifier {
  private transporter: nodemailer.Transporter | null = null;
  private lowBalanceAlertSent = false;

  initialize(): boolean {
    const cfg = getEmailConfig();
    if (!cfg.user || !cfg.pass || !cfg.to) {
      console.log('[EMAIL] Missing SMTP_USER, SMTP_PASS, or NOTIFY_EMAIL in .env');
      return false;
    }

    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: cfg.user, pass: cfg.pass },
    });

    console.log(`[EMAIL] Notifications enabled → ${cfg.to}`);
    return true;
  }

  async sendTradeAlert(results: ExecutionResult[]): Promise<void> {
    if (!this.transporter) return;
    const cfg = getEmailConfig();

    const placed = results.filter(r => r.status === 'PLACED' || r.status === 'FILLED');
    const failed = results.filter(r => r.status === 'FAILED');
    if (placed.length === 0 && failed.length === 0) return;

    const totalCost = placed.reduce((s, r) => s + r.costUsdc, 0);
    const now = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

    // Build HTML email
    let rows = '';
    for (const r of results) {
      const statusIcon = r.status === 'FILLED' ? '&#9989;' :
                         r.status === 'PLACED' ? '&#128203;' :
                         r.status === 'FAILED' ? '&#10060;' : '&#9197;';
      const edgeCents = (r.edge.edge * 100).toFixed(1);
      const modelPct = (r.edge.modelProbability * 100).toFixed(1);
      const mktPct = (r.edge.marketPrice * 100).toFixed(1);

      rows += `
        <tr style="border-bottom:1px solid #333;">
          <td style="padding:8px;">${statusIcon} ${r.status}</td>
          <td style="padding:8px;"><strong>${r.edge.direction}</strong> ${r.edge.outcomeLabel}</td>
          <td style="padding:8px;">${r.edge.location}</td>
          <td style="padding:8px;">${r.edge.targetDate}</td>
          <td style="padding:8px;">$${r.price.toFixed(2)} x ${r.size}</td>
          <td style="padding:8px;"><strong>$${r.costUsdc.toFixed(2)}</strong></td>
          <td style="padding:8px;">${edgeCents}c</td>
          <td style="padding:8px;">${modelPct}% vs ${mktPct}%</td>
        </tr>`;
    }

    const html = `
      <div style="font-family:monospace;background:#0a0a0a;color:#e0e0e0;padding:20px;border-radius:8px;">
        <h2 style="color:#00ff88;margin:0 0 4px 0;">Sneakers Trade Alert</h2>
        <p style="color:#888;margin:0 0 16px 0;">${now} ET</p>

        <div style="background:#1a1a2e;padding:12px;border-radius:6px;margin-bottom:16px;">
          <span style="color:#00ff88;font-size:18px;">${placed.length} orders placed</span>
          &nbsp;&nbsp;|&nbsp;&nbsp;
          <span style="color:#ffd700;">$${totalCost.toFixed(2)} deployed</span>
          ${failed.length > 0 ? `&nbsp;&nbsp;|&nbsp;&nbsp;<span style="color:#ff4444;">${failed.length} failed</span>` : ''}
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#1a1a2e;color:#888;">
              <th style="padding:8px;text-align:left;">Status</th>
              <th style="padding:8px;text-align:left;">Trade</th>
              <th style="padding:8px;text-align:left;">City</th>
              <th style="padding:8px;text-align:left;">Date</th>
              <th style="padding:8px;text-align:left;">Price x Qty</th>
              <th style="padding:8px;text-align:left;">Cost</th>
              <th style="padding:8px;text-align:left;">Edge</th>
              <th style="padding:8px;text-align:left;">Model vs Mkt</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        ${this.buildAnalysisSection(results)}

        <div style="margin-top:16px;padding:12px;background:#1a1a2e;border-radius:6px;">
          <p style="margin:0;color:#888;font-size:12px;">
            Powered by Sneakers Weather Engine | 28 data sources | NOAA + Xweather + Open-Meteo ensemble
          </p>
        </div>
      </div>`;

    const subject = `Sneakers: ${placed.length} weather trade${placed.length !== 1 ? 's' : ''} placed ($${totalCost.toFixed(2)})`;

    // Gather radar screenshots for traded cities
    const attachments = this.gatherRadarAttachments(results);

    try {
      await this.transporter.sendMail({
        from: `"Sneakers Trading" <${cfg.user}>`,
        to: cfg.to,
        subject,
        html,
        attachments,
      });
      console.log(`[EMAIL] Trade alert sent to ${cfg.to} (${attachments.length} radar attachments)`);
    } catch (e) {
      console.error(`[EMAIL] Send failed: ${(e as Error).message}`);
    }
  }

  private gatherRadarAttachments(results: ExecutionResult[]): nodemailer.SendMailOptions['attachments'] {
    const radarDir = path.join(__dirname, '../../logs/radar-screenshots');
    if (!fs.existsSync(radarDir)) return [];

    const attachments: NonNullable<nodemailer.SendMailOptions['attachments']> = [];
    const addedCities = new Set<string>();

    for (const r of results) {
      if (r.status !== 'PLACED' && r.status !== 'FILLED') continue;

      const citySlug = r.edge.location.toLowerCase().replace(/\s+/g, '-');
      if (addedCities.has(citySlug)) continue;
      addedCities.add(citySlug);

      // Attach city-level and regional radar if available
      for (const level of ['city', 'regional']) {
        const pattern = `${citySlug}_${level}_`;
        try {
          const files = fs.readdirSync(radarDir).filter(f => f.startsWith(pattern) && f.endsWith('.png'));
          if (files.length > 0) {
            const filePath = path.join(radarDir, files[0]);
            const stat = fs.statSync(filePath);
            // Only attach if file is recent (< 1hr), not too large (< 2MB),
            // and not an error tile (RainViewer error tiles are exactly 21314 bytes)
            if (Date.now() - stat.mtimeMs < 60 * 60 * 1000 && stat.size < 2 * 1024 * 1024 && stat.size !== 21314) {
              attachments.push({
                filename: `${r.edge.location}_${level}_radar.png`,
                path: filePath,
                contentType: 'image/png',
              });
            }
          }
        } catch { /* non-critical */ }
      }

      // Also attach satellite if available
      const satFile = `satellite_${citySlug}.png`;
      const satPath = path.join(radarDir, satFile);
      try {
        if (fs.existsSync(satPath)) {
          const stat = fs.statSync(satPath);
          if (Date.now() - stat.mtimeMs < 60 * 60 * 1000 && stat.size < 2 * 1024 * 1024) {
            attachments.push({
              filename: `${r.edge.location}_satellite.png`,
              path: satPath,
              contentType: 'image/png',
            });
          }
        }
      } catch { /* non-critical */ }
    }

    return attachments;
  }

  private buildAnalysisSection(results: ExecutionResult[]): string {
    const tradedResults = results.filter(r => r.status === 'PLACED' || r.status === 'FILLED');
    if (tradedResults.length === 0) return '';

    let analysis = `
      <div style="margin-top:20px;">
        <h3 style="color:#ffd700;margin:0 0 12px 0;">Trade Analysis</h3>`;

    for (const r of tradedResults) {
      const e = r.edge;
      const modelPct = (e.modelProbability * 100).toFixed(1);
      const mktPct = (e.marketPrice * 100).toFixed(1);
      const edgeCents = (e.edge * 100).toFixed(1);
      const forecastF = e.forecastMeanF?.toFixed(1) || '?';
      const spreadF = e.forecastSpreadF?.toFixed(1) || '?';
      const kellyPct = (e.kellyFraction * 100).toFixed(1);
      const hours = e.hoursUntilResolution?.toFixed(0) || '?';
      const confColor = e.confidence === 'HIGH' ? '#00ff88' : e.confidence === 'MEDIUM' ? '#ffd700' : '#ff8844';

      // Build the forecast reasoning
      const tempRange = `${e.tempRangeLowF}°F–${e.tempRangeHighF}°F`;
      const forecastStr = `${forecastF}°F ± ${spreadF}°F`;

      // Direction reasoning
      const directionReason = e.direction === 'BUY_YES'
        ? `Model says YES is underpriced — market has ${mktPct}% but ensemble forecasts ${modelPct}%`
        : `Model says NO is underpriced — market overvalues YES at ${mktPct}%, model sees only ${modelPct}%`;

      // Signals
      const signals = (e.supportingSignals && e.supportingSignals.length > 0)
        ? e.supportingSignals.map(s => `<span style="background:#1a2a1a;color:#66cc88;padding:2px 6px;border-radius:3px;font-size:11px;margin:2px;">${s}</span>`).join(' ')
        : '<span style="color:#666;">Standard NOAA + Xweather ensemble</span>';

      analysis += `
        <div style="background:#111;border-left:3px solid ${confColor};padding:12px 16px;margin-bottom:12px;border-radius:0 6px 6px 0;">
          <div style="color:#fff;font-size:14px;font-weight:bold;margin-bottom:6px;">
            ${e.direction} ${e.outcomeLabel} — ${e.location} (${e.targetDate})
          </div>
          <div style="color:#ccc;font-size:12px;line-height:1.6;">
            <strong style="color:#00ccff;">Forecast:</strong> Ensemble predicts ${forecastStr} high for ${e.location}. Market bucket: ${tempRange}.<br/>
            <strong style="color:#00ccff;">Edge:</strong> ${directionReason}. That's a <strong>${edgeCents}c edge</strong>.<br/>
            <strong style="color:#00ccff;">Sizing:</strong> Kelly fraction ${kellyPct}% → $${r.costUsdc.toFixed(2)} position (${r.size} shares @ $${r.price.toFixed(3)}).<br/>
            <strong style="color:#00ccff;">Confidence:</strong> <span style="color:${confColor};">${e.confidence}</span> | ${hours}h to resolution | $${e.volume.toLocaleString()} market volume<br/>
            <strong style="color:#00ccff;">Signals:</strong> ${signals}
          </div>
        </div>`;
    }

    analysis += '</div>';
    return analysis;
  }

  async sendLowBalanceAlert(balance: number, deployed: number, bankroll: number): Promise<void> {
    if (!this.transporter || this.lowBalanceAlertSent) return;
    const cfg = getEmailConfig();
    const remaining = bankroll - deployed;
    const now = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

    // Alert when bankroll remaining < $50 OR wallet balance < $50
    if (remaining > 50 && balance > 50) return;

    this.lowBalanceAlertSent = true;

    const reason = remaining <= 50
      ? `Bankroll nearly exhausted: $${remaining.toFixed(2)} of $${bankroll} remaining ($${deployed.toFixed(2)} deployed)`
      : `Wallet balance low: $${balance.toFixed(2)}`;

    try {
      await this.transporter.sendMail({
        from: `"Sneakers Trading" <${cfg.user}>`,
        to: cfg.to,
        subject: `Sneakers: Low balance — add capital to keep trading`,
        html: `
          <div style="font-family:monospace;background:#0a0a0a;color:#e0e0e0;padding:20px;border-radius:8px;">
            <h2 style="color:#ff4444;margin:0 0 8px 0;">Low Balance Alert</h2>
            <p style="color:#888;margin:0 0 16px 0;">${now} ET</p>
            <div style="background:#2a1a1a;padding:16px;border-radius:6px;border-left:3px solid #ff4444;">
              <p style="color:#ff8888;font-size:16px;margin:0 0 12px 0;">${reason}</p>
              <table style="color:#ccc;font-size:14px;">
                <tr><td style="padding:4px 12px 4px 0;">Wallet balance:</td><td><strong>$${balance.toFixed(2)}</strong></td></tr>
                <tr><td style="padding:4px 12px 4px 0;">Bankroll limit:</td><td>$${bankroll.toFixed(2)}</td></tr>
                <tr><td style="padding:4px 12px 4px 0;">Deployed:</td><td>$${deployed.toFixed(2)}</td></tr>
                <tr><td style="padding:4px 12px 4px 0;">Remaining:</td><td style="color:${remaining < 20 ? '#ff4444' : '#ffd700'};">$${remaining.toFixed(2)}</td></tr>
              </table>
              <p style="color:#aaa;margin:16px 0 0 0;">The engine will pause trading until more capital is available. Add funds to your Polymarket wallet and increase the WEATHER_BANKROLL in .env to resume.</p>
            </div>
          </div>`,
      });
      console.log(`[EMAIL] Low balance alert sent — remaining: $${remaining.toFixed(2)}, wallet: $${balance.toFixed(2)}`);
    } catch (e) {
      console.error(`[EMAIL] Low balance alert failed: ${(e as Error).message}`);
    }
  }

  // Reset so alert can fire again after capital is added
  resetLowBalanceAlert(): void {
    this.lowBalanceAlertSent = false;
  }

  async sendTestEmail(): Promise<boolean> {
    if (!this.transporter) return false;
    const cfg = getEmailConfig();

    try {
      await this.transporter.sendMail({
        from: `"Sneakers Trading" <${cfg.user}>`,
        to: cfg.to,
        subject: 'Sneakers Trading - Notifications Active',
        html: `
          <div style="font-family:monospace;background:#0a0a0a;color:#e0e0e0;padding:20px;border-radius:8px;">
            <h2 style="color:#00ff88;">Sneakers Notifications Active</h2>
            <p>You'll receive an email every time the weather trading bot places orders on Polymarket.</p>
            <p style="color:#888;">Sent at ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET</p>
          </div>`,
      });
      console.log(`[EMAIL] Test email sent to ${cfg.to}`);
      return true;
    } catch (e) {
      console.error(`[EMAIL] Test failed: ${(e as Error).message}`);
      return false;
    }
  }
}

export { EmailNotifier };
export default EmailNotifier;
