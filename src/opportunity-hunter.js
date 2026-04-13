"use strict";
// Opportunity Hunter - Find markets at 97%+ in their last few minutes and auto-execute
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var node_fetch_1 = require("node-fetch");
var dotenv_1 = require("dotenv");
var limitless_executor_1 = require("./limitless-executor");
var fs = require("fs");
var path = require("path");
dotenv_1.default.config({ path: '../../apps/trader/.env' });
var OpportunityHunter = /** @class */ (function () {
    function OpportunityHunter(autoExecute) {
        if (autoExecute === void 0) { autoExecute = true; }
        this.limitlessUrl = 'https://api.limitless.exchange';
        this.limitlessKey = process.env.LIMITLESS_API_KEY;
        this.opportunities = [];
        this.executedMarkets = new Set();
        this.tradeLog = [];
        this.initialBalance = 5000; // Starting capital
        this.autoExecute = true; // Enable auto-execution of CRITICAL opportunities
        this.executor = new limitless_executor_1.default();
        this.autoExecute = autoExecute;
        this.logPath = path.join(__dirname, '../../logs', "trades-".concat(new Date().toISOString().split('T')[0], ".json"));
        this.ensureLogDir();
        this.loadTradeLog();
    }
    OpportunityHunter.prototype.ensureLogDir = function () {
        var logDir = path.dirname(this.logPath);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
    };
    OpportunityHunter.prototype.loadTradeLog = function () {
        var _this = this;
        try {
            if (fs.existsSync(this.logPath)) {
                var data = fs.readFileSync(this.logPath, 'utf-8');
                this.tradeLog = JSON.parse(data);
                this.tradeLog.forEach(function (trade) {
                    _this.executedMarkets.add(trade.market_id);
                });
            }
        }
        catch (e) {
            this.tradeLog = [];
        }
    };
    OpportunityHunter.prototype.saveTradeLog = function () {
        try {
            fs.writeFileSync(this.logPath, JSON.stringify(this.tradeLog, null, 2));
        }
        catch (e) {
            console.error('Failed to save trade log:', e.message);
        }
    };
    OpportunityHunter.prototype.executeOpportunity = function (opp) {
        return __awaiter(this, void 0, void 0, function () {
            var result, trade, e_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.autoExecute)
                            return [2 /*return*/];
                        if (!opp.market_id)
                            return [2 /*return*/];
                        if (this.executedMarkets.has(opp.market_id))
                            return [2 /*return*/]; // Already executed
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.executor.executeGrassMarket(opp.market_id, opp.side, opp.probability, opp.position_size)];
                    case 2:
                        result = _a.sent();
                        trade = {
                            timestamp: new Date().toISOString(),
                            market_id: opp.market_id,
                            asset: opp.asset,
                            side: opp.side,
                            probability: opp.probability,
                            position_size: opp.position_size,
                            estimated_return: opp.estimated_return,
                            status: result.success ? 'SUCCESS' : 'FAILED',
                            error: result.error,
                        };
                        this.tradeLog.push(trade);
                        this.executedMarkets.add(opp.market_id);
                        this.saveTradeLog();
                        console.log("\n\u2705 RECORDED: ".concat(opp.asset, " ").concat(opp.side, " @ ").concat(opp.odds));
                        return [3 /*break*/, 4];
                    case 3:
                        e_1 = _a.sent();
                        console.error("Failed to execute ".concat(opp.market_id, ":"), e_1.message);
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    OpportunityHunter.prototype.huntLimitlessOpportunities = function () {
        return __awaiter(this, void 0, void 0, function () {
            var response, data, markets, opportunities_1, e_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, (0, node_fetch_1.default)("".concat(this.limitlessUrl, "/markets/active"), {
                                headers: {
                                    'X-API-Key': this.limitlessKey,
                                    'Content-Type': 'application/json',
                                },
                            })];
                    case 1:
                        response = _a.sent();
                        if (!response.ok)
                            return [2 /*return*/, []];
                        return [4 /*yield*/, response.json()];
                    case 2:
                        data = (_a.sent());
                        markets = data.data || [];
                        opportunities_1 = [];
                        markets.forEach(function (m) {
                            // Only crypto markets
                            if (!m.tags ||
                                !m.tags.some(function (tag) {
                                    return ['crypto', 'btc', 'eth', 'sol', 'xrp', 'doge', 'ada'].some(function (t) {
                                        return tag.toLowerCase().includes(t);
                                    });
                                }))
                                return;
                            if (!Array.isArray(m.prices) || m.prices[0] >= 1 || m.prices[1] >= 1)
                                return;
                            // Parse expiry
                            var expiryMatch = m.title.match(/(\w+)\s+(\d+),\s+(\d+):(\d+)\s*(AM|PM|UTC)?/);
                            if (!expiryMatch)
                                return;
                            var month = expiryMatch[1], day = expiryMatch[2], hour = expiryMatch[3], min = expiryMatch[4];
                            var expiryDate = new Date("2026-".concat(month, " ").concat(day, " ").concat(hour, ":").concat(min, ":00 UTC"));
                            var now = new Date();
                            var secondsLeft = (expiryDate.getTime() - now.getTime()) / 1000;
                            var minutesLeft = secondsLeft / 60;
                            // Only markets expiring within 10 minutes (the hunting window)
                            if (minutesLeft > 10 || minutesLeft <= 0)
                                return;
                            var yesPrice = m.prices[0];
                            var noPrice = m.prices[1];
                            // Extract asset
                            var titleLower = m.title.toLowerCase();
                            var asset = 'CRYPTO';
                            if (titleLower.includes('btc'))
                                asset = 'BTC';
                            else if (titleLower.includes('eth'))
                                asset = 'ETH';
                            else if (titleLower.includes('sol'))
                                asset = 'SOL';
                            // Determine urgency
                            var urgency = 'NORMAL';
                            if (minutesLeft < 2)
                                urgency = 'CRITICAL';
                            else if (minutesLeft < 5)
                                urgency = 'HIGH';
                            // Find 97%+ opportunities
                            if (yesPrice >= 0.97) {
                                opportunities_1.push({
                                    platform: 'Limitless',
                                    asset: asset,
                                    condition: m.title.substring(0, 50),
                                    side: 'YES',
                                    probability: yesPrice,
                                    odds: "".concat((yesPrice * 100).toFixed(1), "%"),
                                    confidence: yesPrice >= 0.99 ? 'LOCK' : yesPrice >= 0.98 ? 'HAMMER' : 'GOOD',
                                    minutes_until_expiry: minutesLeft,
                                    seconds_until_expiry: secondsLeft,
                                    urgency: urgency,
                                    position_size: 500,
                                    estimated_return: yesPrice >= 0.99 ? 495 : yesPrice >= 0.98 ? 490 : 485,
                                    market_id: m.id,
                                });
                            }
                            if (noPrice >= 0.97) {
                                opportunities_1.push({
                                    platform: 'Limitless',
                                    asset: asset,
                                    condition: m.title.substring(0, 50),
                                    side: 'NO',
                                    probability: noPrice,
                                    odds: "".concat((noPrice * 100).toFixed(1), "%"),
                                    confidence: noPrice >= 0.99 ? 'LOCK' : noPrice >= 0.98 ? 'HAMMER' : 'GOOD',
                                    minutes_until_expiry: minutesLeft,
                                    seconds_until_expiry: secondsLeft,
                                    urgency: urgency,
                                    position_size: 500,
                                    estimated_return: noPrice >= 0.99 ? 495 : noPrice >= 0.98 ? 490 : 485,
                                    market_id: m.id,
                                });
                            }
                        });
                        return [2 /*return*/, opportunities_1.sort(function (a, b) { return a.seconds_until_expiry - b.seconds_until_expiry; })];
                    case 3:
                        e_2 = _a.sent();
                        return [2 /*return*/, []];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    OpportunityHunter.prototype.executeAndDisplay = function (opportunities) {
        return __awaiter(this, void 0, void 0, function () {
            var critical, _i, critical_1, opp;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.autoExecute) return [3 /*break*/, 4];
                        critical = opportunities.filter(function (o) { return o.urgency === 'CRITICAL'; });
                        _i = 0, critical_1 = critical;
                        _a.label = 1;
                    case 1:
                        if (!(_i < critical_1.length)) return [3 /*break*/, 4];
                        opp = critical_1[_i];
                        if (!!this.executedMarkets.has(opp.market_id || '')) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.executeOpportunity(opp)];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4:
                        this.displayOpportunities(opportunities);
                        return [2 /*return*/];
                }
            });
        });
    };
    OpportunityHunter.prototype.displayOpportunities = function (opportunities) {
        var critical = opportunities.filter(function (o) { return o.urgency === 'CRITICAL'; });
        var high = opportunities.filter(function (o) { return o.urgency === 'HIGH'; });
        var normal = opportunities.filter(function (o) { return o.urgency === 'NORMAL'; });
        console.clear();
        console.log("\n\uD83C\uDFAF OPPORTUNITY HUNTER - ".concat(new Date().toLocaleTimeString(), "\n"));
        console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════\n');
        if (opportunities.length === 0) {
            console.log('⏳ No opportunities at 97%+ in last 10 minutes right now\n');
            console.log('💡 Waiting for markets to close in and hit extreme probabilities...\n');
            return;
        }
        // CRITICAL - HAMMER THESE NOW
        if (critical.length > 0) {
            console.log('🚨 CRITICAL - HAMMER THESE NOW (<2 min):\n');
            critical.forEach(function (opp) {
                var badge = opp.confidence === 'LOCK'
                    ? '🔒'
                    : opp.confidence === 'HAMMER'
                        ? '🔨'
                        : '✅';
                console.log("   ".concat(badge, " [").concat(opp.platform, "] ").concat(opp.asset, " ").concat(opp.odds, " ").concat(opp.side));
                console.log("      Closes in ".concat(Math.floor(opp.seconds_until_expiry), "s | $").concat(opp.estimated_return, " profit"));
                console.log("      EXECUTE: npx ts-node -e \"import Executor from './limitless-executor'; const e = new Executor(); e.executeGrassMarket('".concat(opp.market_id, "', '").concat(opp.side, "', ").concat(opp.probability, ", 500)\"\n"));
            });
        }
        // HIGH - PREPARE TO EXECUTE
        if (high.length > 0) {
            console.log("\u26A0\uFE0F  HIGH PRIORITY (2-5 min): ".concat(high.length, " markets\n"));
            high.forEach(function (opp) {
                var badge = opp.confidence === 'LOCK'
                    ? '🔒'
                    : opp.confidence === 'HAMMER'
                        ? '🔨'
                        : '✅';
                console.log("   ".concat(badge, " ").concat(opp.asset, " ").concat(opp.odds, " | ").concat(Math.floor(opp.minutes_until_expiry), "m left\n"));
            });
        }
        // NORMAL - MONITOR
        if (normal.length > 0) {
            console.log("\uD83D\uDCCA NORMAL (5-10 min): ".concat(normal.length, " markets - monitoring\n"));
        }
        console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════\n');
        console.log("\uD83D\uDCC8 SUMMARY");
        console.log("   Total opportunities: ".concat(opportunities.length));
        console.log("   \uD83D\uDD12 LOCKS (99%+): ".concat(opportunities.filter(function (o) { return o.confidence === 'LOCK'; }).length));
        console.log("   \uD83D\uDD28 HAMMERS (98-99%): ".concat(opportunities.filter(function (o) { return o.confidence === 'HAMMER'; }).length));
        console.log("   \u2705 GOOD (97-98%): ".concat(opportunities.filter(function (o) { return o.confidence === 'GOOD'; }).length));
        console.log("   Total capital opportunity: $".concat(opportunities.length * 500));
        console.log("   Max potential profit: $".concat(opportunities.reduce(function (sum, o) { return sum + o.estimated_return; }, 0), "\n"));
        if (critical.length > 0 && !this.autoExecute) {
            console.log('⏱️  ⏱️  ⏱️  CRITICAL MARKETS DETECTED - ACT NOW! ⏱️  ⏱️  ⏱️\n');
        }
        // Show daily stats
        this.displayDailyStats();
    };
    OpportunityHunter.prototype.displayDailyStats = function () {
        var totalCapitalDeployed = this.tradeLog
            .filter(function (t) { return t.status === 'SUCCESS'; })
            .reduce(function (sum, t) { return sum + t.position_size; }, 0);
        var totalProfitPotential = this.tradeLog
            .filter(function (t) { return t.status === 'SUCCESS'; })
            .reduce(function (sum, t) { return sum + t.estimated_return; }, 0);
        var successfulTrades = this.tradeLog.filter(function (t) { return t.status === 'SUCCESS'; }).length;
        var failedTrades = this.tradeLog.filter(function (t) { return t.status === 'FAILED'; }).length;
        var remainingBalance = this.initialBalance - totalCapitalDeployed;
        var avgProfitPerTrade = successfulTrades > 0 ? totalProfitPotential / successfulTrades : 0;
        console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════\n');
        console.log("\uD83D\uDCCA TODAY'S PERFORMANCE");
        console.log("   Trades executed: ".concat(successfulTrades, "/").concat(successfulTrades + failedTrades));
        console.log("   Capital deployed: $".concat(totalCapitalDeployed, "/$").concat(this.initialBalance));
        console.log("   Remaining capital: $".concat(remainingBalance));
        console.log("   Total profit potential: $".concat(totalProfitPotential));
        console.log("   Avg profit per trade: $".concat(avgProfitPerTrade.toFixed(2)));
        console.log("   Target: 15+ trades/day | Current: ".concat(successfulTrades, " ").concat(successfulTrades >= 15 ? '✅' : '⏳', "\n"));
    };
    return OpportunityHunter;
}());
// Main - Run continuously every 10 seconds
var autoExecute = process.env.AUTO_EXECUTE !== 'false';
var hunter = new OpportunityHunter(autoExecute);
(function () { return __awaiter(void 0, void 0, void 0, function () {
    var opportunities;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                console.log("\uD83C\uDFAF Starting Opportunity Hunter - Looking for 97%+ markets in last 10 minutes...");
                console.log("".concat(autoExecute ? '🚀 AUTO-EXECUTION ENABLED' : '👀 OBSERVATION MODE (no auto-execution)', "\n"));
                return [4 /*yield*/, hunter.huntLimitlessOpportunities()];
            case 1:
                opportunities = _a.sent();
                return [4 /*yield*/, hunter.executeAndDisplay(opportunities)];
            case 2:
                _a.sent();
                // Then every 10 seconds
                setInterval(function () { return __awaiter(void 0, void 0, void 0, function () {
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0: return [4 /*yield*/, hunter.huntLimitlessOpportunities()];
                            case 1:
                                opportunities = _a.sent();
                                return [4 /*yield*/, hunter.executeAndDisplay(opportunities)];
                            case 2:
                                _a.sent();
                                return [2 /*return*/];
                        }
                    });
                }); }, 10000); // Check every 10 seconds for faster response
                return [2 /*return*/];
        }
    });
}); })();
exports.default = OpportunityHunter;
