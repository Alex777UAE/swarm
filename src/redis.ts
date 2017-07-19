/**
 * Created by alex on 12.07.17.
 */

import 'source-map-support/register';
import * as fs from 'fs';
import * as util from 'util';
import * as crypto from 'crypto';
import * as IORedis from 'ioredis';
import {DBStats, IDBLayer} from "../interfaces/i_db_layer";
import {IMinerConfig, IMinerList} from "../interfaces/i_miner";
import {ICoinConfig, ICoinList} from "../interfaces/i_coin";
import {IGPUConfigList, PerAlgorithmGPUConfig} from "../interfaces/i_gpu";

const debug = require('debug')('miner:redis');
const readFile = util.promisify(fs.readFile);

const REDIS_PREFIX = 'miner:';

interface RedisOptions {
    host: string;
    port: number;
    myName: string;
    onCoinUpdate?: (coinName: string, config: ICoinConfig) => void,
    onGPUUpdate?: (gpuUUIDOrModel: string, config: PerAlgorithmGPUConfig) => void,
    onMinerUpdate?: (minerName: string, config: IMinerConfig, binary: Buffer) => void,
    onCurrentCoinUpdate?: (coinName: string) => void,
    onCommand?: (command: string, options?: string) => void;
}

export class Redis extends IDBLayer {
    protected redis: IORedis.Redis;
    protected redisSubscriber: IORedis.Redis;
    protected ready: boolean = false;

