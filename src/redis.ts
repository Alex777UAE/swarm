/**
 * Created by alex on 12.07.17.
 */

import * as fs from 'fs';
import * as util from 'util';
import * as crypto from 'crypto';
import * as IORedis from 'ioredis';
import {DBStats, IDBLayer} from "../interfaces/i_db_layer";

const debug = require('debug')('miner:redis');
const readFile = util.promisify(fs.readFile);

const REDIS_PREFIX = 'miner:';

interface RedisOptions {
    host: string;
    port: number;
    myName: string;
    onCoinUpdate?: (coinName: string, config: Units.ICoinConfig) => void,
    onMinerUpdate?: (minerName: string, config: Units.IMinerConfig, binary: Buffer) => void,
    onCurrentCoinUpdate?: (coinName: string) => void,
}

export class Redis extends IDBLayer {
    protected redis: IORedis.Redis;
    protected redisSubscriber: IORedis.Redis;

    constructor(private options: RedisOptions) {
        super();
        this.redis = new IORedis(this.options.port, this.options.host);
        if (this.options.onCoinUpdate || this.options.onMinerUpdate || this.options.onCurrentCoinUpdate) {
            this.redisSubscriber = new IORedis(this.options.port, this.options.host);
            debug('subscribing');
            this.redisSubscriber.subscribe('coins', 'miners', 'switch');
            this.redisSubscriber.on('message', (ch, msg) => {
                try {
                    if (ch === 'coins') {
                        const fn = this.options.onCoinUpdate;
                        const {name, config} = JSON.parse(msg);
                        debug(`Coin ${name} update:\n${config}`);
                        if (typeof fn === 'function') fn(name, config);
                    }

                    if (ch === 'miners') {
                        const {name, config} = JSON.parse(msg);
                        const fn = this.options.onMinerUpdate;
                        debug(`Miner ${name} update:\n${config}`);
                        if (typeof fn === 'function') {
                            this.redis.getBuffer((config as Units.IMinerConfig).sha256sum, (err, buff) => {
                                if (err) return debug(`Error: ${err}`);
                                fn(name, config, buff);
                            });
                        }
                    }

                    if (ch === 'switch') {
                        const {hostname, coinName} = JSON.parse(msg);
                        const fn = this.options.onCurrentCoinUpdate;
                        debug(`Current coin switched to ${coinName} for: ${hostname}`);
                        if (hostname === this.options.myName || hostname === 'all' && typeof fn === 'function') {
                            debug(`Switching current coin to ${coinName}`);
                            fn(coinName);
                        }
                    }
                } catch (err) {
                    debug(err);
                }
            })
        }
    }

    public async getAllCoins(): Promise<Units.ICoinList> {
        const rawData = await this.redis.hgetall(REDIS_PREFIX + 'coins');
        const coinList: Units.ICoinList = {};
        Object.keys(rawData).forEach(coin => {
               coinList[coin] = JSON.parse(rawData[coin]);
        });
        return coinList;
    }

    public async getAllMiners(): Promise<Units.IMinerList> {
        const rawData = await this.redis.hgetall(REDIS_PREFIX + 'miners');
        const minerList: Units.IMinerList = {};
        Object.keys(rawData).forEach(miner => {
            minerList[miner] = JSON.parse(rawData[miner]);
        });
        return minerList;
    }

    public async getMinerBinnary(sha256sum: string): Promise<Buffer> {
        return await this.redis.getBuffer(REDIS_PREFIX + sha256sum);
    }

    public async getCurrentCoin(): Promise<string> {
        const coinData = await this.redis.hgetall(REDIS_PREFIX + 'currentCoin');
        return coinData[this.options.myName] ? coinData[this.options.myName] : coinData['default'];
    }

    public async updateCoin(name: string, config: Units.ICoinConfig): Promise<void> {
        await this.redis.hset(REDIS_PREFIX + 'coins', name, JSON.stringify(config));
        await this.redis.publish('coins', JSON.stringify({name, config}));
    }

    public async updateMiner(name: string, config: Units.IMinerConfig, binaryPath?: string): Promise<void> {
        const current: Units.IMinerConfig = JSON.parse(await this.redis.hget(REDIS_PREFIX + 'miners', name));
        if (!current && !binaryPath) throw new Error(`Can't go for a new miner without it's binary`);

        const binary = await readFile(binaryPath);
        config.sha256sum = crypto.createHash('sha256').update(binary).digest('hex');
        if (!current || current.sha256sum !== config.sha256sum) {
            await this.redis.set(REDIS_PREFIX + config.sha256sum, binary);
            if (current) await this.redis.del(REDIS_PREFIX + current.sha256sum);
        }
        await this.redis.hset(REDIS_PREFIX + 'miners', name, JSON.stringify(config));
        await this.redis.publish('miners', JSON.stringify({name, config}));
    }

    public async setCurrentCoin(name: string, nodes?: string[]): Promise<void> {
        if (name === 'default' && (!nodes || nodes.length === 0)) throw new Error(`can't reset without nodes argument`);
        if (!nodes || nodes.length === 0) {
            await this.redis.hset(REDIS_PREFIX + 'currentCoin', 'default', name);
            await this.redis.publish('switch', JSON.stringify({hostname: 'all', coinName: name}));
        } else {
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                await this.redis.hset(REDIS_PREFIX + 'currentCoin', node, name);
                await this.redis.publish('switch', JSON.stringify({hostname: node, coinName: name}));
            }
        }
    }

    public async updateStats(stringifiedJson: string): Promise<void> {
        await this.redis.hset(REDIS_PREFIX + 'stats', this.options.myName, {
            json: stringifiedJson,
            timestamp: Date.now()
        });
    }

    public async getStats(): Promise<DBStats> {
        const rawData = await this.redis.hgetall(REDIS_PREFIX + 'stats');
        const dbStats: DBStats = {};

        Object.keys(rawData).forEach(name => {
            dbStats[name] = JSON.parse(rawData[name]);
        });

        return dbStats;
    }

    public async removeDeadNode(name: string): Promise<void> {
        await this.redis.hdel(REDIS_PREFIX + 'stats', name);
    }
}