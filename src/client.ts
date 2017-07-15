#!/usr/bin/env node

import 'source-map-support/register';
import * as fs from "fs";
import * as os from "os";
import * as TarGz from 'tar.gz';
import * as util from "util";
import * as Table from 'cli-table2';
import * as colors from 'colors';
import * as moment from 'moment';
import {Redis} from './redis';
import {IStats} from './node';
import {IMinerConfig} from "../interfaces/i_miner";

const readFile = util.promisify(fs.readFile);
const stat = util.promisify(fs.stat);

const MINERS_DIR = __dirname + '/../miners/';

interface Stats {
    [name: string]: { timestamp: number, info: IStats }
}

export class Client {
    protected redis: Redis;

    constructor() {
        const config = JSON.parse(fs.readFileSync(__dirname + '/../config.json', {encoding: 'utf8'}));
        this.redis = new Redis({
            host: config.redis.host,
            port: config.redis.port,
            myName: os.hostname()
        });
    }

    public async uploadCoin(name: string, path: string): Promise<void> {
        const coinConfig = JSON.parse(await readFile(path, {encoding: 'utf8'}));
        await this.redis.updateCoin(name, coinConfig);

    }

    public async uploadMiner(name: string, path: string, minerPath?: string): Promise<void> {
        const minerConfig: IMinerConfig = JSON.parse(await readFile(path, {encoding: 'utf8'}));

        if (minerPath) {
            const fsStat: fs.Stats = await stat(minerPath);
            if (fsStat.isDirectory()) {
                const binaryPath = await this.targzDirectory(name, minerPath);
                minerConfig.fileType = 'tgz';
                await this.redis.updateMiner(name, minerConfig, binaryPath);
            } else if (fsStat.isFile()){
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
            const read = targz().createReadStream(path);
            const write = fs.createWriteStream(newArchivePath);
            read.pipe(write);
            read.on('error', reject);
            write.on('error', reject);
            write.on('finish', () => resolve(newArchivePath));
        }) as Promise<string>;
    }

    public async setCurrentCoin(name: string, nodes?: string[]): Promise<void> {
        await this.redis.setCurrentCoin(name, nodes);
    }

    public async showStats(full: boolean = true): Promise<void> {
        const rawStats = await this.redis.getStats();
        let stats: Stats = {};

        Object.keys(rawStats).forEach(name => {
            stats[name] = {timestamp: rawStats[name].timestamp, info: JSON.parse(rawStats[name].json)};
            stats[name].info.coinTime = moment.duration(stats[name].info.coinTime).humanize();
            stats[name].info.uptime = moment.duration((stats[name].info.uptime as number) * 1000).humanize()
        });
        !full ? this.briefTable(stats) : this.fullTable(stats);
    }

    protected briefTable(stats: Stats): void {
        const table = new Table({
            head: ['Hostname', 'IP', 'Coin', 'CPU', 'GPU#', 'Hashrate', 'Mining time', 'Uptime', 'Freshness sec.']
            // , colWidths: [100, 200]
        });
        Object.keys(stats).forEach(name => {
            const info = stats[name].info;
            const d = Math.round((Date.now() - stats[name].timestamp) / 1000);
            table.push([name, info.ip, info.coin, info.cpu, info.gpuN, info.hashrate, info.coinTime, info.uptime, d]);
        });
        console.log(table.toString());
    }

    protected fullTable(stats: Stats): void {
        const table = new Table({
            head: [
                {colSpan: 2, content: 'Hostname'},
                'IP',
                'Coin',
                'CPU',
                'GPU Total',
                'Hashrate',
                'Mining time',
                'Uptime',
                'Freshness sec.'
            ],
            // border: []
        });

        Object.keys(stats).forEach(name => {
            const info = stats[name].info;
            const d = Math.round((Date.now() - stats[name].timestamp) / 1000);
            table.push([
                {colSpan: 2, content: name},
                info.ip,
                info.coin,
                info.cpu,
                info.gpuN,
                info.hashrate,
                info.coinTime,
                info.uptime,
                d
            ]);
            table.push([
                'GPU#',
                'Model',
                'Temperature',
                'GPU Load %',
                'Mem IO Load %',
                'GPU Clocks',
                'Mem Clocks',
                'Fan speed',
                'Wh',
                'Hashrate'
            ].map(head => colors.green(head)));
            info.gpuDetails.forEach((gpu, id) => {
                table.push([
                    id,
                    info.gpuNames[id],
                    gpu.temperature,
                    gpu.gpuLoad,
                    gpu.memLoad,
                    gpu.gpuClock,
                    gpu.memClock,
                    gpu.fanSpeed,
                    gpu.powerDraw,
                    info.gpuHashrates[id]
                ]);
            });
        });
        console.log(table.toString());
    }

    public async removeDeadNode(name: string): Promise<void> {
        await this.redis.removeDeadNode(name);
    }
}

