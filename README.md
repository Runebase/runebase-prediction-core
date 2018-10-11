# runebaseprediction-core

## Wiki
For more information, visit our wiki page: [https://runebasepredictionproject.github.io/wiki/](https://runebasepredictionproject.github.io/wiki/)

## Architecture Flowchart
![Architecture Flowchart](https://github.com/runebase/runebase-prediction-core/blob/master/architecture_flowchart.png)

## Running Tests
### Docker Environment Setup
1. Download Docker:
- Mac: https://store.docker.com/editions/community/docker-ce-desktop-mac
- Windows: https://store.docker.com/editions/community/docker-ce-desktop-windows
2. In project root directory, run script:
```
./run_docker.sh
```
3. After the Dockerfile builds, you should see a new command line which is Debian (Jessie) with Node installed. All project files will automatically be copied over to the Docker container. All you need to do to test is:
```
truffle test
```

### Local Machine Environment Setup
1. Install Node JS 8.12.0 minimum: Either with install package or via package manager: https://nodejs.org/en/download/
2. Install truffle (currently 4.0.0-beta.2):
```
npm install -g truffle@^4.0.0-beta.2
```
3. Run the NPM package.json script:
```
npm install
```
4. Start truffle dev environment:
```
truffle develop
```
5. Run test in truffle dev command line:
```
test
```
6. (Optional) If you want to see the logs from the test, open a new terminal window and:
```
truffle develop --log
```

## Compile Contracts

```
./compile_all.sh

```

## Contract Deployement (Ubuntu 16.04)

### Install Solc

```
sudo add-apt-repository ppa:ethereum/ethereum
sudo apt-get update
sudo apt-get install solc

```
### Install Golang

```
sudo add-apt-repository ppa:longsleep/golang-backports
sudo apt-get update
sudo apt-get install golang-go

```

### Install Solar

https://github.com/runebase/solar

~~go get -u github.com/runebase/solar/cli/solar ~~

~~go get -u github.com/ethgamble/solar/cli/solar~~

```

go get -u github.com/bobpepers/solar/cli/solar
export PATH=$PATH:/home/bago/go/bin:$GOPATH/bin

```


### Install Cargo

```
sudo apt-get install curl
curl -sSf https://static.rust-lang.org/rustup.sh | sh
export PATH=$PATH:/home/bago/.cargo/bin

```


### Install Ethabi

```
cargo install ethabi-cli
export PATH=$PATH:/home/bago/.cargo/bin

```

### Token

#### Deploy

```
deployed using QT wallet
use build/RunebasePredictionToken.bin
use build/RunebasePredictionToken.abi  

```
#### issue the tokens

```
placeholder

```

#### Token Contract Address

```
testnet = 66cf6409b12e09d9d16395d2f0b224e56c3dc3a2
mainnet = f41619e2f259c4d9310658a89d0924ac35c82491

```

### AddressManager
```
Runebase testnet sender address = 5Unw8m3aTBhJADttnoeJncKxhRstbbw9LX 
Runebase testnet sender address = RTgMnAHJuMyEgzsdgjwi7WDuz3eS4mM3QN 

```
5Unw8m3aTBhJADttnoeJncKxhRstbbw9LX = Runebase sender address

```
solar deploy contracts/storage/AddressManager.sol --qtum_rpc=http://user:pass@localhost:19432 --qtum_sender=5Unw8m3aTBhJADttnoeJncKxhRstbbw9LX

```

testnet:
```
      "binhash": "d7e086e5e9feb2f20005aa0631e499c7b99f7755ba82087f1c3c70acea3bbc5d",
      "name": "AddressManager",
      "deployName": "contracts/storage/AddressManager.sol",
      "address": "f2265dc9205fee127ae09a04bbf6a2f9fc2cb492",
      "txid": "b25308c5b53853609244e5bc6c2504079a080ccea8f55bc7e41f4d2cafec2733",
      "createdAt": "2018-10-02T09:40:05.955777997+02:00",
      "sender": "5Unw8m3aTBhJADttnoeJncKxhRstbbw9LX",
      "senderHex": "21b87c216a9693fb16783e870d2a2b7ae0da4018"
```
      
mainnet:
```
      "binhash": "d7e086e5e9feb2f20005aa0631e499c7b99f7755ba82087f1c3c70acea3bbc5d",
      "name": "AddressManager",
      "deployName": "contracts/storage/AddressManager.sol",
      "address": "cd01ff321a78256345315de4869c41594b20b077",
      "txid": "a341bc6f412544501ee991d0fb356816e36145c791a9da31ddd512c7275bde72",
      "createdAt": "2018-10-06T19:23:23.353608474+02:00",
      "confirmed": false,
      "sender": "RTgMnAHJuMyEgzsdgjwi7WDuz3eS4mM3QN",
      "senderHex": "c9d3edd4a2758bc32e1080f770ff50fc73327c12"
```

### EventFactory

6c3a5cc8ac3df54a79207846a450505e1c56e446 = Address Manager Constructor (AddressManager Contract Address)
5Unw8m3aTBhJADttnoeJncKxhRstbbw9LX = Runebase sender address

```
solar deploy contracts/events/EventFactory.sol --qtum_rpc=http://user:pass@localhost:19432 --qtum_sender=5Unw8m3aTBhJADttnoeJncKxhRstbbw9LX '["f2265dc9205fee127ae09a04bbf6a2f9fc2cb492"]'

```

testnet:
```
      "binhash": "74b3e4594608370be95444850820421cbe706733103ba1c9b056fb007f4b2898",
      "name": "EventFactory",
      "deployName": "contracts/events/EventFactory.sol",
      "address": "d729144d12bc32d3bc8e90623bc988574ea9288a",
      "txid": "0cd18efcad8aa2254e6bf4f9aafb77f84f24775eb53841938d9acd885e477b2c",
      "createdAt": "2018-10-02T09:41:39.33774995+02:00",
      "sender": "5Unw8m3aTBhJADttnoeJncKxhRstbbw9LX",
      "senderHex": "21b87c216a9693fb16783e870d2a2b7ae0da4018"
``` 

mainnet:
```
      "binhash": "74b3e4594608370be95444850820421cbe706733103ba1c9b056fb007f4b2898",
      "name": "EventFactory",
      "deployName": "contracts/events/EventFactory.sol",
      "address": "a3be09721812b9039b83a2b0404eb47c64e48644",
      "txid": "8d783f1cd4073979777c874927bbe0d755947fe316dc4cdf074835fbfab707cf",
      "createdAt": "2018-10-06T19:29:28.590287093+02:00",
      "sender": "RTgMnAHJuMyEgzsdgjwi7WDuz3eS4mM3QN",
      "senderHex": "c9d3edd4a2758bc32e1080f770ff50fc73327c12"
```
 
### OracleFactory

```
solar deploy contracts/oracles/OracleFactory.sol --qtum_rpc=http://user:pass@localhost:19432 --qtum_sender=5Unw8m3aTBhJADttnoeJncKxhRstbbw9LX '["f2265dc9205fee127ae09a04bbf6a2f9fc2cb492"]'

```

testnet:
```
      "binhash": "f3bb22606fb26e36fb5dc0b79c655ca6f3e729447a0ef548893a0aa734c61af1",
      "name": "OracleFactory",
      "deployName": "contracts/oracles/OracleFactory.sol",
      "address": "871f58dc7b9bdd3c5a8885c36b1c17a4fcc1b96a",
      "txid": "0bdd8b83083b39a17eb02c8313b025d3670dc9100d22fa3967d701b039d8079c",
      "createdAt": "2018-10-02T09:47:13.189818074+02:00",
      "sender": "5Unw8m3aTBhJADttnoeJncKxhRstbbw9LX",
      "senderHex": "21b87c216a9693fb16783e870d2a2b7ae0da4018"
 ```
mainnet:
```
      "binhash": "f3bb22606fb26e36fb5dc0b79c655ca6f3e729447a0ef548893a0aa734c61af1",
      "name": "OracleFactory",
      "deployName": "contracts/oracles/OracleFactory.sol",
      "address": "86743cdcfb3907ebb4365d1425967fdeebf00c48",
      "txid": "a6cfd39702563ab69ce0c45cfaee65aac06600707f0e748cdeed38904175fd4c",
      "createdAt": "2018-10-06T19:34:06.252690936+02:00",
      "sender": "RTgMnAHJuMyEgzsdgjwi7WDuz3eS4mM3QN",
      "senderHex": "c9d3edd4a2758bc32e1080f770ff50fc73327c12"
```

### Set Oracle & Eventfactory address

```
Use send to contract with address manager abi & address manager address
+ setCurrentEventFactoryIndex -> 5


```
