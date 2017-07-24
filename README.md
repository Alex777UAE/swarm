# swarm

> It's early alpha version, please join up to grow it faster

   * TypeScript decentralized modular GPU mining RIGs management. 
   * Propagated coin & miner (both configs and binaries) update across all swarm nodes. 
   * Redis based communication channels.
   * Limited support for single mode (no redis needed) for testing configs "offline".
   * Pre-configured set of coins and algorithm => miner sets for optimal performance on GTX1070.  

Currently supported OS:

- [x] Linux
- [ ] Windows
- [ ] MacOS
- [ ] *BSD

GPU Brands:

- [x] NVidia 
- [ ] AMD

Management interfaces:

- [x] CLI
- [ ] Web
- [ ] Telegram Bot

## Content

    - Installing
    - Coins
    - Miners
    - GPUs
    - Statistics, monitoring and remote control

### Installing

Please install **lubuntu 17.04** with ligthdm window manager.

Following commands should be executed under root account or with sudo. 

On Redis Server node (may be joined with one of the the RIG nodes)
```
apt install redis-server

sed -i 's/bind 127.0.0.1/bind 0.0.0.0/' /etc/redis/redis.conf

systemctl enable redis-server

service redis-server start

ifconfig
```

Write down IP of the redis-server from ifconfig output.

And on all RIG nodes

```
apt install install software-properties-common screen

add-apt-repository ppa:graphics-drivers/ppa

apt update

apt install nvidia-384 nvidia-persistenced nvidia-opencl-dev nvidia-opencl-icd-384 nvidia-libopencl1-384 nvidia-cuda-toolkit nvidia-cuda-dev

apt install git

apt install npm

npm i -g n

n 8.1.4

apt remove npm

apt autoremove

cd /usr/local

git clone https://github.com/Alex777UAE/swarm.git
```

Edit config.json and define your redis IP address.

Then edit all data/coins and set your username/passwords, pool urls instead of ours or remove unnecessary.

Check the default `data/gpus/gtx1070` model GPU settings template and add one (please share) if your base model differs.

According to output of 
```
/usr/bin/nvidia-smi -i 0 --query-gpu=name --format=csv,noheader,nounits
```
and js expression

```javascript
"GeForce GTX 1070".replace('GeForce', '').replace(/\s+/g, '').toLowerCase()
```
in other words, 'GeForce' removed, spaces removed, lowercase.

This way "GeForce GTX 1070" becomes `gtx1070`.


On first node

```
./bin/setup -r
```

On all other nodes

```
./bin/setup
```

It will setup all coins, miners and gpus configs into the redis, add /usr/local/swarm/bin into 
PATH variable and create /etc/rc.local with required startup actions.

After this all you can execute 

```
/etc/rc.local

screen -x
```

### Security

You should close access to the Redis server with firewall or make it available only on LAN.

### Usage

#### Coins

