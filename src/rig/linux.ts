/**
 * Created by alex on 11.07.17.
 */

import 'source-map-support/register';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as targz from 'tar.gz';
import * as Bluebird from 'bluebird';
import {NVidia} from "../nvidia";
import {NVidiaGPU} from "../gpu/nvidia_gpu";
import {IRig, OS} from "../../interfaces/i_rig";
import {IGPU} from "../../interfaces/i_gpu";
import {ICoinConfig, ICoinList} from "../../interfaces/i_coin";
import {IMinerConfig, IMinerList} from "../../interfaces/i_miner";
import {Readable} from "stream";

const debug = require('debug')('miner:linux');

const writeFile: any = Bluebird.promisify(fs.writeFile);
const readFile: any = Bluebird.promisify(fs.readFile);
const readdir: any = Bluebird.promisify(fs.readdir);
const access: any = Bluebird.promisify(fs.access);
const mkdir: any = Bluebird.promisify(fs.mkdir);
const chmod: any = Bluebird.promisify(fs.chmod);

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
        return os.cpus()[0].model.replace(/\s{2,}/gi, ' ');
    }

    public get uptime(): number {
        return os.uptime();
    }

    public get ip(): string {
        const ifaces = os.networkInterfaces();
        const ifaceNames = Object.keys(ifaces).filter(key => key[0] !== 'l' || key[1] !== 'o');
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
        const lightDMConfig = __dirname + '/../../templates/static/lightdm.conf';
        let lightDMConfText: string = await readFile(lightDMConfig, {encoding: 'utf8'});

        lightDMConfText = lightDMConfText.replace(/\${dirname}/ig, path.resolve(__dirname + '/../..'));
        await writeFile(LIGHT_DM_CONFIG_PATH, lightDMConfText);
    }

    public async updateCoin(name: string, config: ICoinConfig): Promise<void> {
        await writeFile(CONFIG_COINS_PATH + name, JSON.stringify(config, null, 2));
    }

    public async updateMiner(name: string, config: IMinerConfig, bin: Buffer): Promise<void> {
        await writeFile(CONFIG_MINERS_PATH + name, JSON.stringify(config, null, 2));
        if (config.fileType === 'binary') {
            if (!(await this.checkDir(MINERS_PATH + name))) await mkdir(MINERS_PATH + name);
            await writeFile(MINERS_PATH  + name + path.sep + config.executable, bin);
            await chmod(MINERS_PATH  + name + path.sep + config.executable, 755);
        } else if (config.fileType === 'tgz') {
            await this.untgzBuffer(name, bin);
        }
    }

    protected checkDir(path: string): Promise<boolean> {
        return access(path)
            .then(() => {
                debug(`dir ${path} exist`);
                return true;
            })
            .catch(() => {
                debug(`dir ${path} does not exists`);
                return false;
            });
    }

    protected untgzBuffer(name: string, bin: Buffer): Promise<void> {
        return new Promise((resolve, reject) => {
            debug(`Is buffer: ${Buffer.isBuffer(bin)}`);
            debug(`Buffer length is: ${bin.length}`);
            // const readStream = fs.createReadStream(bin);
            const readStream = new Readable();
            readStream._read = () => {};
            readStream.push(bin);
            const writeStream = targz().createWriteStream(MINERS_PATH + name);
            debug(`untargziping to ${MINERS_PATH + name}`);
            readStream.pipe(writeStream);

            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
            readStream.on('error', reject);
            setImmediate(() => {readStream.push(null)});
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