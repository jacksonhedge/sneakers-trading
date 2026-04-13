// Dashboard Server - Real-time web UI for Opportunity Hunter trades

import express from 'express';
import { WebSocketServer } from 'ws';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.DASHBOARD_PORT || 3333;
const logsDir = path.join(__dirname, '../../logs');
const publicDir = path.join(__dirname, '../../../public');

interface Trade {
  timestamp: string;
  market_id: string;
  asset: string;
  side: 'YES' | 'NO';
  probability: number;
  position_size: number;
  estimated_return: number;
  status: 'SUCCESS' | 'FAILED';
  error?: string;
}

let lastChecked = 0;
const connectedClients = new Set<any>();

// Serve static dashboard
app.use(express.static(publicDir));
app.use(express.json());

// API endpoint to get current trades
app.get('/api/trades', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const logPath = path.join(logsDir, `trades-${today}.json`);

    if (!fs.existsSync(logPath)) {
      return res.json([]);
    }

    const data = fs.readFileSync(logPath, 'utf-8');
    const trades: Trade[] = JSON.parse(data);
    res.json(trades);
  } catch (e) {
    res.json([]);
  }
});

// API endpoint to get dashboard stats
app.get('/api/stats', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const logPath = path.join(logsDir, `trades-${today}.json`);

    let trades: Trade[] = [];
    if (fs.existsSync(logPath)) {
      const data = fs.readFileSync(logPath, 'utf-8');
      trades = JSON.parse(data);
    }

    const successful = trades.filter((t) => t.status === 'SUCCESS');
    const failed = trades.filter((t) => t.status === 'FAILED');
    const totalCapitalDeployed = successful.reduce((sum, t) => sum + t.position_size, 0);
    const totalProfitPotential = successful.reduce((sum, t) => sum + t.estimated_return, 0);

    res.json({
      totalTrades: trades.length,
      successfulTrades: successful.length,
      failedTrades: failed.length,
      totalCapitalDeployed,
      totalProfitPotential,
      remainingCapital: 5000 - totalCapitalDeployed,
      avgProfitPerTrade: successful.length > 0 ? totalProfitPotential / successful.length : 0,
      targetDaily: 15,
      progressPercent: Math.min(100, (successful.length / 15) * 100),
    });
  } catch (e) {
    res.json({
      totalTrades: 0,
      successfulTrades: 0,
      failedTrades: 0,
      totalCapitalDeployed: 0,
      totalProfitPotential: 0,
      remainingCapital: 5000,
      avgProfitPerTrade: 0,
      targetDaily: 15,
      progressPercent: 0,
    });
  }
});

// WebSocket connections for real-time updates
wss.on('connection', (ws) => {
  connectedClients.add(ws);

  ws.on('close', () => {
    connectedClients.delete(ws);
  });
});

// Watch for trade log changes and broadcast
function watchTradeLog() {
  const today = new Date().toISOString().split('T')[0];
  const logPath = path.join(logsDir, `trades-${today}.json`);

  const checkForChanges = () => {
    if (fs.existsSync(logPath)) {
      const stat = fs.statSync(logPath);
      if (stat.mtimeMs > lastChecked) {
        lastChecked = stat.mtimeMs;

        try {
          const data = fs.readFileSync(logPath, 'utf-8');
          const trades = JSON.parse(data);

          // Broadcast to all connected clients
          connectedClients.forEach((client) => {
            if (client.readyState === 1) {
              client.send(
                JSON.stringify({
                  type: 'TRADES_UPDATE',
                  trades,
                })
              );
            }
          });
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
  };

  setInterval(checkForChanges, 500); // Check every 500ms
}

// Start the server
server.listen(PORT, () => {
  console.log(`\n🎯 Dashboard Server running at http://localhost:${PORT}\n`);
  console.log(`   👀 View live trades at: http://localhost:${PORT}\n`);
  watchTradeLog();
});

export default server;
