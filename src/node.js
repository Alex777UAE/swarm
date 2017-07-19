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
const util_1 = require("util");
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
            this.gpuConfigs = yield this.rig.loadGPUConfigs();
            if (swarm) {
                this.db = new redis_1.Redis({
                    host: appConf.redis.host,
                    port: appConf.redis.port,
                    myName: this.rig.hostname,
                    onMinerUpdate: this.minerUpdate.bind(this),
                    onCoinUpdate: this.coinUpdate.bind(this),
                    onCurrentCoinUpdate: this.setCurrentCoin.bind(this),
                    onCommand: this.command.bind(this),
                    onGPUUpdate: this.gpuUpdate.bind(this)
                });
                coinName = yield this.db.getCurrentCoin();
                yield this.syncCoins();
                yield this.syncMiners();
                yield this.syncGPUs();
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
            // todo idea. make commands dynamic. bound commandname -> filename. like in src/commands/*
            debug(`received command ${command} with params ${params}`);
            if (command === 'command.reboot') {
                yield this.abortSignalHandler();
                yield this.rig.reboot();
            }
            else if (command === 'command.restart') {
                yield this.miner.stop();
                yield this.miner.start(this.coins[this.currentCoin]);
            }
            else if (command === 'command.gpu') {
                const ovConfig = JSON.parse(params);
                const algo = ovConfig.algorithm;
                const newGPUConfigs = Object.assign({}, this.gpuConfigs);
                const targetGPU = this.GPUs.find(gpu => gpu.id === ovConfig.cardId);
                if (!targetGPU)
                    throw new Error(`No GPU with id ${ovConfig.cardId} found on ${this.rig.hostname}`);
                if (!newGPUConfigs[targetGPU.uuid]) {
                    // add new
                    newGPUConfigs[targetGPU.uuid] = newGPUConfigs[targetGPU.model];
                    if (algo) {
                        newGPUConfigs[targetGPU.uuid][algo] = newGPUConfigs[targetGPU.model][algo];
                    }
                }
                Object.keys(ovConfig)
                    .filter(key => key !== 'algorithm' && key !== 'cardId' && !util_1.isNullOrUndefined(ovConfig[key]))
                    .forEach(key => {
                    if (algo)
                        newGPUConfigs[targetGPU.uuid][algo][key] = ovConfig[key];
                    else {
                        Object.keys(newGPUConfigs[targetGPU.uuid])
                            .forEach(algo => {
                            newGPUConfigs[targetGPU.uuid][algo] = newGPUConfigs[targetGPU.uuid][algo] ?
                                newGPUConfigs[targetGPU.uuid][algo] : newGPUConfigs[targetGPU.model][algo];
                            newGPUConfigs[targetGPU.uuid][algo][key] = ovConfig[key];
                        });
                    }
                });
                yield this.db.updateGPU(targetGPU.uuid, newGPUConfigs[targetGPU.uuid]);
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
    syncGPUs() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const gpuList = yield this.db.getAllGPUConfigs();
                const modelOrUUIDs = Object.keys(gpuList);
                for (let i = 0; i < modelOrUUIDs.length; i++) {
                    const modelOrUUID = modelOrUUIDs[i];
                    if (!this.gpuConfigs[modelOrUUID] || !_.isEqual(this.gpuConfigs[modelOrUUID], gpuList[modelOrUUID])) {
                        debug(`Updating gpu config in process and on disk`);
                        yield this.gpuUpdate(modelOrUUID, gpuList[modelOrUUID]);
                    }
                }
            }
            catch (err) {
                debug(`Error syncing gpuConfigs:\n${err}`);
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
    gpuUpdate(gpuModelOrUUID, config) {
        return __awaiter(this, void 0, void 0, function* () {
            // check all gpu, if gpu.model||gpu.uuid match gpuModelOrUUID: string - gpu.setup()
            // if miner changed for [0] than miner.stop&miner.start
            if (this.currentCoin) {
                const currentAlgo = this.coins[this.currentCoin].algorithm;
                const currentMiner = this.gpuConfigs[gpuModelOrUUID] ? this.gpuConfigs[gpuModelOrUUID][currentAlgo].miner
                    : this.gpuConfigs[this.GPUs[0].model][currentAlgo].miner;
                debug(`gpuUpdate - current algo (${currentAlgo} and gpuModelOrUUID is [${gpuModelOrUUID}])`);
                for (let i = 0; i < this.GPUs.length; i++) {
                    const gpu = this.GPUs[i];
                    if (gpu.model === gpuModelOrUUID || gpu.uuid === gpuModelOrUUID) {
                        debug(`Found matching gpu with local id ${gpu.id}`);
                        if (!this.gpuConfigs[gpuModelOrUUID] ||
                            !_.isEqual(this.gpuConfigs[gpuModelOrUUID][currentAlgo], config[currentAlgo]))
                            yield gpu.setup(config[currentAlgo]);
                    }
                }
                if (currentMiner !== config[currentAlgo].miner) {
                    debug(`Miner change [${currentMiner}] -> [${config[currentAlgo].miner}]`);
                    const minerPath = __dirname + '/wrappers/' + this.miners[config[currentAlgo].miner].type;
                    debug(`Loading miner: ${this.miners[config[currentAlgo].miner].type} from ${minerPath}`);
                    const Miner = require(minerPath).default;
                    const miner = new Miner(config[currentAlgo].miner, this.miners[config[currentAlgo].miner].executable);
                    yield this.miner.stop();
                    this.miner = miner;
                    yield this.miner.start(this.coins[this.currentCoin]);
                }
            }
            yield this.rig.updateGPU(gpuModelOrUUID, config);
            this.gpuConfigs[gpuModelOrUUID] = config;
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
            if (name === this.currentCoin)
                return;
            const gpus = this.GPUs;
            const model = gpus[0].model;
            const algorithm = this.coins[name].algorithm;
            let miner;
            let minerName;
            try {
                debug(`Getting miner of 0 GPU model [${model}] on a rig for the algorithm {${algorithm}} ...`);
                minerName = this.gpuConfigs[model][algorithm].miner;
                debug(`Miner name is ${minerName}`);
                const minerPath = __dirname + '/wrappers/' + this.miners[minerName].type;
                debug(`Loading miner: ${this.miners[minerName].type} from ${minerPath}`);
                const Miner = require(minerPath).default;
                miner = new Miner(minerName, this.miners[minerName].executable);
            }
            catch (err) {
                debug(`Can't continue setting current coins: ${err}`);
                return;
            }
            if (this.miner) {
                debug(`Stopping current miner wrapper ${this.miner.type}`);
                yield this.miner.stop();
            }
            if (!this.currentCoin || this.coins[name].algorithm !== this.coins[this.currentCoin].algorithm) {
                debug(`Setting gpu config for ${name}`);
                if (!(yield this.setGPUConfig(this.coins[name].algorithm))) {
                    if (!this.currentCoin)
                        throw new Error(`no default coin is set to failover`);
                    yield this.miner.start(this.coins[this.currentCoin]);
                    return;
                }
            }
            else {
                debug(`Algorithm for coin [${name}] is the same as for ${this.currentCoin}, skip GPU reconfiguration`);
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
    getGPUConfigForAlgorithm(gpu, algorithm) {
        // gpuConfigs[gpu.uuid] ? gpuConfigs[gpu.uuid] : gpuConfigs[gpu.model];
        if (this.gpuConfigs[gpu.uuid] && this.gpuConfigs[gpu.uuid][algorithm]) {
            return this.gpuConfigs[gpu.uuid][algorithm];
        }
        else {
            return this.gpuConfigs[gpu.model][algorithm];
        }
    }
    setGPUConfig(algorithm) {
        return __awaiter(this, void 0, void 0, function* () {
            const gpus = this.GPUs;
            for (let i = 0; i < gpus.length; i++) {
                const gpu = gpus[i];
                const config = this.getGPUConfigForAlgorithm(gpu, algorithm);
                if (!config) {
                    debug(`Can't continue setting current coin to ${algorithm}: no config found for ${gpu.model}`);
                    if (this.currentCoin) {
                        // returning current configs to the cards
                        for (let j = i - 1; j > 0; j--) {
                            const gpu = gpus[j];
                            const algorithm = this.coins[this.currentCoin].algorithm;
                            const config = this.getGPUConfigForAlgorithm(gpu, algorithm);
                            if (!config)
                                return false;
                            yield gpu.setup(config);
                        }
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