"use strict";
/**
 * Created by alex on 02.07.17.
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
require("source-map-support/register");
const Nicehash = require("nicehash");
const Debug = require("debug");
const util_1 = require("util");
const debug = Debug('nhbot:nicehash');
const util = require('util');
const DECREASE_ERROR_REGEXP = /.*:\s+(\d+)/;
const codeToName = ['Scrypt', 'SHA256', 'ScryptNf', 'X11', 'X13', 'Keccak', 'X15', 'Nist5', 'NeoScrypt', 'Lyra2RE',
    'WhirlpoolX', 'Qubit', 'Quark', 'Axiom', 'Lyra2REv2', 'ScryptJaneNf16', 'Blake256r8', 'Blake256r14',
    'Blake256r8vnl', 'Hodl', 'DaggerHashimoto', 'Decred', 'CryptoNight', 'Lbry', 'Equihash', 'Pascal', 'X11Gost', 'Sia',
    'Blake2s'];
class NiceHash {
    constructor(apiId, apiKey, countryCode, currencyCode) {
        this.countryCode = countryCode;
        this.currencyCode = currencyCode;
        this.nh = new Nicehash({ apiId, apiKey });
    }
    static processNHResponse(response) {
        if (response.body && response.body.result)
            return response.body.result;
    }
    static checkAPIVersion() {
        return __awaiter(this, void 0, void 0, function* () {
            const version = yield Nicehash.getApiVersion();
            if (!version || !version.body || !version.body.result)
                throw new Error('Error requesting version from NiceHash API');
            const apiVersion = version.body.result.api_version;
            if (apiVersion !== '1.2.6')
                throw new Error('API Version missmatch 1.2.6 !== ' + apiVersion);
        });
    }
    getBuyInfo() {
        return __awaiter(this, void 0, void 0, function* () {
            const buyInfo = NiceHash.processNHResponse(yield this.nh.getNeededBuyingInfo());
            const algoInfoRaw = buyInfo.algorithms.find((value) => value.name === codeToName[this.currencyCode]);
            const algoInfo = {
                downStep: parseFloat(algoInfoRaw.down_step),
                minSpeedLimit: parseFloat(algoInfoRaw.min_limit),
                minOrderBTCAmount: parseFloat(buyInfo.min_amount),
                staticBTCFee: parseFloat(buyInfo.static_fee)
            };
            debug('Algorithm info: ' + util.inspect(algoInfo, true, null, true));
            return algoInfo;
        });
    }
    fetchMarketplaceInfo() {
        return __awaiter(this, void 0, void 0, function* () {
            const result = NiceHash.processNHResponse(yield this.nh.getOrders(this.countryCode, this.currencyCode));
            if (result.error)
                throw new Error(result.error);
            const orders = result.orders;
            let workers = 0;
            let acceptedSpeed = 0;
            let fixedPriceAverage = 0;
            let standardPriceAverage = 0;
            let standardActivePriceAverage = 0;
            let standardActivePriceAmount = 0;
            let fixedOrderAmount = 0;
            let dead = 0;
            for (let i = 0; i < orders.length; i++) {
                const order = orders[i];
                if (!order.alive) {
                    dead++;
                    continue;
                }
                workers += order.workers;
                acceptedSpeed += parseFloat(order.accepted_speed);
                if (order.type === NiceHash.FIXED) {
                    fixedOrderAmount++;
                    fixedPriceAverage += parseFloat(order.price);
                }
                else {
                    standardPriceAverage += parseFloat(order.price);
                    if (parseFloat(order.accepted_speed) > 0) {
                        standardActivePriceAverage += parseFloat(order.price);
                        standardActivePriceAmount++;
                    }
                }
            }
            fixedPriceAverage /= fixedOrderAmount;
            standardPriceAverage /= orders.length - fixedOrderAmount - dead;
            standardActivePriceAverage /= standardActivePriceAmount;
            // console.log(orders.filter(order => order.alive).reduce((total, current) => total + parseFloat(current.price), 0) / (orders.length - dead);
            return {
                workers,
                acceptedSpeed,
                fixedPriceAverage,
                standardPriceAverage,
                standardActivePriceAverage,
                orderList: orders
                    .filter(order => order.alive)
                    .map(order => {
                    return {
                        id: order.id,
                        type: order.type,
                        price: parseFloat(order.price),
                        limitSpeed: parseFloat(order.limit_speed),
                        workers: order.workers,
                        acceptedSpeed: parseFloat(order.accepted_speed)
                    };
                })
                    .sort((a, b) => a.price < b.price ? 1 : (b.price < a.price ? -1 : 0))
            };
        });
    }
    getMyOrders() {
        return __awaiter(this, void 0, void 0, function* () {
            debug('Getting my orders');
            const result = NiceHash.processNHResponse(yield this.nh.getMyOrders(this.countryCode, this.currencyCode));
            if (result.error)
                throw new Error(result.error);
            const orders = result.orders;
            debug(`Got ${orders.length} own orders`);
            return orders.map(order => {
                return {
                    type: order.type,
                    btcAvail: parseFloat(order.btc_avail),
                    limitSpeed: parseFloat(order.limit_speed),
                    alive: order.alive,
                    workers: order.workers,
                    acceptedSpeed: parseFloat(order.accepted_speed),
                    id: order.id,
                    price: parseFloat(order.price),
                    btcPaid: parseFloat(order.btc_paid),
                    end: order.end // timestamp 861531024;
                };
            }).sort((a, b) => a.id < b.id ? -1 : (b.id < a.id ? 1 : 0));
        });
    }
    setPrice(myOrder, price) {
        return __awaiter(this, void 0, void 0, function* () {
            if (myOrder.price === price)
                return;
            debug(`Setting price ${price} for order id ${myOrder.id}`);
            const result = NiceHash.processNHResponse(yield this.nh.setOrderPrice({
                location: this.countryCode,
                algo: this.currencyCode,
                price,
                order: myOrder.id
            }));
            if (result.error)
                throw new Error(result.error);
            myOrder.price = price;
        });
    }
    setSpeedLimit(myOrder, limit) {
        return __awaiter(this, void 0, void 0, function* () {
            const buyInfo = yield this.getBuyInfo();
            if (limit >= buyInfo.minSpeedLimit) {
                debug(`Setting limit ${limit} for order id ${myOrder.id}`);
                const result = NiceHash.processNHResponse(yield this.nh.setOrderLimit({
                    location: this.countryCode,
                    algo: this.currencyCode,
                    order: myOrder.id,
                    limit
                }));
                if (result.error)
                    throw new Error(result.error);
                myOrder.limitSpeed = limit;
            }
        });
    }
    decreaseOrderPrice(myOrder) {
        return __awaiter(this, void 0, void 0, function* () {
            debug(`Decreasing price for order id ${myOrder.id}`);
            const buyInfo = yield this.getBuyInfo();
            const result = NiceHash.processNHResponse(yield this.nh.decreaseOrderPrice({
                location: this.countryCode,
                algo: this.currencyCode,
                order: myOrder.id
            }));
            if (result.error) {
                const match = DECREASE_ERROR_REGEXP.exec(result.error);
                if (!match || !match[1] || !util_1.isNumber(parseInt(match[1])))
                    throw new Error(`Error parsing error response [${result.error}]`);
                return parseInt(match[1]);
            }
            myOrder.price += buyInfo.downStep;
            return 0;
        });
    }
}
NiceHash.FIXED = 1;
NiceHash.STANDARD = 0;
exports.default = NiceHash;
//# sourceMappingURL=nicehash.js.map