##### List of available coins
```
coin-list
```
Example output:
```

┌─────────────┬─────────────┬───────────────────────────────────────┬───────┬────────────────────────────────────────┬──────────┬────────────┐
│ Coin        │ Algorithm   │ Pool URL                              │ Port  │ Username                               │ Password │ Workername │
├─────────────┼─────────────┼───────────────────────────────────────┼───────┼────────────────────────────────────────┼──────────┼────────────┤
│ bcn         │ cryptonight │ bcn.pool.minergate.com                │ 45550 │ info@hosting.ua                        │ x        │            │
├─────────────┼─────────────┼───────────────────────────────────────┼───────┼────────────────────────────────────────┼──────────┼────────────┤
│ xmr         │ cryptonight │ xmr.pool.minergate.com                │ 45560 │ info@hosting.ua                        │ x        │            │
├─────────────┼─────────────┼───────────────────────────────────────┼───────┼────────────────────────────────────────┼──────────┼────────────┤
│ zec         │ equihash    │ europe.equihash-hub.miningpoolhub.com │ 20570 │ host                                   │ x        │            │
├─────────────┼─────────────┼───────────────────────────────────────┼───────┼────────────────────────────────────────┼──────────┼────────────┤
│ zen         │ equihash    │ zen.suprnova.cc                       │ 3618  │ host777                                │ x        │ default    │
├─────────────┼─────────────┼───────────────────────────────────────┼───────┼────────────────────────────────────────┼──────────┼────────────┤
│ kmd         │ equihash    │ kmd.suprnova.cc                       │ 6250  │ host777                                │ x        │ default    │
├─────────────┼─────────────┼───────────────────────────────────────┼───────┼────────────────────────────────────────┼──────────┼────────────┤
│ hush        │ equihash    │ hush.suprnova.cc                      │ 4048  │ host777                                │ x        │ default    │
├─────────────┼─────────────┼───────────────────────────────────────┼───────┼────────────────────────────────────────┼──────────┼────────────┤
│ music       │ ethash      │ europe.ethash-hub.miningpoolhub.com   │ 20585 │ host                                   │ x        │            │
├─────────────┼─────────────┼───────────────────────────────────────┼───────┼────────────────────────────────────────┼──────────┼────────────┤
│ eth         │ ethash      │ europe.ethash-hub.miningpoolhub.com   │ 20535 │ host                                   │ x        │            │
├─────────────┼─────────────┼───────────────────────────────────────┼───────┼────────────────────────────────────────┼──────────┼────────────┤
│ ubq         │ ethash      │ eu.ubiqpool.io                        │ 8888  │ 0xa9e9d706fcfc2d1bcd6b4456bc82f998ce3… │ x        │            │
├─────────────┼─────────────┼───────────────────────────────────────┼───────┼────────────────────────────────────────┼──────────┼────────────┤
│ etc         │ ethash      │ europe.ethash-hub.miningpoolhub.com   │ 20555 │ host                                   │ x        │            │
├─────────────┼─────────────┼───────────────────────────────────────┼───────┼────────────────────────────────────────┼──────────┼────────────┤
│ exp         │ ethash      │ europe.ethash-hub.miningpoolhub.com   │ 20565 │ host                                   │ x        │            │
├─────────────┼─────────────┼───────────────────────────────────────┼───────┼────────────────────────────────────────┼──────────┼────────────┤
│ grs         │ groestl     │ europe1.groestlcoin.miningpoolhub.com │ 20486 │ host                                   │ x        │            │
├─────────────┼─────────────┼───────────────────────────────────────┼───────┼────────────────────────────────────────┼──────────┼────────────┤
│ lbc         │ lbry        │ lbry.suprnova.cc                      │ 6256  │ host777                                │ x        │ default    │
├─────────────┼─────────────┼───────────────────────────────────────┼───────┼────────────────────────────────────────┼──────────┼────────────┤
│ vtc         │ lyra2v2     │ hub.miningpoolhub.com                 │ 20507 │ host                                   │ x        │            │
├─────────────┼─────────────┼───────────────────────────────────────┼───────┼────────────────────────────────────────┼──────────┼────────────┤
│ mona        │ lyra2v2     │ mona.suprnova.cc                      │ 2995  │ host777                                │ x        │ default    │
├─────────────┼─────────────┼───────────────────────────────────────┼───────┼────────────────────────────────────────┼──────────┼────────────┤
│ xzc         │ lyra2z      │ hub.miningpoolhub.com                 │ 20581 │ host                                   │ x        │            │
├─────────────┼─────────────┼───────────────────────────────────────┼───────┼────────────────────────────────────────┼──────────┼────────────┤
│ dgb-groestl │ myr-gr      │ hub.miningpoolhub.com                 │ 20499 │ host                                   │ x        │            │
├─────────────┼─────────────┼───────────────────────────────────────┼───────┼────────────────────────────────────────┼──────────┼────────────┤
│ myr-groestl │ myr-gr      │ hub.miningpoolhub.com                 │ 20479 │ host                                   │ x        │            │
├─────────────┼─────────────┼───────────────────────────────────────┼───────┼────────────────────────────────────────┼──────────┼────────────┤
│ ftc         │ neoscrypt   │ hub.miningpoolhub.com                 │ 20510 │ host                                   │ x        │            │
├─────────────┼─────────────┼───────────────────────────────────────┼───────┼────────────────────────────────────────┼──────────┼────────────┤
│ sc          │ sia         │ eu.siamining.com                      │ 3333  │ 92a2db0a25e729dcd6738adb975a97e018776… │ x        │            │
├─────────────┼─────────────┼───────────────────────────────────────┼───────┼────────────────────────────────────────┼──────────┼────────────┤
│ sib         │ sib         │ sib.suprnova.cc                       │ 3458  │ host777                                │ x        │ default    │
├─────────────┼─────────────┼───────────────────────────────────────┼───────┼────────────────────────────────────────┼──────────┼────────────┤
│ myr-skein   │ skein       │ hub.miningpoolhub.com                 │ 20528 │ host                                   │ x        │            │
├─────────────┼─────────────┼───────────────────────────────────────┼───────┼────────────────────────────────────────┼──────────┼────────────┤
│ dgb-skein   │ skein       │ hub.miningpoolhub.com                 │ 20527 │ host                                   │ x        │            │
└─────────────┴─────────────┴───────────────────────────────────────┴───────┴────────────────────────────────────────┴──────────┴────────────┘
```

