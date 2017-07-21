/**
 * Created by alex on 10.07.17.
 */
import 'source-map-support/register';
import * as fs from 'fs';
import * as os from 'os';
import * as _ from 'lodash';
import * as util from 'util';
import * as touch from 'touch';
import {IDBLayer} from "../interfaces/i_db_layer";
import {Redis} from "./redis";
import {Linux} from "./rig/linux";
import {setTimeout} from "timers";
import {IRig} from "../interfaces/i_rig";
import {
    IGPU, IGPUConfig, IGPUConfigList, IGPUStats, OverClockMessage,
    PerAlgorithmGPUConfig
} from "../interfaces/i_gpu";
import {IMiner, IMinerList, IMinerConfig} from "../interfaces/i_miner";
import {ICoinConfig, ICoinList, Algorithm} from "../interfaces/i_coin";
import * as path from "path";
import {isNullOrUndefined} from "util";

const debug = require('debug')('miner:node');
const readFile = util.promisify(fs.readFile);
const unlink = util.promisify(fs.unlink);

const STATISTIC_LOOP_INTERVAL_MS = 60 * 1000; // once a minute
export const SWITCH_FILE = 'switchCoin';

export interface IAppConfig {
    "nvidia-smi": string;
    "nvidia-settings": string;
    "redis": {
        "host": string;
        "port": number;
    };
    "defaultCoin": string;
    "mode": "swarm" | "single";
}

export interface IStats {
    ip: string;
    os: string;
    cpu: string;
    cpuLoad: number;
    memLoad: number;
    coin: string;
    coinTime: number | string;
    gpuN: number;
    gpuNames: string[];
    gpuUUIDs: string[];
    gpuHashrates: number[];
    gpuDetails: IGPUStats[];
    hashrate: number;
    acceptPercent: number;
    uptime: number | string;
}

export class Node {
    private db: IDBLayer;
    private rig: IRig;
    private miner: IMiner;
    private GPUs: IGPU[];
    private gpuConfigs: IGPUConfigList;
    private currentCoin: string;
    private coins: ICoinList = {};
    private miners: IMinerList = {};
    private timer: NodeJS.Timer;
    private switchFileWatcher: fs.FSWatcher;

    // stats
    private coinStartedAt: number; // timestamp
    private statsLocked: boolean = false;

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
    public async main(): Promise<void> {
        const appConf = await Node.readConfig();
        const swarm = appConf.mode === 'swarm';
        let coinName = appConf.defaultCoin;
        // todo multi-OS, multi-GPU support
        this.rig = new Linux(appConf['nvidia-smi'], appConf['nvidia-settings']);
        await this.rig.init();
        this.GPUs = await this.rig.getGPUs();
        this.coins = await this.rig.loadCoins();
        this.miners = await this.rig.loadMiners();
        this.gpuConfigs = await this.rig.loadGPUConfigs();

        if (swarm) {
            this.db = new Redis({
                host: appConf.redis.host,
                port: appConf.redis.port,
                myName: this.rig.hostname,
                onMinerUpdate: this.minerUpdate.bind(this),
                onCoinUpdate: this.coinUpdate.bind(this),
                onCurrentCoinUpdate: this.setCurrentCoin.bind(this),
                onCommand: this.command.bind(this),
                onGPUUpdate: this.gpuUpdate.bind(this)
            });
            coinName = await this.db.getCurrentCoin();
            await this.syncCoins();
            await this.syncMiners();
            await this.syncGPUs();
        } else {
            await touch(os.tmpdir() + path.sep + SWITCH_FILE);
            this.watchSwitchFile();
        }

        await this.setCurrentCoin(coinName);

        // setInterval(this.statisticLoop.bind(this), STATISTIC_LOOP_INTERVAL_MS);
        if (swarm) await this.statisticLoop();
        this.setSignalHandlers();
    }

