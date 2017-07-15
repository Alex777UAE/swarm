/**
 * Created by alex on 02.07.17.
 */

import 'source-map-support/register';
import * as Nicehash from 'nicehash';
import * as Debug from 'debug';
import {isNumber} from "util";

const debug = Debug('nhbot:nicehash');
const util = require('util');

const DECREASE_ERROR_REGEXP = /.*:\s+(\d+)/;

export interface BuyInfo {
    algorithms: {
        down_step: string; // signed number '-0.0100'
        min_diff_working: string; // '512'
        min_limit: string; // '0.01'
        speed_text: string; // 'GH' , 'TH'
        min_diff_initial: string; // '15'
        name: string; // 'NeoScrypt'
        algo: number; // 8
        multi: string; // 1
    }[];
    down_time: number;
    static_fee: string;
    min_amount: string;
    dynamic_fee: string;
}

export interface AlgoInfo {
    downStep: number; // signed number '-0.0100'
    minSpeedLimit: number; // '0.01'
    minOrderBTCAmount: number;
    staticBTCFee: number;
}

export interface OrderInfo {
    type: number; // 1 - fixed, 0 - standard;
    id: number; // 5877;
    price: string; // "0.0505";
    algo: number; // 1;
    alive: boolean; // true;
    limit_speed: string; // "1.0";
    workers: number; // 0;
    accepted_speed: string; // "0.019213"
}

export interface Order {
    id: number; // 5877;
    type: number; // 1 for fixed, 0 for standard
    price: number; // 0.0505;
    limitSpeed: number; // 0.02;
    workers: number; // 0;
    acceptedSpeed: number; // 0.019213
}

export interface MyOrderInfo {
    type: number; // 1 - fixed, 0 - standard
    btc_avail: string; // "0.01751439";
    limit_speed: string; // "0.0"
    pool_user: string; // "worker",
    pool_port: number; // 3333;
    alive: boolean; // false;
    workers: number; // 0;
    pool_pass: string; // "x";
    accepted_speed: string; // '0.0';
    id: number; // 1879;
    algo: number; // 0;
    price: string; // "1.0000";
    btc_paid: string; // "0.00000000";
    pool_host: string; // "testpool.com";
    end: number; // timestamp range 1413294447421;
}

export interface MyOrder {
    type: number; // 1 - fixed, 0 - standard
    btcAvail: number; // 0.01751439;
    limitSpeed: number; // 0.0
    alive: boolean; // false;
    workers: number; // 0;
    acceptedSpeed: number; // 0.0;
    id: number; // 3221467,;
    price: number; // 1.2315',;
    btcPaid: number; // 0.00123953';
    end: number; // timestamp range 861531024;
}

export interface MarketPlace {
    workers: number;
    acceptedSpeed: number;
    fixedPriceAverage: number;
    standardPriceAverage: number;
    standardActivePriceAverage: number;
    orderList: Order[];
}

const codeToName = ['Scrypt', 'SHA256', 'ScryptNf', 'X11', 'X13', 'Keccak', 'X15', 'Nist5', 'NeoScrypt', 'Lyra2RE',
    'WhirlpoolX', 'Qubit', 'Quark', 'Axiom', 'Lyra2REv2', 'ScryptJaneNf16', 'Blake256r8', 'Blake256r14',
    'Blake256r8vnl', 'Hodl', 'DaggerHashimoto', 'Decred', 'CryptoNight', 'Lbry', 'Equihash', 'Pascal', 'X11Gost', 'Sia',
    'Blake2s'];


export default class NiceHash {
    protected nh: any;

    public static FIXED = 1;
    public static STANDARD = 0;

    constructor(apiId: number,
                apiKey: string,
                protected countryCode: number,
                protected currencyCode: number) {
        this.nh = new Nicehash({apiId, apiKey});
    }

    protected static processNHResponse(response: any): any {
        if (response.body && response.body.result) return response.body.result;
    }

    public static async checkAPIVersion(): Promise<void> {
        const version = await Nicehash.getApiVersion();
        if (!version || !version.body || !version.body.result)
            throw new Error('Error requesting version from NiceHash API');
        const apiVersion = version.body.result.api_version;
        if (apiVersion !== '1.2.6') throw new Error('API Version missmatch 1.2.6 !== ' + apiVersion);
    }