    constructor(private options: RedisOptions) {
        super();
        this.redis = new IORedis(this.options.port, this.options.host);
        this.redis.on('connect', () => this.ready = true);
        if (this.options.onCoinUpdate || this.options.onMinerUpdate || this.options.onCurrentCoinUpdate ||
            this.options.onCommand || this.options.onGPUUpdate) {
            this.redisSubscriber = new IORedis(this.options.port, this.options.host);
            debug('subscribing');
            if (this.options.onCommand) {
                this.redisSubscriber.psubscribe('command.*');
                this.redisSubscriber.on('pmessage', (pattern ,ch, msg) => {
                    if (ch.indexOf('command') === 0) {
                        const {hostname, params} = JSON.parse(msg);
                        const fn = this.options.onCommand;
                        if (!hostname || hostname === this.options.myName && fn) fn(ch, params);
                    }
                });
            }
            this.redisSubscriber.subscribe('coins', 'miners', 'switch');
            this.redisSubscriber.on('message', (ch, msg) => {
                try {
                    if (ch === 'coins') {
                        const fn = this.options.onCoinUpdate;
                        const {name, config} = JSON.parse(msg);
                        debug(`Coin ${name} update:\n${config}`);
                        if (typeof fn === 'function') fn(name, config);
                    }

                    if (ch === 'gpus') {
                        const fn = this.options.onGPUUpdate;
                        const {name, config} = JSON.parse(msg);
                        debug(`GPU ${name} update:\n${config}`);
                        if (typeof fn === 'function') fn(name, config);
                    }

                    if (ch === 'miners') {
                        const {name, config} = JSON.parse(msg);
                        const fn = this.options.onMinerUpdate;
                        debug(`Miner ${name} update:\n${config}`);
                        if (typeof fn === 'function') {
                            this.getMinerBinnary((config as IMinerConfig).sha256sum)
                                .then(buff => fn(name, config, buff))
                                .catch(err => debug(`Error: ${err}`));
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

    public async getAllCoins(): Promise<ICoinList> {
        const rawData = await this.redis.hgetall(REDIS_PREFIX + 'coins');
        const coinList: ICoinList = {};
        Object.keys(rawData).forEach(coin => {
               coinList[coin] = JSON.parse(rawData[coin]);
        });
        return coinList;
    }

    public async getAllMiners(): Promise<IMinerList> {
        const rawData = await this.redis.hgetall(REDIS_PREFIX + 'miners');
        const minerList: IMinerList = {};
        Object.keys(rawData).forEach(miner => {
            minerList[miner] = JSON.parse(rawData[miner]);
        });
        return minerList;
    }

    public async getAllGPUConfigs(): Promise<IGPUConfigList> {
        const rawData = await this.redis.hgetall(REDIS_PREFIX + 'gpus');
        const gpuConfigList: IGPUConfigList = {};

        Object.keys(rawData).forEach(gpu => {
            gpuConfigList[gpu] = JSON.parse(rawData[gpu]);
        });
        return gpuConfigList;
    }

    public async getMinerBinnary(sha256sum: string): Promise<Buffer> {
        return await this.redis.getBuffer(REDIS_PREFIX + sha256sum);
    }

    public async getCurrentCoin(): Promise<string> {
        const coinData = await this.redis.hgetall(REDIS_PREFIX + 'currentCoin');
        return coinData[this.options.myName] ? coinData[this.options.myName] : coinData['default'];
    }

    public async updateCoin(name: string, config: ICoinConfig): Promise<void> {
        await this.redis.hset(REDIS_PREFIX + 'coins', name, JSON.stringify(config));
        await this.redis.publish('coins', JSON.stringify({name, config}));
    }

    public async updateGPU(modelOrUUID: string, config: PerAlgorithmGPUConfig): Promise<void> {
        await this.redis.hset(REDIS_PREFIX + 'gpus', modelOrUUID, JSON.stringify(config));
        await this.redis.publish('gpus', JSON.stringify({modelOrUUID, config}));
    }

    public async updateMiner(name: string, config: IMinerConfig, binaryPath?: string): Promise<void> {
        const current: IMinerConfig = JSON.parse(await this.redis.hget(REDIS_PREFIX + 'miners', name));
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
        if (name === 'default' && (!nodes || nodes.length === 0)) throw new Error(`Can't reset without nodes argument`);
        const availableCoins = await this.getAllCoins();
        if (name !== 'default' && Object.keys(availableCoins).indexOf(name) === -1)
            throw new Error(`No coin ${name} available in swarm`);

        if (!nodes || nodes.length === 0) {
            await this.redis.hset(REDIS_PREFIX + 'currentCoin', 'default', name);
            await this.redis.publish('switch', JSON.stringify({hostname: 'all', coinName: name}));
        } else if (name === 'default') {
            const currentCoinName = await this.redis.hget(REDIS_PREFIX + 'currentCoin', 'default');
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                await this.redis.hdel(REDIS_PREFIX + 'currentCoin', node);
                await this.redis.publish('switch', JSON.stringify({hostname: node, coinName: currentCoinName}));
            }
        } else {
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                await this.redis.hset(REDIS_PREFIX + 'currentCoin', node, name);
                await this.redis.publish('switch', JSON.stringify({hostname: node, coinName: name}));
            }
        }
    }

    public async updateStats(stringifiedJson: string): Promise<void> {
        await this.redis.hset(REDIS_PREFIX + 'stats', this.options.myName, JSON.stringify({
            json: stringifiedJson,
            timestamp: Date.now()
        }));
    }

    public async getStats(): Promise<DBStats> {
        const rawData = await this.redis.hgetall(REDIS_PREFIX + 'stats');
        const dbStats: DBStats = {};
        Object.keys(rawData).forEach(name => {
            dbStats[name] = JSON.parse(rawData[name]);
            // dbStats[name].json = JSON.parse(dbStats[name].json);
        });
        return dbStats;
    }

    public async removeDeadNode(name: string): Promise<void> {
        await this.redis.hdel(REDIS_PREFIX + 'stats', name);
        if (name !== 'default') await this.redis.hdel(REDIS_PREFIX + 'currentCoin', name);
    }

    public async command(command: string, params: string = '', hostname: string = ''): Promise<void> {
        if (this.ready) {
            await this.redis.publish(`command.${command}`, JSON.stringify({params, hostname}));
            debug(`Command ${command} with params ${params} sent`);
        } else {
            return new Promise((resolve, reject) => {
                this.redis.on('ready', () => {
                    const msg = JSON.stringify({params, hostname});
                    this.redis.publish(`command.${command}`, msg, (err) => {
                        if (err) throw reject(err);
                        debug(`Command ${command} with params ${msg} sent`);
                        resolve();
                    });
                });
                this.redis.on('error', reject);
            }) as Promise<any>;

        }

    }

    public async coinExists(name: string): Promise<boolean> {
        return !!await this.redis.hget(REDIS_PREFIX + 'coins', name);
    }
}