    private async command(command: string, params: string): Promise<void> {
        // todo idea. make commands dynamic. bound commandname -> filename. like in src/commands/*
        debug(`received command ${command} with params ${params}`);
        if (command === 'command.reboot') {
            await this.abortSignalHandler();
            await this.rig.reboot();
        } else if (command === 'command.restart') {
            await this.miner.stop();
            await this.miner.start(this.coins[this.currentCoin]);
        } else if (command === 'command.gpu') {
            const ovConfig: OverClockMessage = JSON.parse(params);
            const algo = ovConfig.algorithm;
            const newGPUConfigs = Object.assign({}, this.gpuConfigs);
            const targetGPU = this.GPUs.find(gpu => gpu.id === ovConfig.cardId);
            if (!targetGPU) throw new Error(`No GPU with id ${ovConfig.cardId} found on ${this.rig.hostname}`);
            if (!newGPUConfigs[targetGPU.uuid]) {
                // add new
                if (algo) {
                    newGPUConfigs[targetGPU.uuid] = {}; // newGPUConfigs[targetGPU.model];
                    newGPUConfigs[targetGPU.uuid][algo] = newGPUConfigs[targetGPU.model][algo];
                } else {
                    newGPUConfigs[targetGPU.uuid] = newGPUConfigs[targetGPU.model];
                }

            } else if (algo && !newGPUConfigs[targetGPU.uuid][algo])
                newGPUConfigs[targetGPU.uuid][algo] = newGPUConfigs[targetGPU.model][algo];


            Object.keys(ovConfig)
                .filter(key => key !== 'algorithm' && key !== 'cardId' && !isNullOrUndefined(ovConfig[key]))
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

            await this.db.updateGPU(targetGPU.uuid, newGPUConfigs[targetGPU.uuid]);
        }
    }

    private watchSwitchFile(): void {
        const fileName = os.tmpdir() + path.sep + SWITCH_FILE;
        this.switchFileWatcher = fs.watch(fileName, 'utf8', (event) => {
            if (event === 'change') {
                fs.readFile(fileName, 'utf8', (err, data: string) => {
                   if (err) {
                       debug(`Error reading switch file ${err}`);
                       return;
                   }
                   const coin: string = data.split('\n')[0].trim();
                   if (coin && coin !== this.currentCoin)
                       this.setCurrentCoin(coin).catch(debug);
                });
            }
        });
    }

    private async abortSignalHandler(): Promise<void> {
        if (this.switchFileWatcher) {
            this.switchFileWatcher.close();
            await unlink(os.tmpdir() + path.sep + SWITCH_FILE)
                .catch(debug);
            debug('Switch file watch stopped');
        }
        await this.miner.stop().catch(debug);
        debug('Node stopped.');
        process.exit(0);
    }

    private setSignalHandlers(): void {
        process.on('SIGINT', this.abortSignalHandler.bind(this));
        process.on('SIGBREAK', this.abortSignalHandler.bind(this)); // for windows, do we need it ??
        process.on('SIGTERM', this.abortSignalHandler.bind(this));
        process.on('SIGHUP', this.abortSignalHandler.bind(this));
    }

    private async statisticLoop(): Promise<void> {
        if (this.statsLocked) return;
        this.statsLocked = true;

        try {
            const {cpu, mem} = await this.rig.getLoad();
            const stats: IStats = {
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
                gpuUUIDs: [],
                acceptPercent: this.miner.acceptedPercent
            };

            for (let i = 0; i < this.GPUs.length; i++) {
                const gpu = this.GPUs[i];
                stats.gpuDetails.push(await gpu.getStats());
                stats.gpuNames.push(gpu.model);
                stats.gpuUUIDs.push(gpu.uuid);
            }

            await this.db.updateStats(JSON.stringify(stats));
        } catch (err) {
            debug(err);
        }

        this.statsLocked = false;

        this.timer = setTimeout(this.statisticLoop.bind(this), STATISTIC_LOOP_INTERVAL_MS);
        this.timer.ref();
    }

