"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Created by alex on 10.07.17.
 */
require("source-map-support/register");
const fs = require("fs");
const os = require("os");
const _ = require("lodash");
const util = require("util");
const touch = require("touch");
const redis_1 = require("./redis");
const linux_1 = require("./rig/linux");
const timers_1 = require("timers");
const path = require("path");
const debug = require('debug')('miner:node');
const readFile = util.promisify(fs.readFile);
const unlink = util.promisify(fs.unlink);
const STATISTIC_LOOP_INTERVAL_MS = 60 * 1000; // once a minute
exports.SWITCH_FILE = 'switchCoin';
class Node {
    constructor() {
        this.coins = {};
        this.miners = {};
        this.statsLocked = false;
    }
    /*
        1. init rig manager
            -> instantiate appropriate os class
            -> init it
            -> get gpus
            -> set stats update loop
     2. sync coins
            -> redis.getAllCoins() coinName => {config}
                => forEach rig.updateCoin(name, config)
            fallback -> rig.loadCoins : coinName => {config}
        3. sync miners
            -> redis.getAllMiners() : minerName => {config}
                => forEach rig.updateMiner(name, config)
            fallback -> rig.loadMiners : minerName => {config}
        4. get current coin
            -> redis.getCurrentCoin
                => fallback to zcash
            this.coin = coin
        5. init apropriate miner (by the first card settings)
            -> this.miner = new Miner()
            -> this.miner.setWorkername(rig.hostname)
        6. start miner
            -> this.miner.start(this.coin)
        7. subscribe to updates
            - coins
                rig.updateCoin(name, config)
            - miners
                rig.updateMiner(name, config)
            - current coin
                this.coin = coin
                this.miner.stop()
                this.miner = new Miner()
                this.miner.start();


        redis methods
            -> updateCoin(name, config)
            -> updateMiner(name, binaryPath, config)
     */
    main() {
        return __awaiter(this, void 0, void 0, function* () {
            const appConf = yield Node.readConfig();
            const swarm = appConf.mode === 'swarm';
            let coinName = appConf.defaultCoin;
            // todo multi-OS, multi-GPU support
            this.rig = new linux_1.Linux(appConf['nvidia-smi'], appConf['nvidia-settings']);
            yield this.rig.init();
            this.GPUs = yield this.rig.getGPUs();
            this.coins = yield this.rig.loadCoins();
            this.miners = yield this.rig.loadMiners();
            if (swarm) {
                this.db = new redis_1.Redis({
                    host: appConf.redis.host,
                    port: appConf.redis.port,
                    myName: this.rig.hostname,
                    onMinerUpdate: this.minerUpdate.bind(this),
                    onCoinUpdate: this.coinUpdate.bind(this),
                    onCurrentCoinUpdate: this.setCurrentCoin.bind(this),
                    onCommand: this.command.bind(this)
                });
                coinName = yield this.db.getCurrentCoin();
                yield this.syncCoins();
                yield this.syncMiners();
            }
            else {
                yield touch(os.tmpdir() + path.sep + exports.SWITCH_FILE);
                this.watchSwitchFile();
            }
            yield this.setCurrentCoin(coinName);
            // setInterval(this.statisticLoop.bind(this), STATISTIC_LOOP_INTERVAL_MS);
            if (swarm)
                yield this.statisticLoop();
            this.setSignalHandlers();
        });
    }
    command(command, params) {
        return __awaiter(this, void 0, void 0, function* () {
            debug(`received command ${command} with params ${params}`);
            if (command === 'command.reboot') {
                yield this.abortSignalHandler();
                yield this.rig.reboot();
            }
            else if (command === 'command.restart') {
                yield this.miner.stop();
                yield this.miner.start(this.coins[this.currentCoin]);
            }
        });
    }
    watchSwitchFile() {
        const fileName = os.tmpdir() + path.sep + exports.SWITCH_FILE;
        this.switchFileWatcher = fs.watch(fileName, 'utf8', (event) => {
            if (event === 'change') {
                fs.readFile(fileName, 'utf8', (err, data) => {
                    if (err) {
                        debug(`Error reading switch file ${err}`);
                        return;
                    }
                    const coin = data.split('\n')[0].trim();
                    if (coin && coin !== this.currentCoin)
                        this.setCurrentCoin(coin).catch(debug);
                });
            }
        });
    }
    abortSignalHandler() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.switchFileWatcher) {
                this.switchFileWatcher.close();
                yield unlink(os.tmpdir() + path.sep + exports.SWITCH_FILE)
                    .catch(debug);
                debug('Switch file watch stopped');
            }
            yield this.miner.stop().catch(debug);
            debug('Node stopped.');
            process.exit(0);
        });
    }
    setSignalHandlers() {
        process.on('SIGINT', this.abortSignalHandler.bind(this));
        process.on('SIGBREAK', this.abortSignalHandler.bind(this)); // for windows, do we need it ??
        process.on('SIGTERM', this.abortSignalHandler.bind(this));
        process.on('SIGHUP', this.abortSignalHandler.bind(this));
    }
    statisticLoop() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.statsLocked)
                return;
            this.statsLocked = true;
            try {
                const { cpu, mem } = yield this.rig.getLoad();
                const stats = {
                    ip: this.rig.ip,
                    os: this.rig.os,
                    cpu: this.rig.cpu,
                    cpuLoad: cpu,
                    memLoad: mem,
                    coin: this.currentCoin,
                    coinTime: Date.now() - this.coinStartedAt,
                    gpuN: this.GPUs.length,
                    uptime: this.rig.uptime,
                    hashrate: this.miner.hashrate,
                    gpuHashrates: this.miner.hashrates,
                    gpuDetails: [],
                    gpuNames: [],
                    acceptPercent: this.miner.acceptedPercent
                };
                for (let i = 0; i < this.GPUs.length; i++) {
                    const gpu = this.GPUs[i];
                    stats.gpuDetails.push(yield gpu.getStats());
                    stats.gpuNames.push(gpu.model);
                }
                yield this.db.updateStats(JSON.stringify(stats));
            }
            catch (err) {
                debug(err);
            }
            this.statsLocked = false;
            this.timer = timers_1.setTimeout(this.statisticLoop.bind(this), STATISTIC_LOOP_INTERVAL_MS);
            this.timer.ref();
        });
    }
    syncCoins() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const coinList = yield this.db.getAllCoins();
                const coinNames = Object.keys(coinList);
                for (let i = 0; i < coinNames.length; i++) {
                    const name = coinNames[i];
                    if (!this.coins[name] || !_.isEqual(this.coins[name], coinList[name])) {
                        debug(`Updating coin in process and on disk`);
                        yield this.coinUpdate(name, coinList[name]);
                    }
                }
            }
            catch (err) {
                debug(`Error syncing coins:\n${err}`);
                if (Object.keys(this.coins).length === 0)
                    throw new Error('Unable to continue, no coins available');
            }
        });
    }
    syncMiners() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const minerList = yield this.db.getAllMiners();
                const minerNames = Object.keys(minerList);
                for (let i = 0; i < minerNames.length; i++) {
                    const name = minerNames[i];
                    if (!this.miners[name] || !_.isEqual(this.miners[name], minerList[name])) {
                        debug(`Updating miner in process and on disk`);
                        const binary = yield this.db.getMinerBinnary(minerList[name].sha256sum);
                        yield this.minerUpdate(name, minerList[name], binary);
                    }
                }
            }
            catch (err) {
                debug(`Error syncing miners:\n${err}`);
                if (Object.keys(this.miners).length === 0)
                    throw new Error('Unable to continue, no miners available');
            }
        });
    }
    coinUpdate(name, config) {
        return __awaiter(this, void 0, void 0, function* () {
            this.coins[name] = config;
            yield this.rig.updateCoin(name, config);
            if (this.currentCoin === name) {
                yield this.setCurrentCoin(name);
            }
        });
    }
    minerUpdate(name, config, binary) {
        return __awaiter(this, void 0, void 0, function* () {
            this.miners[name] = config;
            yield this.rig.updateMiner(name, config, binary);
            if (this.miner && config.type === this.miner.type) {
                yield this.setCurrentCoin(this.currentCoin);
            }
        });
    }
    setCurrentCoin(name) {
        return __awaiter(this, void 0, void 0, function* () {
            const gpus = this.GPUs;
            let miner;
            let minerName;
            try {
                minerName = this.coins[name].gpuConfigs[gpus[0].model].miners[this.coins[name].algorithm];
                const minerPath = __dirname + '/wrappers/' + this.miners[minerName].type;
                debug(`loading miner: ${this.miners[minerName].type} from ${minerPath}`);
                const Miner = require(minerPath).default;
                miner = new Miner(minerName, this.miners[minerName].executable);
            }
            catch (err) {
                debug(`can't continue setting current coins: ${err}`);
                return;
            }
            if (this.miner) {
                debug(`stopping current miner wrapper ${this.miner.type}`);
                yield this.miner.stop();
            }
            debug(`setting gpu config for ${name}`);
            if (!(yield this.setGPUConfig(name))) {
                if (!this.currentCoin)
                    throw new Error(`no default coin is set to failover`);
                yield this.miner.start(this.coins[this.currentCoin]);
                return;
            }
            this.currentCoin = name;
            this.miner = miner;
            this.miner.setWorker(this.rig.hostname);
            debug(`Current coin is ${name} and miner type is ${miner.type} with worker name ${this.rig.hostname}`);
            debug(`Starting miner up`);
            yield this.miner.start(this.coins[name]);
            this.coinStartedAt = Date.now();
            debug(`Miner started at ${this.coinStartedAt}`);
        });
    }
    setGPUConfig(coinName) {
        return __awaiter(this, void 0, void 0, function* () {
            const gpus = this.GPUs;
            for (let i = 0; i < gpus.length; i++) {
                const gpu = gpus[i];
                const gpuConfigs = this.coins[coinName].gpuConfigs;
                const config = gpuConfigs[gpu.uuid] ? gpuConfigs[gpu.uuid] : gpuConfigs[gpu.model];
                if (!config) {
                    debug(`can't continue setting current coin to ${coinName}: no config found for ${gpu.model}`);
                    if (!this.currentCoin)
                        return false;
                    // returning current configs to the cards
                    for (let j = i - 1; j > 0; j--) {
                        const gpu = gpus[j];
                        const gpuConfigs = this.coins[this.currentCoin].gpuConfigs;
                        const config = gpuConfigs[gpu.uuid] ? gpuConfigs[gpu.uuid] : gpuConfigs[gpu.model];
                        if (!config)
                            return false;
                        yield gpu.setup(config);
                    }
                    return false;
                }
                yield gpu.setup(config);
            }
            return true;
        });
    }
    static readConfig() {
        return __awaiter(this, void 0, void 0, function* () {
            return JSON.parse(yield readFile(__dirname + '/../config.json', { encoding: 'utf8' }));
        });
    }
}
exports.Node = Node;
//# sourceMappingURL=node.js.map