##### Remove coin
```
coin-del eth
```
Example output
```
Done
```

##### Add or update coin
```
coin-set ftc ./data/coins/ftc
```
Where:

   ftc - is a coin abbreviation lowercase, in case FTC - Feathercoin
   
   ./data/coins/ftc is a path to JSON config of the coin
   
```json
{
  "algorithm": "neoscrypt",
  "poolURL": "hub.miningpoolhub.com",
  "port": 20510,
  "username": "host",
  "password": "x"
}
```
Algorithm might be used by miner wrapper, like ccminer and IS used by GPU configuration code to match up 
frequency/power/fanspeed/etc settings. See GPU section.


#### Miners

##### List of available miners
```
miner-list
```
Example output
```
┌────────────────────────────────┬──────────────┬─────────────────┐
│ Miner                          │ Wrapper type │ Executable path │
├────────────────────────────────┼──────────────┼─────────────────┤
│ ccminer-sp-nicehash-1.5.80-git │ ccminer      │ ccminer         │
├────────────────────────────────┼──────────────┼─────────────────┤
│ ccminer-sp-1.5.81              │ ccminer      │ ccminer         │
├────────────────────────────────┼──────────────┼─────────────────┤
│ ccminer-tpruvot-2.0            │ ccminer      │ ccminer         │
├────────────────────────────────┼──────────────┼─────────────────┤
│ ccminer-cryptonight-2.03       │ ccminer      │ ccminer         │
├────────────────────────────────┼──────────────┼─────────────────┤
│ ccminer-alexis-1.0             │ ccminer      │ ccminer         │
├────────────────────────────────┼──────────────┼─────────────────┤
│ ethminer-0.12.0.dev0           │ ethminer     │ ethminer        │
├────────────────────────────────┼──────────────┼─────────────────┤
│ ewbf-0.3.4b                    │ ewbf         │ miner           │
└────────────────────────────────┴──────────────┴─────────────────┘
```

##### Remove miner
```
miner-del ethminer-0.12.0.dev0 
```

Example output
```
Done
```

##### Upload and propagate miner
```
miner-upload ccminer-klaust-8.09 ./data/miners/ccminer-klaust-8.09 ./miners/ccminer-klaust-8.09
```   

Where:

   ccminer-klaust-8.09 - is a miner name, which is used in GPU configuration
    
   ./data/miners/ccminer-klaust-8.09 - path to JSON configuration
    
   ./miners/ccminer-klaust-8.09 - directory with miner binary (tgz used to distribute) or binary itself
    

```json
{
  "fileType": "",
  "sha256sum": "",
  "type": "ccminer",
  "executable": "ccminer"
}
```

Where:

   fileType - tgz or binary (auto-set by client software)
   
   sha256sum - sha256 sum (auto-set by client software)
   
   type - type of wrapper, currently supported : **ccminer | claymore | ethminer | ewbf**
   
   executable - executable name which you are uploading right now, ex. ccminer, ethminer, miner... etc
    

#### GPUs
##### List of GPUs in swarm
   It will list available GPU model templates or GPU UUIDs which has individual settings. 
```
./bin/gpu-list
```   