    private async syncCoins(): Promise<void> {
        try {
            const coinList = await this.db.getAllCoins();
            const coinNames = Object.keys(coinList);

            for (let i = 0; i < coinNames.length; i++) {
                const name = coinNames[i];

                if (!this.coins[name] || !_.isEqual(this.coins[name], coinList[name])){
                    debug(`Updating coin in process and on disk`);
                    await this.coinUpdate(name, coinList[name]);
                }
            }
        } catch (err) {
            debug(`Error syncing coins:\n${err}`);
            if (Object.keys(this.coins).length === 0) throw new Error('Unable to continue, no coins available');
        }
    }

    private async syncMiners(): Promise<void> {
        try {
            const minerList = await this.db.getAllMiners();
            const minerNames = Object.keys(minerList);

            for (let i = 0; i < minerNames.length; i++) {
                const name = minerNames[i];

                if (!this.miners[name] || !_.isEqual(this.miners[name], minerList[name])) {
                    debug(`Updating miner in process and on disk`);
                    const binary = await this.db.getMinerBinnary(minerList[name].sha256sum);
                    await this.minerUpdate(name, minerList[name], binary);
                }
            }
        } catch (err) {
            debug(`Error syncing miners:\n${err}`);
            if (Object.keys(this.miners).length === 0) throw new Error('Unable to continue, no miners available');
        }
    }

    private async syncGPUs(): Promise<void> {
        try {
            const gpuList = await this.db.getAllGPUConfigs();
            const modelOrUUIDs = Object.keys(gpuList);

            for (let i = 0; i < modelOrUUIDs.length; i++) {
                const modelOrUUID = modelOrUUIDs[i];

                if (!this.gpuConfigs[modelOrUUID] || !_.isEqual(this.gpuConfigs[modelOrUUID], gpuList[modelOrUUID])) {
                    debug(`Updating gpu config in process and on disk`);
                    await this.gpuUpdate(modelOrUUID, gpuList[modelOrUUID]);
                }
            }

            for (let i = 0; i < Object.keys(this.gpuConfigs).length; i++) {
                const modelOrUUID = Object.keys(this.gpuConfigs)[i];
                if (!gpuList[modelOrUUID]) delete this.gpuConfigs[modelOrUUID];
            }
        } catch (err) {
            debug(`Error syncing gpuConfigs:\n${err}`);
        }
    }

    private async coinUpdate(name: string, config: ICoinConfig) {
        this.coins[name] = config;
        await this.rig.updateCoin(name, config);
        if (this.currentCoin === name) {
            await this.setCurrentCoin(name);
        }
    }

    private async gpuUpdate(gpuModelOrUUID: string, config: PerAlgorithmGPUConfig) {
        // check all gpu, if gpu.model||gpu.uuid match gpuModelOrUUID: string - gpu.setup()
        // if miner changed for [0] than miner.stop&miner.start
        if (this.currentCoin) {
            if (!config) {
                delete this.gpuConfigs[gpuModelOrUUID];
                return;
            }
            const currentAlgo = this.coins[this.currentCoin].algorithm;
            const currentMiner = this.gpuConfigs[gpuModelOrUUID] ? this.gpuConfigs[gpuModelOrUUID][currentAlgo].miner
                : this.gpuConfigs[this.GPUs[0].model][currentAlgo].miner;

            debug(`gpuUpdate - current algo (${currentAlgo} and gpuModelOrUUID is [${gpuModelOrUUID}])`);
            for (let i = 0; i < this.GPUs.length; i++) {
                const gpu = this.GPUs[i];
                if (gpu.model === gpuModelOrUUID || gpu.uuid === gpuModelOrUUID) {
                    debug(`Found matching gpu with local id ${gpu.id}`);
                    if (config[currentAlgo]) {
                        if (!this.gpuConfigs[gpuModelOrUUID] || !this.gpuConfigs[gpuModelOrUUID][currentAlgo] ||
                            !_.isEqual(this.gpuConfigs[gpuModelOrUUID][currentAlgo], config[currentAlgo]))
                            await gpu.setup(config[currentAlgo]);
                    }
                }
            }

            if (currentMiner !== config[currentAlgo].miner) {
                debug(`Miner change [${currentMiner}] -> [${config[currentAlgo].miner}]`);
                const minerPath = __dirname + '/wrappers/' + this.miners[config[currentAlgo].miner].type;
                debug(`Loading miner: ${this.miners[config[currentAlgo].miner].type} from ${minerPath}`);
                const Miner = require(minerPath).default;
                const miner = new Miner(config[currentAlgo].miner, this.miners[config[currentAlgo].miner].executable);
                await this.miner.stop();
                this.miner = miner;
                await this.miner.start(this.coins[this.currentCoin]);
            }
        }

        await this.rig.updateGPU(gpuModelOrUUID, config);

        this.gpuConfigs[gpuModelOrUUID] = config;
    }

