"use strict";
// Limitless Trade Executor - Place bets on extreme odds markets
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
dotenv_1.default.config();
var LimitlessExecutor = /** @class */ (function () {
    function LimitlessExecutor() {
        this.limitlessUrl = 'https://api.limitless.exchange';
        this.limitlessKey = process.env.LIMITLESS_API_KEY;
    }
    LimitlessExecutor.prototype.placeMarketOrder = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var marketResponse, marketData, market, currentPrice, executionPrice, shares, orderResponse, orderData, e_1;
            var _a, _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        _d.trys.push([0, 5, , 6]);
                        return [4 /*yield*/, (0, node_fetch_1.default)("".concat(this.limitlessUrl, "/markets/").concat(params.market_id), {
                                headers: {
                                    'X-API-Key': this.limitlessKey,
                                    'Content-Type': 'application/json',
                                },
                            })];
                    case 1:
                        marketResponse = _d.sent();
                        if (!marketResponse.ok) {
                            return [2 /*return*/, {
                                    success: false,
                                    error: "Failed to fetch market data: ".concat(marketResponse.status),
                                }];
                        }
                        return [4 /*yield*/, marketResponse.json()];
                    case 2:
                        marketData = (_d.sent());
                        market = marketData.data;
                        if (!market) {
                            return [2 /*return*/, {
                                    success: false,
                                    error: 'Market not found',
                                }];
                        }
                        currentPrice = params.side === 'YES' ? market.prices[0] : market.prices[1];
                        executionPrice = params.limit_price || currentPrice;
                        shares = params.position_size / executionPrice;
                        return [4 /*yield*/, (0, node_fetch_1.default)("".concat(this.limitlessUrl, "/orders/place"), {
                                method: 'POST',
                                headers: {
                                    'X-API-Key': this.limitlessKey,
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                    market_id: params.market_id,
                                    side: params.side,
                                    amount: shares,
                                    limit_price: executionPrice,
                                    order_type: 'MARKET',
                                }),
                            })];
                    case 3:
                        orderResponse = _d.sent();
                        if (!orderResponse.ok) {
                            return [2 /*return*/, {
                                    success: false,
                                    error: "Order placement failed: ".concat(orderResponse.status),
                                }];
                        }
                        return [4 /*yield*/, orderResponse.json()];
                    case 4:
                        orderData = (_d.sent());
                        return [2 /*return*/, {
                                success: true,
                                trade_id: ((_a = orderData.data) === null || _a === void 0 ? void 0 : _a.trade_id) || ((_b = orderData.data) === null || _b === void 0 ? void 0 : _b.id),
                                order_id: (_c = orderData.data) === null || _c === void 0 ? void 0 : _c.order_id,
                                filled_amount: shares,
                                average_price: executionPrice,
                                total_cost: params.position_size,
                            }];
                    case 5:
                        e_1 = _d.sent();
                        return [2 /*return*/, {
                                success: false,
                                error: "Exception: ".concat(e_1.message),
                            }];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    LimitlessExecutor.prototype.closePosition = function (market_id, position_id, side) {
        return __awaiter(this, void 0, void 0, function () {
            var exitSide, response, data, e_2;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _c.trys.push([0, 3, , 4]);
                        exitSide = side === 'YES' ? 'NO' : 'YES';
                        return [4 /*yield*/, (0, node_fetch_1.default)("".concat(this.limitlessUrl, "/orders/place"), {
                                method: 'POST',
                                headers: {
                                    'X-API-Key': this.limitlessKey,
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                    market_id: market_id,
                                    side: exitSide,
                                    close_position: position_id,
                                    order_type: 'MARKET',
                                }),
                            })];
                    case 1:
                        response = _c.sent();
                        if (!response.ok) {
                            return [2 /*return*/, {
                                    success: false,
                                    error: "Close failed: ".concat(response.status),
                                }];
                        }
                        return [4 /*yield*/, response.json()];
                    case 2:
                        data = (_c.sent());
                        return [2 /*return*/, {
                                success: true,
                                trade_id: (_a = data.data) === null || _a === void 0 ? void 0 : _a.trade_id,
                                order_id: (_b = data.data) === null || _b === void 0 ? void 0 : _b.order_id,
                            }];
                    case 3:
                        e_2 = _c.sent();
                        return [2 /*return*/, {
                                success: false,
                                error: "Exception: ".concat(e_2.message),
                            }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    LimitlessExecutor.prototype.executeGrassMarket = function (market_id_1, side_1, probability_1) {
        return __awaiter(this, arguments, void 0, function (market_id, side, probability, position_size) {
            var result;
            var _a, _b;
            if (position_size === void 0) { position_size = 500; }
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        console.log("\n\uD83D\uDD28 HAMMERING: ".concat(market_id, " | Side: ").concat(side, " | Prob: ").concat((probability * 100).toFixed(1), "% | Capital: $").concat(position_size));
                        return [4 /*yield*/, this.placeMarketOrder({
                                market_id: market_id,
                                side: side,
                                position_size: position_size,
                            })];
                    case 1:
                        result = _c.sent();
                        if (result.success) {
                            console.log("\u2705 EXECUTED: Trade #".concat(result.trade_id, " | Filled: ").concat((_a = result.filled_amount) === null || _a === void 0 ? void 0 : _a.toFixed(4), " shares @ ").concat((_b = result.average_price) === null || _b === void 0 ? void 0 : _b.toFixed(4)));
                            console.log("   Est. profit if correct: $".concat(((probability - 1) * position_size + position_size).toFixed(2)));
                        }
                        else {
                            console.log("\u274C FAILED: ".concat(result.error));
                        }
                        return [2 /*return*/, result];
                }
            });
        });
    };
    LimitlessExecutor.prototype.getPortfolio = function () {
        return __awaiter(this, void 0, void 0, function () {
            var response, e_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, (0, node_fetch_1.default)("".concat(this.limitlessUrl, "/portfolio"), {
                                headers: {
                                    'X-API-Key': this.limitlessKey,
                                    'Content-Type': 'application/json',
                                },
                            })];
                    case 1:
                        response = _a.sent();
                        if (!response.ok) {
                            return [2 /*return*/, { error: "Failed to fetch portfolio: ".concat(response.status) }];
                        }
                        return [4 /*yield*/, response.json()];
                    case 2: return [2 /*return*/, _a.sent()];
                    case 3:
                        e_3 = _a.sent();
                        return [2 /*return*/, { error: e_3.message }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    LimitlessExecutor.prototype.getBalance = function () {
        return __awaiter(this, void 0, void 0, function () {
            var portfolio, e_4;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.getPortfolio()];
                    case 1:
                        portfolio = _b.sent();
                        return [2 /*return*/, ((_a = portfolio.data) === null || _a === void 0 ? void 0 : _a.cash_balance) || 0];
                    case 2:
                        e_4 = _b.sent();
                        console.error('Error fetching balance:', e_4.message);
                        return [2 /*return*/, 0];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    return LimitlessExecutor;
}());
// Example usage
var executor = new LimitlessExecutor();
(function () { return __awaiter(void 0, void 0, void 0, function () {
    var balance;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, executor.getBalance()];
            case 1:
                balance = _a.sent();
                console.log("\n\uD83D\uDCB0 Current balance: $".concat(balance.toFixed(2)));
                // Example: Execute a grass market
                // const result = await executor.executeGrassMarket(
                //   'market_abc123',
                //   'YES',
                //   0.978,
                //   500
                // );
                console.log('\n⚠️  Executor ready. Call executeGrassMarket() to place trades on mow-the-grass opportunities.');
                return [2 /*return*/];
        }
    });
}); })();
exports.default = LimitlessExecutor;
