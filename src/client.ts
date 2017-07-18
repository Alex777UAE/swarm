#!/usr/bin/env node

import 'source-map-support/register';
import * as fs from "fs";
import * as os from "os";
import * as TarGz from 'tar.gz';
import * as Table from 'cli-table2';
import * as colors from 'colors';
import * as moment from 'moment';
import * as util from 'util';
import {Redis} from './redis';
import {IStats, IAppConfig, SWITCH_FILE} from './node';
import {IMinerConfig} from "../interfaces/i_miner";
import * as path from "path";

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const stat = util.promisify(fs.stat);

const MINERS_DIR = __dirname + '/../miners/';

interface Stats {
    [name: string]: { timestamp: number, info: IStats }
}

export class Client {
    protected redis: Redis;
    protected config: IAppConfig;

    constructor() {
        const config = JSON.parse(fs.readFileSync(__dirname + '/../config.json', {encoding: 'utf8'}));
        this.config = config;
        this.redis = new Redis({
            host: config.redis.host,
            port: config.redis.port,
            myName: os.hostname(),
            onCommand: () => {
            } // to allow subscriber mode
        });
    }

    public async uploadCoin(name: string, path: string): Promise<void> {
        const coinConfig = JSON.parse(await readFile(path, {encoding: 'utf8'}));
        await this.redis.updateCoin(name, coinConfig);

    }

    public async uploadGPU(name: string, path: string): Promise<void> {
        const gpuConfig = JSON.parse(await readFile(path, {encoding: 'utf8'}));
        await this.redis.updateGPU(name, gpuConfig);

    }

    public async uploadMiner(name: string, path: string, minerPath?: string): Promise<void> {
        const minerConfig: IMinerConfig = JSON.parse(await readFile(path, {encoding: 'utf8'}));

        if (minerPath) {
            const fsStat: fs.Stats = await stat(minerPath);
            if (fsStat.isDirectory()) {
                const binaryPath = await this.targzDirectory(name, minerPath);
                minerConfig.fileType = 'tgz';
                await this.redis.updateMiner(name, minerConfig, binaryPath);
            } else if (fsStat.isFile()) {
                minerConfig.fileType = 'binary';
                await this.redis.updateMiner(name, minerConfig, minerPath);
            } else {
                throw new Error(`unsupported minerPath type: not a file or directory`);
            }
        } else {
            await this.redis.updateMiner(name, minerConfig);
        }
    }

    protected targzDirectory(name: string, path: string): Promise<string> {
        const newArchivePath = MINERS_DIR + name + '.tar.gz';
        return new Promise((resolve, reject) => {
            const targz = new TarGz({}, {fromBase: true});
            const read = targz.createReadStream(path);
            const write = fs.createWriteStream(newArchivePath);
            read.pipe(write);
            read.on('error', reject);
            write.on('error', reject);
            write.on('finish', () => resolve(newArchivePath));
        }) as Promise<string>;
    }

    public async setCurrentCoin(name?: string, nodes?: string[]): Promise<void> {
        if (!name) name = this.config.defaultCoin;
        if (this.config.mode === 'swarm')
            await this.redis.setCurrentCoin(name, nodes);
        else
            await writeFile(os.tmpdir() + path.sep + SWITCH_FILE, name, 'utf8');
    }

    public async showStats(full: boolean = true, hostname?: string): Promise<void> {
        const rawStats = await this.redis.getStats();
        let stats: Stats = {};

        Object.keys(rawStats).forEach(name => {
            if (hostname && hostname !== name) return;
            stats[name] = {timestamp: rawStats[name].timestamp, info: JSON.parse(rawStats[name].json)};
            stats[name].info.coinTime = moment.duration(stats[name].info.coinTime).humanize();
            stats[name].info.uptime = moment.duration((stats[name].info.uptime as number) * 1000).humanize()
        });
        !full ? this.briefTable(stats) : this.fullTable(stats);
        console.log(`Total GPUs: ${Object.keys(stats).reduce((total, n) => total + stats[n].info.gpuN, 0)}`);
    }

    protected briefTable(stats: Stats): void {
        const table = new Table({
            head: [
                'Hostname',
                'IP',
                'Coin',
                'CPU',
                'GPU#',
                'Hashrate',
                'Accept %',
                'Mining time',
                'Uptime',
                'Freshness sec.'
            ],
            colWidths: [21, 17, 6, 32, 15]
        });
        Object.keys(stats)
            .sort((a, b) => {
                if (stats[a].info.hashrate > stats[b].info.hashrate) {
                    return -1;
                } else if (stats[a].info.hashrate < stats[b].info.hashrate) {
                    return 1;
                }
                return 0;
            })
            .forEach(name => {
                const info = stats[name].info;
                const d = Math.round((Date.now() - stats[name].timestamp) / 1000);
                table.push([
                    name,
                    info.ip,
                    info.coin,
                    info.cpu,
                    info.gpuN,
                    info.hashrate,
                    (info.acceptPercent || 0).toFixed(2),
                    info.coinTime,
                    info.uptime,
                    d > 120 ? colors.red(d.toString()) : d
                ]);
            });
        console.log(table.toString());
    }

    protected fullTable(stats: Stats): void {
        const table = new Table({
            head: [
                'Hostname',
                'IP',
                'Coin',
                'CPU',
                'GPU Total',
                'Hashrate',
                'Accept %',
                'Mining time',
                'Uptime',
                'Freshness sec.'
            ],
            colWidths: [21, 17, 6, 32, 15]
        });

        Object.keys(stats).forEach(name => {
            const info = stats[name].info;
            const d = Math.round((Date.now() - stats[name].timestamp) / 1000);
            table.push([
                name,
                info.ip,
                info.coin,
                info.cpu,
                info.gpuN,
                info.hashrate,
                (info.acceptPercent || 0).toFixed(2),
                info.coinTime,
                info.uptime,
                d > 120 ? colors.red(d.toString()) : d
            ].map(rig => colors.bold(rig.toString())));
            table.push([
                'GPU#',
                'Model',
                'Temp',
                'GPU Load %',
                'Mem IO Load %',
                'Hashrate',
                'GPU Clocks',
                'Mem Clocks',
                'Fan speed',
                'Wh'
            ].map(head => colors.green(head)));
            info.gpuDetails.forEach((gpu, id) => {
                table.push([
                    id,
                    info.gpuNames[id],
                    gpu.temperature,
                    gpu.gpuLoad,
                    gpu.memLoad,
                    info.gpuHashrates[id],
                    gpu.gpuClock,
                    gpu.memClock,
                    gpu.fanSpeed,
                    gpu.powerDraw
                ]);
            });
        });
        console.log(table.toString());
    }

    public async removeDeadNode(name: string): Promise<void> {
        await this.redis.removeDeadNode(name);
    }

    public async command(name, params: string = '', hostname: string = ''): Promise<void> {
        await this.redis.command(name, params, hostname);
    }
}

