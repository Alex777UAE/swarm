"use strict";
/**
 * Created by alex on 12.07.17.
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
const fs = require("fs");
const util = require("util");
const crypto = require("crypto");
const IORedis = require("ioredis");
const i_db_layer_1 = require("../interfaces/i_db_layer");
const util_1 = require("util");
const debug = require('debug')('miner:redis');
const readFile = util.promisify(fs.readFile);
const REDIS_PREFIX = 'miner:';
class Redis extends i_db_layer_1.IDBLayer {
    constructor(options) {
        super();
        this.options = options;
        this.ready = false;
        this.redis = new IORedis(this.options.port, this.options.host);
        this.redis.on('connect', () => this.ready = true);
        if (this.options.onCoinUpdate || this.options.onMinerUpdate || this.options.onCurrentCoinUpdate ||
            this.options.onCommand || this.options.onGPUUpdate) {
            this.redisSubscriber = new IORedis(this.options.port, this.options.host);
            debug('subscribing');
            if (this.options.onCommand) {
                this.redisSubscriber.psubscribe('command.*');
                this.redisSubscriber.on('pmessage', (pattern, ch, msg) => {
                    if (ch.indexOf('command') === 0) {
                        const { hostname, params } = JSON.parse(msg);
                        const fn = this.options.onCommand;
                        if (!hostname || hostname === this.options.myName && fn)
                            fn(ch, params);
                    }
                });
            }
            this.redisSubscriber.subscribe('coins', 'miners', 'switch', 'gpus');
            this.redisSubscriber.on('message', (ch, msg) => {
                try {
                    if (ch === 'coins') {
                        const fn = this.options.onCoinUpdate;
                        const { name, config } = JSON.parse(msg);
                        debug(`Coin ${name} update:\n${config}`);
                        if (typeof fn === 'function')
                            fn(name, config);
                    }
                    if (ch === 'gpus') {
                        const fn = this.options.onGPUUpdate;
                        const { modelOrUUID, config } = JSON.parse(msg);
                        debug(`GPU ${modelOrUUID} update:\n${config}`);
                        if (typeof fn === 'function')
                            fn(modelOrUUID, config);
                    }
                    if (ch === 'miners') {
                        const { name, config } = JSON.parse(msg);
                        const fn = this.options.onMinerUpdate;
                        debug(`Miner ${name} update:\n${config}`);
                        if (typeof fn === 'function') {
                            this.getMinerBinnary(config.sha256sum)
                                .then(buff => fn(name, config, buff))
                                .catch(err => debug(`Error: ${err}`));
                        }
                    }
                    if (ch === 'switch') {
                        const { hostname, coinName, except } = JSON.parse(msg);
                        const fn = this.options.onCurrentCoinUpdate;
                        debug(`Current coin switched to ${coinName} for: ${hostname}`);
                        if (util_1.isArray(except) && except.indexOf(this.options.myName) !== -1)
                            return;
                        if (hostname === this.options.myName || hostname === 'all' && typeof fn === 'function') {
                            debug(`Switching current coin to ${coinName}`);
                            fn(coinName);
                        }
                    }
                }
                catch (err) {
                    debug(err);
                }
            });
        }
    }
    getAllCoins() {
        return __awaiter(this, void 0, void 0, function* () {
            const rawData = yield this.redis.hgetall(REDIS_PREFIX + 'coins');
            const coinList = {};
            Object.keys(rawData).forEach(coin => {
                coinList[coin] = JSON.parse(rawData[coin]);
            });
            return coinList;
        });
    }
    getAllMiners() {
        return __awaiter(this, void 0, void 0, function* () {
            const rawData = yield this.redis.hgetall(REDIS_PREFIX + 'miners');
            const minerList = {};
            Object.keys(rawData).forEach(miner => {
                minerList[miner] = JSON.parse(rawData[miner]);
            });
            return minerList;
        });
    }
    getAllGPUConfigs() {
        return __awaiter(this, void 0, void 0, function* () {
            const rawData = yield this.redis.hgetall(REDIS_PREFIX + 'gpus');
            const gpuConfigList = {};
            Object.keys(rawData).forEach(gpu => {
                gpuConfigList[gpu] = JSON.parse(rawData[gpu]);
            });
            return gpuConfigList;
        });
    }
    getMinerBinnary(sha256sum) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.redis.getBuffer(REDIS_PREFIX + sha256sum);
        });
    }
    getCurrentCoin() {
        return __awaiter(this, void 0, void 0, function* () {
            const coinData = yield this.redis.hgetall(REDIS_PREFIX + 'currentCoin');
            return coinData[this.options.myName] ? coinData[this.options.myName] : coinData['default'];
        });
    }
    updateCoin(name, config) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.redis.hset(REDIS_PREFIX + 'coins', name, JSON.stringify(config));
            yield this.redis.publish('coins', JSON.stringify({ name, config }));
        });
    }
    updateGPU(modelOrUUID, config) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.redis.hset(REDIS_PREFIX + 'gpus', modelOrUUID, JSON.stringify(config));
            yield this.redis.publish('gpus', JSON.stringify({ modelOrUUID, config }));
        });
    }
    updateMiner(name, config, binaryPath) {
        return __awaiter(this, void 0, void 0, function* () {
            const current = JSON.parse(yield this.redis.hget(REDIS_PREFIX + 'miners', name));
            if (!current && !binaryPath)
                throw new Error(`Can't go for a new miner without it's binary`);
            const binary = yield readFile(binaryPath);
            config.sha256sum = crypto.createHash('sha256').update(binary).digest('hex');
            if (!current || current.sha256sum !== config.sha256sum) {
                yield this.redis.set(REDIS_PREFIX + config.sha256sum, binary);
                if (current)
                    yield this.redis.del(REDIS_PREFIX + current.sha256sum);
            }
            yield this.redis.hset(REDIS_PREFIX + 'miners', name, JSON.stringify(config));
            yield this.redis.publish('miners', JSON.stringify({ name, config }));
        });
    }
    setCurrentCoin(name, nodes) {
        return __awaiter(this, void 0, void 0, function* () {
            if (name === 'default' && (!nodes || nodes.length === 0))
                throw new Error(`Can't reset without nodes argument`);
            const availableCoins = yield this.getAllCoins();
            if (name !== 'default' && Object.keys(availableCoins).indexOf(name) === -1)
                throw new Error(`No coin ${name} available in swarm`);
            if (!nodes || nodes.length === 0) {
                yield this.redis.hset(REDIS_PREFIX + 'currentCoin', 'default', name);
                const except = Object.keys(yield this.redis.hgetall(REDIS_PREFIX + 'currentCoin'))
                    .filter(name => name !== 'default');
                yield this.redis.publish('switch', JSON.stringify({ hostname: 'all', except, coinName: name }));
            }
            else if (name === 'default') {
                const currentCoinName = yield this.redis.hget(REDIS_PREFIX + 'currentCoin', 'default');
                for (let i = 0; i < nodes.length; i++) {
                    const node = nodes[i];
                    yield this.redis.hdel(REDIS_PREFIX + 'currentCoin', node);
                    yield this.redis.publish('switch', JSON.stringify({ hostname: node, coinName: currentCoinName }));
                }
            }
            else {
                for (let i = 0; i < nodes.length; i++) {
                    const node = nodes[i];
                    yield this.redis.hset(REDIS_PREFIX + 'currentCoin', node, name);
                    yield this.redis.publish('switch', JSON.stringify({ hostname: node, coinName: name }));
                }
            }
        });
    }
    updateStats(stringifiedJson) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.redis.hset(REDIS_PREFIX + 'stats', this.options.myName, JSON.stringify({
                json: stringifiedJson,
                timestamp: Date.now()
            }));
        });
    }
    getStats() {
        return __awaiter(this, void 0, void 0, function* () {
            const rawData = yield this.redis.hgetall(REDIS_PREFIX + 'stats');
            const dbStats = {};
            Object.keys(rawData).forEach(name => {
                dbStats[name] = JSON.parse(rawData[name]);
                // dbStats[name].json = JSON.parse(dbStats[name].json);
            });
            return dbStats;
        });
    }
    removeDeadNode(name) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.redis.hdel(REDIS_PREFIX + 'stats', name);
            if (name !== 'default')
                yield this.redis.hdel(REDIS_PREFIX + 'currentCoin', name);
        });
    }
    command(command, params = '', hostname = '') {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.ready) {
                yield this.redis.publish(`command.${command}`, JSON.stringify({ params, hostname }));
                debug(`Command ${command} with params ${params} sent`);
            }
            else {
                return new Promise((resolve, reject) => {
                    this.redis.on('ready', () => {
                        const msg = JSON.stringify({ params, hostname });
                        this.redis.publish(`command.${command}`, msg, (err) => {
                            if (err)
                                throw reject(err);
                            debug(`Command ${command} with params ${msg} sent`);
                            resolve();
                        });
                    });
                    this.redis.on('error', reject);
                });
            }
        });
    }
    coinExists(name) {
        return __awaiter(this, void 0, void 0, function* () {
            return !!(yield this.redis.hget(REDIS_PREFIX + 'coins', name));
        });
    }
    deleteGPU(modelOrUUID) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.redis.hdel(REDIS_PREFIX + 'gpus', modelOrUUID);
            yield this.redis.publish('gpus', JSON.stringify({ modelOrUUID, config: null }));
        });
    }
    deleteCoin(name) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.redis.hdel(REDIS_PREFIX + 'coins', name);
        });
    }
    deleteMiner(name) {
        return __awaiter(this, void 0, void 0, function* () {
            const minerConf = JSON.parse(yield this.redis.hget(REDIS_PREFIX + 'miners', name));
            yield this.redis.del(REDIS_PREFIX + minerConf.sha256sum);
            yield this.redis.hdel(REDIS_PREFIX + 'miners', name);
        });
    }
}
exports.Redis = Redis;
//# sourceMappingURL=redis.js.map