Example output:
```
┌──────────────────────────────────────────┬──────────┬───────────┐
│ UUID                                     │ Hostname │ GPU Index │
├──────────────────────────────────────────┼──────────┼───────────┤
│ gpu-fea9dda8-eb63-18a3-a1d9-ef896a849b21 │ L314     │ 2         │
├──────────────────────────────────────────┼──────────┼───────────┤
│ gpu-b3996f0e-02e9-9ebb-9b92-7916a7b917ac │ L314     │ 1         │
├──────────────────────────────────────────┼──────────┼───────────┤
│ gpu-87259284-bbac-a56a-0fd4-912a02716d57 │ L314     │ 0         │
├──────────────────────────────────────────┼──────────┼───────────┤
│ gpu-116e3ba9-321d-792e-3987-3a3c8ffe9fb6 │ J503     │ 1         │
├──────────────────────────────────────────┼──────────┼───────────┤
│ gpu-f624b6f8-8eb5-72cc-3aad-ac67609e1816 │ H617     │ 0         │
├──────────────────────────────────────────┼──────────┼───────────┤
│ gpu-ba14657c-e239-f5e6-f8ec-292d4d347e81 │ G312     │ 1         │
├──────────────────────────────────────────┼──────────┼───────────┤
│ gpu-d0f1cb97-6757-252e-c55e-692abc778900 │ G312     │ 4         │
├──────────────────────────────────────────┼──────────┼───────────┤
│ gpu-27033337-be6e-210a-4c71-11a9d11363a5 │ G312     │ 3         │
├──────────────────────────────────────────┼──────────┼───────────┤
│ gpu-b52e0c91-9a99-42b9-f10f-a33d800fcc36 │ G312     │ 0         │
├──────────────────────────────────────────┼──────────┼───────────┤
│ gpu-9c01d0fa-9380-93d6-ab88-ccd65b2462d0 │ G312     │ 2         │
├──────────────────────────────────────────┼──────────┼───────────┤
│ gtx1070                                  │          │           │
└──────────────────────────────────────────┴──────────┴───────────┘
```

Also you can get specific GPU settings (if they were altered) or GPU model settings template.

```
./bin/gpu-list gpu-f624b6f8-8eb5-72cc-3aad-ac67609e1816
```

Example output:

```
┌─────────────┬────────┬────────┬───────────┬─────────────┬────────────────────────────────┐
│ algorithm   │ gpu oc │ mem oc │ fan speed │ power limit │ miner                          │
├─────────────┼────────┼────────┼───────────┼─────────────┼────────────────────────────────┤
│ equihash    │ 115    │ 1100   │ 90        │ 197         │ ewbf-0.3.4b                    │
└─────────────┴────────┴────────┴───────────┴─────────────┴────────────────────────────────┘
```

##### Removing specific settings, and resetting GPU to model defaults 
   
   It will set gpu&mem clocks, fan speed, power limit to the GPU without stopping current mining process
   and remove GPU settings from redis.
   
```bash
gpu-del gpu-87259284-bbac-a56a-0fd4-912a02716d57
```

Example output:

```
Done
```


##### Setting GPU raw config
   
```bash
gpu-set gtx1070 ./data/gpus/gtx1070
```    
    or specific GPU by it's UUID (lowercase)

```bash
gpu-set gpu-87259284-bbac-a56a-0fd4-912a02716d57 ./data/gpus/gpu-87259284-bbac-a56a-0fd4-912a02716d57
``` 

Where:

   gtx1070/gpu-87259284-bbac-a56a-0fd4-912a02716d57 - model name or UUID 
   
   second param - path to JSON config

