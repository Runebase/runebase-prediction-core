const web3 = global.web3;
const assert = require('chai').assert;
const bluebird = require('bluebird');
const BodhiToken = artifacts.require("./tokens/BodhiToken.sol");
const AddressManager = artifacts.require("./storage/AddressManager.sol");
const EventFactory = artifacts.require("./events/EventFactory.sol");
const TopicEvent = artifacts.require("./events/TopicEvent.sol");
const OracleFactory = artifacts.require("./oracles/OracleFactory.sol");
const CentralizedOracle = artifacts.require("./oracles/CentralizedOracle.sol");
const DecentralizedOracle = artifacts.require("./oracles/DecentralizedOracle.sol");
const BlockHeightManager = require('../helpers/block_height_manager');
const Utils = require('../helpers/utils');
const assertInvalidOpcode = require('../helpers/assert_invalid_opcode');

contract('DecentralizedOracle', function(accounts) {
    const blockHeightManager = new BlockHeightManager(web3);
    const getBlockNumber = bluebird.promisify(web3.eth.getBlockNumber);

    // These should match the decimals in the contract.
    const nativeDecimals = 8;
    const botDecimals = 8;

    const admin = accounts[0];
    const oracle = accounts[1];
    const user1 = accounts[2];
    const user2 = accounts[3];
    const user3 = accounts[4];
    const user4 = accounts[5];
    const user5 = accounts[6];
    const user6 = accounts[7];
    const botBalance = Utils.getBigNumberWithDecimals(10000, botDecimals);
    const centralizedOracleResult = 1;
    const topicEventParams = {
        _oracle: oracle,
        _name: ["Who will be the next president i", "n the 2020 election?"],
        _resultNames: ["Trump", "The Rock", "Hilary"],
        _bettingEndBlock: 100,
        _resultSettingEndBlock: 120
    };
    
    let token;
    let addressManager;
    let topicEvent;
    let centralizedOracle;
    let decentralizedOracle;
    let arbitrationBlockLength;
    let consensusIncrement;

    beforeEach(blockHeightManager.snapshot);
    afterEach(blockHeightManager.revert);

    beforeEach(async function() {
        // Fund accounts
        token = await BodhiToken.deployed({ from: admin });
        await token.mintByOwner(oracle, botBalance, { from: admin });
        assert.equal((await token.balanceOf(oracle)).toString(), botBalance.toString());
        await token.mintByOwner(user1, botBalance, { from: admin });
        assert.equal((await token.balanceOf(user1)).toString(), botBalance.toString());
        await token.mintByOwner(user2, botBalance, { from: admin });
        assert.equal((await token.balanceOf(user2)).toString(), botBalance.toString());
        await token.mintByOwner(user3, botBalance, { from: admin });
        assert.equal((await token.balanceOf(user3)).toString(), botBalance.toString());
        await token.mintByOwner(user4, botBalance, { from: admin });
        assert.equal((await token.balanceOf(user4)).toString(), botBalance.toString());
        await token.mintByOwner(user5, botBalance, { from: admin });
        assert.equal((await token.balanceOf(user5)).toString(), botBalance.toString());
        await token.mintByOwner(user6, botBalance, { from: admin });
        assert.equal((await token.balanceOf(user6)).toString(), botBalance.toString());

        // Init AddressManager
        addressManager = await AddressManager.deployed({ from: admin });
        await addressManager.setBodhiTokenAddress(token.address, { from: admin });
        assert.equal(await addressManager.bodhiTokenAddress.call(), token.address);

        arbitrationBlockLength = (await addressManager.arbitrationBlockLength.call()).toNumber();
        consensusIncrement = (await addressManager.consensusThresholdIncrement.call()).toNumber();

        // Init factories
        let eventFactory = await EventFactory.deployed(addressManager.address, { from: admin });
        await addressManager.setEventFactoryAddress(eventFactory.address, { from: admin });
        assert.equal(await addressManager.getEventFactoryAddress(0), eventFactory.address);

        let oracleFactory = await OracleFactory.deployed(addressManager.address, { from: admin });
        await addressManager.setOracleFactoryAddress(oracleFactory.address, { from: admin });
        assert.equal(await addressManager.getOracleFactoryAddress(0), oracleFactory.address);

        // Init TopicEvent
        let tx = await eventFactory.createTopic(...Object.values(topicEventParams), { from: oracle });
        topicEvent = TopicEvent.at(tx.logs[0].args._topicAddress);
        centralizedOracle = CentralizedOracle.at((await topicEvent.oracles.call(0))[0]);

        // Betting
        let bet1 = Utils.getBigNumberWithDecimals(20, botDecimals);
        await centralizedOracle.bet(centralizedOracleResult, { from: user1, value: bet1 });
        assert.equal((await topicEvent.getBetBalances({ from: user1 }))[centralizedOracleResult].toString(), 
            bet1.toString());

        let bet2 = Utils.getBigNumberWithDecimals(30, botDecimals);
        await centralizedOracle.bet(centralizedOracleResult, { from: user2, value: bet2 });
        assert.equal((await topicEvent.getBetBalances({ from: user2 }))[centralizedOracleResult].toString(), 
            bet2.toString());

        let bet3 = Utils.getBigNumberWithDecimals(11, botDecimals);
        await centralizedOracle.bet(0, { from: user3, value: bet3 });
        assert.equal((await topicEvent.getBetBalances({ from: user3 }))[0].toString(), bet3.toString());

        // CentralizedOracle set result
        await blockHeightManager.mineTo(topicEventParams._bettingEndBlock);
        assert.isAtLeast(await getBlockNumber(), topicEventParams._bettingEndBlock);
        assert.isBelow(await getBlockNumber(), topicEventParams._resultSettingEndBlock);

        assert.isFalse(await centralizedOracle.finished.call());
        assert.equal(await centralizedOracle.oracle.call(), oracle);

        let consensusThreshold = await centralizedOracle.consensusThreshold.call();
        await token.approve(topicEvent.address, consensusThreshold, { from: oracle });
        assert.equal((await token.allowance(oracle, topicEvent.address)).toString(), 
            consensusThreshold.toString());
        await centralizedOracle.setResult(centralizedOracleResult, { from: oracle });

        // DecentralizedOracle created
        decentralizedOracle = await DecentralizedOracle.at((await topicEvent.oracles.call(1))[0]);
    });

    describe("constructor", async function() {
        let numOfResults = 3;
        let arbitrationEndBlock = 220;
        let consensusThreshold = Utils.getBigNumberWithDecimals(100, botDecimals);

        it("inits the DecentralizedOracle with the correct values", async function() {
            assert.equal(await decentralizedOracle.eventAddress.call(), topicEvent.address);
            assert.equal(web3.toUtf8(await decentralizedOracle.eventName.call(0)), topicEventParams._name[0]);
            assert.equal(web3.toUtf8(await decentralizedOracle.eventName.call(1)), topicEventParams._name[1]);
            assert.equal(web3.toUtf8(await decentralizedOracle.eventResultNames.call(0)), 
                topicEventParams._resultNames[0]);
            assert.equal(web3.toUtf8(await decentralizedOracle.eventResultNames.call(1)), 
                topicEventParams._resultNames[1]);
            assert.equal(web3.toUtf8(await decentralizedOracle.eventResultNames.call(2)), 
                topicEventParams._resultNames[2]);
            assert.equal((await decentralizedOracle.numOfResults.call()).toNumber(), 3);
            assert.equal(await decentralizedOracle.lastResultIndex.call(), centralizedOracleResult);
            assert.equal((await decentralizedOracle.arbitrationEndBlock.call()).toNumber(), 
                (await getBlockNumber()) + arbitrationBlockLength);

            let threshold = await addressManager.startingOracleThreshold.call();
            assert.equal((await decentralizedOracle.consensusThreshold.call()).toNumber(), threshold.toNumber());
        });

        it('throws if eventAddress is invalid', async function() {
            try {
                await DecentralizedOracle.new(admin, 0, topicEventParams._name, topicEventParams._resultNames, 
                    numOfResults, centralizedOracleResult, arbitrationEndBlock, consensusThreshold, { from: admin });
                assert.fail();
            } catch(e) {
                assertInvalidOpcode(e);
            }
        });

        it("throws if eventName is empty", async function() {
            try {
                await DecentralizedOracle.new(admin, topicEvent.address, [], topicEventParams._resultNames, 
                    numOfResults, centralizedOracleResult, arbitrationEndBlock, consensusThreshold, { from: admin });
                assert.fail();
            } catch(e) {
                assertInvalidOpcode(e);
            }

            try {
                await DecentralizedOracle.new(admin, topicEvent.address, [''], topicEventParams._resultNames, 
                    numOfResults, centralizedOracleResult, arbitrationEndBlock, consensusThreshold, { from: admin });
                assert.fail();
            } catch(e) {
                assertInvalidOpcode(e);
            }
        });

        it("throws if the eventResultNames 0 or 1 are empty", async function() {
            try {
                await DecentralizedOracle.new(admin, topicEvent.address, topicEventParams._name, [], 
                    numOfResults, centralizedOracleResult, arbitrationEndBlock, consensusThreshold, { from: admin });
                assert.fail();
            } catch(e) {
                assertInvalidOpcode(e);
            }

            try {
                await DecentralizedOracle.new(admin, topicEvent.address, topicEventParams._name, ['first'], 
                    numOfResults, centralizedOracleResult, arbitrationEndBlock, consensusThreshold, { from: admin });
                assert.fail();
            } catch(e) {
                assertInvalidOpcode(e);
            }

            try {
                await DecentralizedOracle.new(admin, topicEvent.address, topicEventParams._name, ['', 'second'], 
                    numOfResults, centralizedOracleResult, arbitrationEndBlock, consensusThreshold, { from: admin });
                assert.fail();
            } catch(e) {
                assertInvalidOpcode(e);
            }
        });

        it('throws if numOfResults is 0', async function() {
            try {
                await DecentralizedOracle.new(admin, topicEvent.address, topicEventParams._name, 
                    topicEventParams._resultNames, 0, centralizedOracleResult, arbitrationEndBlock, consensusThreshold, 
                    { from: admin });
                assert.fail();
            } catch(e) {
                assertInvalidOpcode(e);
            }
        });

        it('throws if arbitrationEndBlock is less than or equal to current block', async function() {
            await blockHeightManager.mineTo(arbitrationEndBlock);
            assert.isAtLeast(await getBlockNumber(), arbitrationEndBlock);

            try {
                await DecentralizedOracle.new(admin, topicEvent.address, topicEventParams._name, 
                    topicEventParams._resultNames, numOfResults, centralizedOracleResult, arbitrationEndBlock, 
                    consensusThreshold, { from: admin });
                assert.fail();
            } catch(e) {
                assertInvalidOpcode(e);
            }
        });

        it('throws if consensusThreshold is 0', async function() {
            try {
                await DecentralizedOracle.new(admin, topicEvent.address, topicEventParams._name, 
                    topicEventParams._resultNames, numOfResults, centralizedOracleResult, arbitrationEndBlock, 0, 
                    { from: admin });
                assert.fail();
            } catch(e) {
                assertInvalidOpcode(e);
            }
        });
    });

    describe('voteResult()', async function() {
        it('allows voting', async function() {
            assert.isBelow(await getBlockNumber(), (await decentralizedOracle.arbitrationEndBlock.call()).toNumber());

            let vote1 = Utils.getBigNumberWithDecimals(7, botDecimals);
            await token.approve(topicEvent.address, vote1, { from: user1 });
            assert.equal((await token.allowance(user1, topicEvent.address)).toString(), vote1.toString());
            await decentralizedOracle.vote(0, vote1, { from: user1 });
            assert.equal((await decentralizedOracle.getVoteBalances({ from: user1 }))[0].toString(),
                vote1.toString());

            let vote2 = Utils.getBigNumberWithDecimals(5, botDecimals);
            await token.approve(topicEvent.address, vote2, { from: user2 });
            assert.equal((await token.allowance(user2, topicEvent.address)).toString(), vote2.toString());
            await decentralizedOracle.vote(2, vote2, { from: user2 });
            assert.equal((await decentralizedOracle.getVoteBalances({ from: user2 }))[2].toString(),
                vote2.toString());

            assert.equal((await decentralizedOracle.getTotalVotes())[0].toString(), vote1.toString());  
            assert.equal((await decentralizedOracle.getTotalVotes())[2].toString(), vote2.toString());  
        });

        it('sets the result if the vote passes the consensusThreshold', async function() {
            assert.isBelow(await getBlockNumber(), (await decentralizedOracle.arbitrationEndBlock.call()).toNumber());

            assert.isFalse(await decentralizedOracle.finished.call());
            assert.equal((await decentralizedOracle.resultIndex.call()).toNumber(), 
                (await decentralizedOracle.invalidResultIndex.call()).toNumber());

            let consensusThreshold = await decentralizedOracle.consensusThreshold.call();
            await token.approve(topicEvent.address, consensusThreshold, { from: user1 });
            assert.equal((await token.allowance(user1, topicEvent.address)).toString(), consensusThreshold.toString());

            await decentralizedOracle.vote(2, consensusThreshold, { from: user1 });
            assert.equal((await decentralizedOracle.getVoteBalances({ from: user1 }))[2].toString(),
                consensusThreshold.toString());
            assert.equal((await decentralizedOracle.getTotalVotes())[2].toString(), consensusThreshold.toString());  

            assert.isTrue(await decentralizedOracle.finished.call());
            assert.equal((await decentralizedOracle.resultIndex.call()).toNumber(), 2);
        });

        it('throws if eventResultIndex is invalid', async function() {
            assert.isBelow(await getBlockNumber(), (await decentralizedOracle.arbitrationEndBlock.call()).toNumber());

            let vote1 = Utils.getBigNumberWithDecimals(7, botDecimals);
            await token.approve(topicEvent.address, vote1, { from: user1 });
            assert.equal((await token.allowance(user1, topicEvent.address)).toString(), vote1.toString());

            try {
                await decentralizedOracle.vote(centralizedOracleResult, vote1, { from: user1 });
                assert.fail();
            } catch(e) {
                assertInvalidOpcode(e);
            }
        });

        it('throws if the Oracle is finished', async function() {
            let arbitrationEndBlock = (await decentralizedOracle.arbitrationEndBlock.call()).toNumber();
            await blockHeightManager.mineTo(arbitrationEndBlock);
            assert.isAtLeast(await getBlockNumber(), arbitrationEndBlock);

            assert.isFalse(await decentralizedOracle.finished.call());
            await decentralizedOracle.finalizeResult();
            assert.isTrue(await decentralizedOracle.finished.call());
            assert.equal((await decentralizedOracle.resultIndex.call()).toNumber(), centralizedOracleResult);

            let vote1 = Utils.getBigNumberWithDecimals(7, botDecimals);
            await token.approve(topicEvent.address, vote1, { from: user1 });
            assert.equal((await token.allowance(user1, topicEvent.address)).toString(), vote1.toString());
            try {
                await decentralizedOracle.vote(0, vote1, { from: user1 });
                assert.fail();
            } catch(e) {
                assertInvalidOpcode(e);
            }
        });

        it('throws if botAmount is 0', async function() {
            assert.isBelow(await getBlockNumber(), (await decentralizedOracle.arbitrationEndBlock.call()).toNumber());

            try {
                await decentralizedOracle.vote(centralizedOracleResult, 0, { from: user1 });
                assert.fail();
            } catch(e) {
                assertInvalidOpcode(e);
            }
        });

        it('throws if the block is at the arbitrationEndBlock', async function() {
            let arbitrationEndBlock = (await decentralizedOracle.arbitrationEndBlock.call()).toNumber();
            await blockHeightManager.mineTo(arbitrationEndBlock);
            assert.isAtLeast(await getBlockNumber(), arbitrationEndBlock);
            
            let vote1 = Utils.getBigNumberWithDecimals(7, botDecimals);
            await token.approve(topicEvent.address, vote1, { from: user1 });
            assert.equal((await token.allowance(user1, topicEvent.address)).toString(), vote1.toString());

            try {
                await decentralizedOracle.vote(0, vote1, { from: user1 });
                assert.fail();
            } catch(e) {
                assertInvalidOpcode(e);
            }
        });

        it('throws if the voting on the lastResultIndex', async function() {
            let lastResultIndex = (await decentralizedOracle.lastResultIndex.call()).toNumber();
            
            let vote1 = Utils.getBigNumberWithDecimals(7, botDecimals);
            await token.approve(topicEvent.address, vote1, { from: user1 });
            assert.equal((await token.allowance(user1, topicEvent.address)).toString(), vote1.toString());

            try {
                await decentralizedOracle.vote(lastResultIndex, vote1, { from: user1 });
                assert.fail();
            } catch(e) {
                assertInvalidOpcode(e);
            }
        });
    });

    describe("finalizeResult()", async function() {
    });
});