    private async minerUpdate(name: string, config: IMinerConfig, binary: Buffer) {
        this.miners[name] = config;
        await this.rig.updateMiner(name, config, binary);
        if (this.miner && config.type === this.miner.type) {
            await this.setCurrentCoin(this.currentCoin);
        }
    }

    private async setCurrentCoin(name: string) {
        if (name === this.currentCoin) return;
        const gpus = this.GPUs;
        const model = gpus[0].model;
        const algorithm = this.coins[name].algorithm;
        let miner: IMiner;
        let minerName;
        try {
            debug(`Getting miner of 0 GPU model [${model}] on a rig for the algorithm {${algorithm}} ...`);
            minerName = this.gpuConfigs[model][algorithm].miner;
            debug(`Miner name is ${minerName}`);
            const minerPath = __dirname + '/wrappers/' + this.miners[minerName].type;
            debug(`Loading miner: ${this.miners[minerName].type} from ${minerPath}`);
            const Miner = require(minerPath).default;
            miner = new Miner(minerName, this.miners[minerName].executable);
        } catch (err) {
            debug(`Can't continue setting current coins: ${err}`);
            return;
        }

        if (this.miner) {
            debug(`Stopping current miner wrapper ${this.miner.type}`);
            await this.miner.stop();
        }

        if (!this.currentCoin || this.coins[name].algorithm !== this.coins[this.currentCoin].algorithm) {
            debug(`Setting gpu config for ${name}`);
            if (!await this.setGPUConfig(this.coins[name].algorithm)) {
                if (!this.currentCoin) throw new Error(`no default coin is set to failover`);
                await this.miner.start(this.coins[this.currentCoin]);
                return;
            }
        } else {
            debug(`Algorithm for coin [${name}] is the same as for ${this.currentCoin}, skip GPU reconfiguration`);
        }

        this.currentCoin = name;
        this.miner = miner;
        this.miner.setWorker(this.rig.hostname);
        debug(`Current coin is ${name} and miner type is ${miner.type} with worker name ${this.rig.hostname}`);
        debug(`Starting miner up`);
        await this.miner.start(this.coins[name]);
        this.coinStartedAt = Date.now();
        debug(`Miner started at ${this.coinStartedAt}`);
    }

    private getGPUConfigForAlgorithm(gpu: IGPU, algorithm: Algorithm): IGPUConfig {
        // gpuConfigs[gpu.uuid] ? gpuConfigs[gpu.uuid] : gpuConfigs[gpu.model];
        if (this.gpuConfigs[gpu.uuid] && this.gpuConfigs[gpu.uuid][algorithm]) {
            return this.gpuConfigs[gpu.uuid][algorithm];
        } else {
            return this.gpuConfigs[gpu.model][algorithm];
        }
    }

    private async setGPUConfig(algorithm: Algorithm): Promise<boolean> {
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
                        if (!config) return false;
                        await gpu.setup(config);
                    }
                }

                return false;
            }

            await gpu.setup(config);
        }

        return true;
    }

    private static async readConfig(): Promise<IAppConfig> {
        return JSON.parse(await readFile(__dirname + '/../config.json', {encoding: 'utf8'}));
    }
}