    public async getBuyInfo(): Promise<AlgoInfo> {
        const buyInfo: BuyInfo = NiceHash.processNHResponse(await this.nh.getNeededBuyingInfo());
        const algoInfoRaw = buyInfo.algorithms.find((value) => value.name === codeToName[this.currencyCode]);

        const algoInfo = {
            downStep: parseFloat(algoInfoRaw.down_step), // signed number '-0.0100'
            minSpeedLimit: parseFloat(algoInfoRaw.min_limit), // '0.01'
            minOrderBTCAmount: parseFloat(buyInfo.min_amount),
            staticBTCFee: parseFloat(buyInfo.static_fee)
        };
        debug('Algorithm info: ' + util.inspect(algoInfo, true, null, true));
        return algoInfo;

    }

    public async fetchMarketplaceInfo(): Promise<MarketPlace> {
        const result = NiceHash.processNHResponse(await this.nh.getOrders(this.countryCode, this.currencyCode));
        if (result.error) throw new Error(result.error);
        const orders: OrderInfo[] = result.orders;
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
            } else {
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
        }
    }

    public async getMyOrders(): Promise<MyOrder[]> {
        debug('Getting my orders');
        const result = NiceHash.processNHResponse(await this.nh.getMyOrders(this.countryCode, this.currencyCode));
        if (result.error) throw new Error(result.error);
        const orders: MyOrderInfo[] = result.orders;
        debug(`Got ${orders.length} own orders`);
        return orders.map(order => {
            return {
                type: order.type, // 1 - fixed, 0 - standard
                btcAvail: parseFloat(order.btc_avail), // 0.01751439,
                limitSpeed: parseFloat(order.limit_speed), // 0.0
                alive: order.alive, // false,
                workers: order.workers, // 0,
                acceptedSpeed: parseFloat(order.accepted_speed), // 0.0,
                id: order.id, // 3221467,,
                price: parseFloat(order.price), // 1.2315,
                btcPaid: parseFloat(order.btc_paid), // 0.00123953',
                end: order.end // timestamp 861531024;
            }
        }).sort((a, b) => a.id < b.id ? -1 : (b.id < a.id ? 1 : 0))
    }

    public async setPrice(myOrder: MyOrder, price: number): Promise<void> {
        if (myOrder.price === price) return;
        debug(`Setting price ${price} for order id ${myOrder.id}`);
        const result = NiceHash.processNHResponse(await this.nh.setOrderPrice({
            location: this.countryCode,
            algo: this.currencyCode,
            price,
            order: myOrder.id
        }));
        if (result.error) throw new Error(result.error);
        myOrder.price = price;
    }

    public async setSpeedLimit(myOrder: MyOrder, limit: number): Promise<void> {
        const buyInfo = await this.getBuyInfo();
        if (limit >= buyInfo.minSpeedLimit) {
            debug(`Setting limit ${limit} for order id ${myOrder.id}`);
            const result = NiceHash.processNHResponse(await this.nh.setOrderLimit({
                location: this.countryCode,
                algo: this.currencyCode,
                order: myOrder.id,
                limit
            }));
            if (result.error) throw new Error(result.error);
            myOrder.limitSpeed = limit;
        }
    }

    public async decreaseOrderPrice(myOrder: MyOrder): Promise<number> {
        debug(`Decreasing price for order id ${myOrder.id}`);
        const buyInfo = await this.getBuyInfo();
        const result = NiceHash.processNHResponse(await this.nh.decreaseOrderPrice({
            location: this.countryCode,
            algo: this.currencyCode,
            order: myOrder.id
        }));
        if (result.error) {
            const match = DECREASE_ERROR_REGEXP.exec(result.error);
            if (!match || !match[1] || !isNumber(parseInt(match[1])))
                throw new Error(`Error parsing error response [${result.error}]`);
            return parseInt(match[1]);
        }
        myOrder.price += buyInfo.downStep;
        return 0;
    }

}