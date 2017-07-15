/**
 * Created by alex on 10.07.17.
 */
import 'source-map-support/register';
import * as fs from 'fs';
import * as util from 'util';
import {IDBLayer} from "../interfaces/i_db_layer";
import {Redis} from "./redis";
import {Linux} from "./rig/linux";
import * as _ from 'lodash';
import {setTimeout} from "timers";
import {IRig} from "../interfaces/i_rig";
import {IGPU, IGPUStats} from "../interfaces/i_gpu";
import {IMiner, IMinerList, IMinerConfig} from "../interfaces/i_miner";
import {ICoinConfig, ICoinList} from "../interfaces/i_coin";

const debug = require('debug')('miner:node');
const readFile = util.promisify(fs.readFile);

const STATISTIC_LOOP_INTERVAL_MS = 60 * 1000; // once a minute

interface Config {
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
    coinTime: number;
    gpuN: number;
    gpuNames: string[];
    gpuHashrates: number[];
    gpuDetails: IGPUStats[];
    hashrate: number;
    acceptPercent: number;
    uptime: number;
}

export class Node {
    private db: IDBLayer;
    private rig: IRig;
    private miner: IMiner;
    private GPUs: IGPU[];
    private currentCoin: string;
    private coins: ICoinList = {};
    private miners: IMinerList = {};
    private timer: NodeJS.Timer;

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
        let coinName = appConf.defaultCoin;
        // todo multi-OS, multi-GPU support
        this.rig = new Linux(appConf['nvidia-smi'], appConf['nvidia-settings']);
        await this.rig.init();
        this.GPUs = await this.rig.getGPUs();
        this.coins = await this.rig.loadCoins();
        this.miners = await this.rig.loadMiners();

        if (appConf.mode === 'swarm') {
            this.db = new Redis({
                host: appConf.redis.host,
                port: appConf.redis.port,
                myName: this.rig.hostname,
                onMinerUpdate: this.minerUpdate.bind(this),
                onCoinUpdate: this.coinUpdate.bind(this),
                onCurrentCoinUpdate: this.setCurrentCoin.bind(this)
            });
            coinName = await this.db.getCurrentCoin();
            await this.syncCoins();
            await this.syncMiners();
        }

        await this.setCurrentCoin(coinName);

        // setInterval(this.statisticLoop.bind(this), STATISTIC_LOOP_INTERVAL_MS);
        await this.statisticLoop();
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
                acceptPercent: this.miner.acceptedPercent
            };

            for (let i = 0; i < this.GPUs.length; i++) {
                const gpu = this.GPUs[i];
                stats.gpuDetails.push(await gpu.getStats());
                stats.gpuNames.push(gpu.model);
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

    private async coinUpdate(name: string, config: ICoinConfig) {
        this.coins[name] = config;
        await this.rig.updateCoin(name, config);
        if (this.currentCoin === name) {
            await this.setCurrentCoin(name);
        }
    }

    private async minerUpdate(name: string, config: IMinerConfig, binary: Buffer) {
        this.miners[name] = config;
        await this.rig.updateMiner(name, config, binary);
        if (this.miner && config.type === this.miner.type) {
            await this.setCurrentCoin(this.currentCoin);
        }
    }

    private async setCurrentCoin(name: string) {
        const gpus = this.GPUs;
        let miner: IMiner;
        let minerName;
        try {
            minerName = this.coins[name].gpuConfigs[gpus[0].model].miners[this.coins[name].algorithm];
            const minerPath = __dirname + '/wrappers/' + this.miners[minerName].type;
            debug(`loading miner: ${this.miners[minerName].type} from ${minerPath}`);
            const Miner = require(minerPath).default;
            miner = new Miner(minerName, this.miners[minerName].executable);
        } catch (err) {
            debug(`can't continue setting current coins: ${err}`);
            return;
        }

        if (this.miner) {
            debug(`stopping current miner wrapper ${this.miner.type}`);
            await this.miner.stop();
        }

        debug(`setting gpu config for ${name}`);
        if (!await this.setGPUConfig(name)) {
            if (!this.currentCoin) throw new Error(`no default coin is set to failover`);
            await this.miner.start(this.coins[this.currentCoin]);
            return;
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

    private async setGPUConfig(coinName: string): Promise<boolean> {
        const gpus = this.GPUs;

        for (let i = 0; i < gpus.length; i++) {
            const gpu = gpus[i];
            const gpuConfigs = this.coins[coinName].gpuConfigs;
            const config = gpuConfigs[gpu.uuid] ? gpuConfigs[gpu.uuid] : gpuConfigs[gpu.model];

            if (!config) {
                debug(`can't continue setting current coin to ${coinName}: no config found for ${gpu.model}`);
                if (!this.currentCoin) return false;

                // returning current configs to the cards
                for (let j = i - 1; j > 0; j--) {
                    const gpu = gpus[j];
                    const gpuConfigs = this.coins[this.currentCoin].gpuConfigs;
                    const config = gpuConfigs[gpu.uuid] ? gpuConfigs[gpu.uuid] : gpuConfigs[gpu.model];
                    if (!config) return false;
                    await gpu.setup(config);
                }

                return false;
            }

            await gpu.setup(config);
        }

        return true;
    }

    private static async readConfig(): Promise<Config> {
        return JSON.parse(await readFile(__dirname + '/../config.json', {encoding: 'utf8'}));
    }
}