GPU model template might look like this:
```json
{
  "equihash": {
    "fanSpeedTarget": 80,
    "memClockOffset": 1100,
    "gpuClockOffset": 115,
    "powerLimit": 197,
    "miner": "ewbf-0.3.4b"
  },
  "neoscrypt": {
    "fanSpeedTarget": 80,
    "memClockOffset": 1100,
    "gpuClockOffset": 115,
    "powerLimit": 197,
    "miner": "ccminer-sp-1.5.81"
  },
  "groestl": {
    "fanSpeedTarget": 80,
    "memClockOffset": 0,
    "gpuClockOffset": 115,
    "powerLimit": 197,
    "miner": "ccminer-sp-1.5.81"
  },
  "myr-gr": {
    "fanSpeedTarget": 80,
    "memClockOffset": 1100,
    "gpuClockOffset": 115,
    "powerLimit": 197,
    "miner": "ccminer-sp-nicehash-1.5.80-git"
  },
  "dmd-gr": {
    "fanSpeedTarget": 80,
    "memClockOffset": 1100,
    "gpuClockOffset": 115,
    "powerLimit": 197,
    "miner": "ccminer-sp-1.5.81"
  },
  "sia": {
    "fanSpeedTarget": 80,
    "memClockOffset": 1100,
    "gpuClockOffset": 115,
    "powerLimit": 197,
    "miner": "ccminer-alexis-1.0"
  },
  "sib": {
    "fanSpeedTarget": 80,
    "memClockOffset": 1100,
    "gpuClockOffset": 115,
    "powerLimit": 197,
    "miner": "ccminer-alexis-1.0"
  },
  "lyra2v2": {
    "fanSpeedTarget": 80,
    "memClockOffset": 1100,
    "gpuClockOffset": 115,
    "powerLimit": 197,
    "miner": "ccminer-alexis-1.0"
  },
  "decred": {
    "fanSpeedTarget": 80,
    "memClockOffset": 1100,
    "gpuClockOffset": 115,
    "powerLimit": 197,
    "miner": "ccminer-alexis-1.0"
  },
  "lbry": {
    "fanSpeedTarget": 80,
    "memClockOffset": 1100,
    "gpuClockOffset": 115,
    "powerLimit": 197,
    "miner": "ccminer-alexis-1.0"
  },
  "skein": {
    "fanSpeedTarget": 80,
    "memClockOffset": 1100,
    "gpuClockOffset": 115,
    "powerLimit": 197,
    "miner": "ccminer-alexis-1.0"
  },
  "lyra2z": {
    "fanSpeedTarget": 80,
    "memClockOffset": 1100,
    "gpuClockOffset": 115,
    "powerLimit": 197,
    "miner": "ccminer-tpruvot-2.0"
  },
  "cryptonight": {
    "fanSpeedTarget": 80,
    "memClockOffset": 1100,
    "gpuClockOffset": 115,
    "powerLimit": 197,
    "miner": "ccminer-cryptonight-2.03"
  },
  "ethash": {
    "fanSpeedTarget": 75,
    "memClockOffset": 1100,
    "gpuClockOffset": -200,
    "powerLimit": 140,
    "miner": "ethminer-0.12.0.dev0"
  }
}
```

For specific UUID you can omit some algorithm settings and they will be used from GPU model template settings.

For example, for specific UUID  
```json
{
  "ethash": {
    "fanSpeedTarget": 75,
    "memClockOffset": 1100,
    "gpuClockOffset": -200,
    "powerLimit": 140,
    "miner": "ethminer-0.12.0.dev0"
  }
}
```

##### Reconfiguring specific GPU through CLI commands
   
```
gpu-update HOSTNAME -i cardId [-a algorithm] [-g gpuClocksOffs] [-m memClocksOffs] [-p powerLimit] [-f fanSpeed]
	control GPU cardId on HOSTNAME

Supported commands:

	-i card index, ex. 0
	-a algorithm name, if omitted - for all algorithms
	-g gpu clock offset, ex. 110 or -200
	-m mem clock offset, ex. 1100 or 0
	-p power limit in watts, ex. 195
	-f fan speed in percents, ex. 80


	ex. ./gpu-update F503 -i 0 -g-200 -a ethash
```

#### Statistics, monitoring and remote control

##### Stats
```
stats [-r|--full] [HOSTNAME]
        -r remove hostname from stats
        --full gives full info about all/HOSTNAME
```

##### Restart miner process / Reboot node

```
rig-remote <command> [-p params] [HOSTNAME]
	execute command on all nodes or only on HOSTNAME

Supported commands:
	restart - restarts current miner proccess
	reboot - reboot rig
```

## Versioning

Currently there is no versioning since a lot of things changes and needs to be tested across different remote nodes.

This git repo used as middle point for transferring code, sorry, should be fixed soon.
 

## Authors

* **AlexUAE777** - *Initial work* - [AlexUAE777](https://github.com/Alex777UAE)

See also the list of [contributors](https://github.com/Alex777UAE/swarm/graphs/contributors) who participated in this project.


## License

The MIT License (MIT)

Copyright (c) 2017 AlexUAE777

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Acknowledgments

* Inspired by kopiemtu 3.0 
* Web boilerplate - [Vortigern](https://github.com/barbar/vortigern.git) 
