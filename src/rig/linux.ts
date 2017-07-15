/**
 * Created by alex on 11.07.17.
 */

import 'source-map-support/register';
import * as os from 'os';
import * as fs from 'fs';
import * as util from 'util';
import * as targz from 'tar.gz';
import {NVidia} from "../nvidia";
import {NVidiaGPU} from "../gpu/nvidia_gpu";
import {IRig, OS} from "../../interfaces/i_rig";
import {IGPU} from "../../interfaces/i_gpu";
import {ICoinConfig, ICoinList} from "../../interfaces/i_coin";
import {IMinerConfig, IMinerList} from "../../interfaces/i_miner";

const writeFile = util.promisify(fs.writeFile);
const readFile = util.promisify(fs.readFile);
const readdir = util.promisify(fs.readdir);

const CONFIG_COINS_PATH = __dirname + '/../../configs/coins/';
const CONFIG_MINERS_PATH = __dirname + '/../../configs/miners/';
const MINERS_PATH = __dirname + '/../../miners/';
const LIGHT_DM_CONFIG_PATH = '/etc/lightdm/lightdm.conf';

export class Linux extends IRig {
    protected gpus: IGPU[] = [];
    protected nv: NVidia;

    constructor(private nvidiaSMIPath: string, private nvidiaSettingsPath: string) {
        super();
        this.nv = new NVidia(nvidiaSMIPath);
    }

    public get os(): OS {
        return 'linux';
    }

    public get hostname(): string {
        return os.hostname();
    }

    public get cpu(): string {
        return os.cpus()[0].model;
    }

    public get uptime(): number {
        return os.uptime();
    }

    public get ip(): string {
        const ifaces = os.networkInterfaces();
        const ifaceNames = Object.keys(ifaces).filter(key => key[1] !== 'l' || key[2] !== 'o');
        for (let i = 0; i < ifaceNames.length; i++) {
            const ifaceName = ifaceNames[i];
            for (let j = 0; j < ifaces[ifaceName].length; j++) {
                const ifaceDescription = ifaces[ifaceName][j];
                if (ifaceDescription.family === 'IPv4' && ifaceDescription.address) return ifaceDescription.address;
            }
        }
        throw new Error('No IP configured?');
    }

    public async getGPUs(): Promise<IGPU[]> {
        return this.gpus;
    }

    public async getLoad(): Promise<{cpu: number; mem: number}> {
        const cpuNum = os.cpus().length;
        const loadAvg = os.loadavg()[0];

        const osTotalMem = os.totalmem();
        const osFreeMem = os.freemem();

        return {cpu: Math.round(loadAvg/cpuNum), mem: Math.round(osFreeMem*100/osTotalMem)};
    }

    /*
     should initialize os data, all cards
     set some params, like sysctl etc
     todo multi-GPU support
     */
    public async init(): Promise<void> {
        if (!await this.nv.detect()) throw new Error('No GPU found!');

        const indexes = await this.nv.getIndexes();

        for (let i = 0; i < indexes.length; i++) {
            const idx = indexes[i];
            const nv = new NVidiaGPU(this.nvidiaSMIPath, this.nvidiaSettingsPath);
            await nv.init(idx);
            this.gpus.push(nv);
        }
        await Linux.installLightDMConfig();
    }

    public toJson(): string {
        return JSON.stringify({
            ip: this.ip,
            os: this.os
        });
    }

    protected static async installLightDMConfig(): Promise<void> {
        const lightDMConfText: string = await readFile(__dirname + '/../../templates/static/lightdm.conf', {encoding: 'utf8'});
        lightDMConfText.replace('${dirname}', __dirname + '/../scripts');
        await writeFile(LIGHT_DM_CONFIG_PATH, lightDMConfText);
    }

    public async updateCoin(name: string, config: ICoinConfig): Promise<void> {
        await writeFile(CONFIG_COINS_PATH + name, JSON.stringify(config));
    }

    public async updateMiner(name: string, config: IMinerConfig, bin: Buffer): Promise<void> {
        await writeFile(CONFIG_COINS_PATH + name, JSON.stringify(config));
        if (config.fileType === 'binary') {
            await writeFile(MINERS_PATH + name, bin);
        } else if (config.fileType === 'tgz') {
            await this.untgzBuffer(bin);
        }
    }

    protected untgzBuffer(bin: Buffer): Promise<void> {
        return new Promise((resolve, reject) => {
            const readStream = fs.createReadStream(bin);
            const writeStream = targz().createWriteStream(MINERS_PATH);
            readStream.pipe(writeStream);

            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
            readStream.on('error', reject);
        }) as Promise<any>;
    }

    public async loadMiners(): Promise<IMinerList> {
        return await Linux.loadJSONFiles(CONFIG_MINERS_PATH);
    }

    public async loadCoins(): Promise<ICoinList> {
        return await Linux.loadJSONFiles(CONFIG_COINS_PATH);
    }

    protected static async loadJSONFiles(dir: string): Promise<any> {
        const list = {};
        const files = await readdir(dir);

        for (let i = 0; i < files.length; i++) {
            const name = files[i];
            list[name] = JSON.parse(await readFile(dir + name,{encoding: 'utf8'}));
        }

        return list;
    }
}