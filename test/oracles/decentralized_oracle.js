const web3 = global.web3;
const assert = require('chai').assert;

const RunebasePredictionToken = artifacts.require('./tokens/RunebasePredictionToken.sol');
const AddressManager = artifacts.require('./storage/AddressManager.sol');
const EventFactory = artifacts.require('./events/EventFactory.sol');
const TopicEvent = artifacts.require('./events/TopicEvent.sol');
const OracleFactory = artifacts.require('./oracles/OracleFactory.sol');
const CentralizedOracle = artifacts.require('./oracles/CentralizedOracle.sol');
const DecentralizedOracle = artifacts.require('./oracles/DecentralizedOracle.sol');
const TimeMachine = require('../helpers/time_machine');
const Utils = require('../helpers/utils');
const SolAssert = require('../helpers/sol_assert');
const ContractHelper = require('../helpers/contract_helper');

function getTopicParams(oracle) {
  const currTime = Utils.getCurrentBlockTime();
  return {
    _oracle: oracle,
    _name: ['Who will be the next president i', 'n the 2020 election?'],
    _resultNames: ['Trump', 'The Rock', 'Hilary'],
    _bettingStartTime: currTime + 1000,
    _bettingEndTime: currTime + 3000,
    _resultSettingStartTime: currTime + 4000,
    _resultSettingEndTime: currTime + 6000,
  };
}

contract('DecentralizedOracle', (accounts) => {
  const timeMachine = new TimeMachine(web3);

  const PRED_DECIMALS = 8;
  const ADMIN = accounts[0];
  const ORACLE = accounts[1];
  const USER1 = accounts[2];
  const USER2 = accounts[3];
  const USER3 = accounts[4];
  const USER4 = accounts[5];
  const USER5 = accounts[6];
  const USER6 = accounts[7];
  const CENTRALIZED_ORACLE_RESULT = 1;
  const NUM_OF_RESULTS = 4; // topicParams._resultNames + invalid default result
  const VERSION = 0;

  let addressManager;
  let token;
  let eventFactory;
  let oracleFactory;
  let topicParams;
  let topicEvent;
  let centralizedOracle;
  let decentralizedOracle;
  let arbitrationLength;
  let thresholdPercentIncrease;

  before(async () => {
    const baseContracts = await ContractHelper.initBaseContracts(ADMIN, accounts);
    addressManager = baseContracts.addressManager;
    token = baseContracts.runebasepredictionToken;
    eventFactory = baseContracts.eventFactory;
    oracleFactory = baseContracts.oracleFactory;

    arbitrationLength = (await addressManager.arbitrationLength.call()).toNumber();
    thresholdPercentIncrease = (await addressManager.thresholdPercentIncrease.call()).toNumber();
  });

  beforeEach(async () => {
    await timeMachine.mine();
    await timeMachine.snapshot();

    // Approve for event creation
    const escrowAmount = await addressManager.eventEscrowAmount.call();
    await ContractHelper.approve(token, ORACLE, addressManager.address, escrowAmount);

    // Init TopicEvent
    topicParams = getTopicParams(ORACLE);
    const tx = await eventFactory.createTopic(...Object.values(topicParams), { from: ORACLE });
    topicEvent = TopicEvent.at(tx.logs[0].args._topicAddress);
    centralizedOracle = CentralizedOracle.at((await topicEvent.oracles.call(0))[0]);

    // Betting
    await timeMachine.increaseTime(topicParams._bettingStartTime - Utils.getCurrentBlockTime());
    assert.isAtLeast(Utils.getCurrentBlockTime(), topicParams._bettingStartTime);
    assert.isBelow(Utils.getCurrentBlockTime(), topicParams._bettingEndTime);

    const bet1 = Utils.getBigNumberWithDecimals(20, PRED_DECIMALS);
    await centralizedOracle.bet(CENTRALIZED_ORACLE_RESULT, {
      from: USER1,
      value: bet1,
    });
    SolAssert.assertBNEqual((await topicEvent.getBetBalances({ from: USER1 }))[CENTRALIZED_ORACLE_RESULT], bet1);

    const bet2 = Utils.getBigNumberWithDecimals(30, PRED_DECIMALS);
    await centralizedOracle.bet(CENTRALIZED_ORACLE_RESULT, {
      from: USER2,
      value: bet2,
    });
    SolAssert.assertBNEqual((await topicEvent.getBetBalances({ from: USER2 }))[CENTRALIZED_ORACLE_RESULT], bet2);

    const bet3 = Utils.getBigNumberWithDecimals(11, PRED_DECIMALS);
    await centralizedOracle.bet(0, {
      from: USER3,
      value: bet3,
    });
    SolAssert.assertBNEqual((await topicEvent.getBetBalances({ from: USER3 }))[0], bet3);

    // CentralizedOracle set result
    await timeMachine.increaseTime(topicParams._resultSettingStartTime - Utils.getCurrentBlockTime());
    assert.isAtLeast(Utils.getCurrentBlockTime(), topicParams._resultSettingStartTime);
    assert.isBelow(Utils.getCurrentBlockTime(), topicParams._resultSettingEndTime);

    assert.isFalse(await centralizedOracle.finished.call());
    assert.equal(await centralizedOracle.oracle.call(), ORACLE);

    const consensusThreshold = await centralizedOracle.consensusThreshold.call();
    await ContractHelper.approve(token, ORACLE, topicEvent.address, consensusThreshold);
    await centralizedOracle.setResult(CENTRALIZED_ORACLE_RESULT, { from: ORACLE });

    // DecentralizedOracle created
    decentralizedOracle = await DecentralizedOracle.at((await topicEvent.oracles.call(1))[0]);
  });

  afterEach(async () => {
    await timeMachine.revert();
  });

  describe('constructor', () => {
    const consensusThreshold = Utils.getBigNumberWithDecimals(100, PRED_DECIMALS);
    let arbitrationEndTime;

    beforeEach(() => {
      arbitrationEndTime = Utils.getCurrentBlockTime() + arbitrationLength;
    });

    it('inits the DecentralizedOracle with the correct values', async () => {
      assert.equal(await decentralizedOracle.version.call(), 0);
      assert.equal(await decentralizedOracle.eventAddress.call(), topicEvent.address);
      assert.equal((await decentralizedOracle.numOfResults.call()).toNumber(), NUM_OF_RESULTS);
      assert.equal(await decentralizedOracle.lastResultIndex.call(), CENTRALIZED_ORACLE_RESULT);
      assert.equal((await decentralizedOracle.arbitrationEndTime.call()).toNumber(), arbitrationEndTime);

      const threshold = Utils.getPercentageIncrease(await addressManager.startingOracleThreshold.call(),
        thresholdPercentIncrease);
      SolAssert.assertBNEqual(await decentralizedOracle.consensusThreshold.call(), threshold);
    });

    it('throws if eventAddress is invalid', async () => {
      try {
        await DecentralizedOracle.new(
          VERSION, ADMIN, 0, NUM_OF_RESULTS, CENTRALIZED_ORACLE_RESULT,
          arbitrationEndTime, consensusThreshold, { from: ADMIN },
        );
        assert.fail();
      } catch (e) {
        SolAssert.assertRevert(e);
      }
    });

    it('throws if numOfResults is 0', async () => {
      try {
        await DecentralizedOracle.new(
          VERSION, ADMIN, topicEvent.address, 0, CENTRALIZED_ORACLE_RESULT,
          arbitrationEndTime, consensusThreshold, { from: ADMIN },
        );
        assert.fail();
      } catch (e) {
        SolAssert.assertRevert(e);
      }
    });

    it('throws if arbitrationEndTime is <= current time', async () => {
      await timeMachine.increaseTime(arbitrationEndTime - Utils.getCurrentBlockTime());
      assert.isAtLeast(Utils.getCurrentBlockTime(), arbitrationEndTime);

      try {
        await DecentralizedOracle.new(
          VERSION, ADMIN, topicEvent.address, NUM_OF_RESULTS,
          CENTRALIZED_ORACLE_RESULT, arbitrationEndTime, consensusThreshold, { from: ADMIN },
        );
        assert.fail();
      } catch (e) {
        SolAssert.assertRevert(e);
      }
    });

    it('throws if consensusThreshold is 0', async () => {
      try {
        await DecentralizedOracle.new(
          VERSION, ADMIN, topicEvent.address, NUM_OF_RESULTS,
          CENTRALIZED_ORACLE_RESULT, arbitrationEndTime, 0, { from: ADMIN },
        );
        assert.fail();
      } catch (e) {
        SolAssert.assertRevert(e);
      }
    });
  });

  describe('voteResult()', () => {
    it('allows voting', async () => {
      assert.isBelow(Utils.getCurrentBlockTime(), (await decentralizedOracle.arbitrationEndTime.call()).toNumber());

      const vote1 = Utils.getBigNumberWithDecimals(7, PRED_DECIMALS);
      await ContractHelper.approve(token, USER1, topicEvent.address, vote1);
      await decentralizedOracle.voteResult(0, vote1, { from: USER1 });
      SolAssert.assertBNEqual((await decentralizedOracle.getVoteBalances({ from: USER1 }))[0], vote1);

      const vote2 = Utils.getBigNumberWithDecimals(5, PRED_DECIMALS);
      await ContractHelper.approve(token, USER2, topicEvent.address, vote2);
      await decentralizedOracle.voteResult(2, vote2, { from: USER2 });
      SolAssert.assertBNEqual((await decentralizedOracle.getVoteBalances({ from: USER2 }))[2], vote2);

      SolAssert.assertBNEqual((await decentralizedOracle.getTotalVotes())[0], vote1);
      SolAssert.assertBNEqual((await decentralizedOracle.getTotalVotes())[2], vote2);
    });

    it('sets the result if the vote passes the consensusThreshold', async () => {
      assert.isBelow(Utils.getCurrentBlockTime(), (await decentralizedOracle.arbitrationEndTime.call()).toNumber());

      assert.isFalse(await decentralizedOracle.finished.call());
      assert.equal(
        (await decentralizedOracle.resultIndex.call()).toNumber(),
        (await decentralizedOracle.INVALID_RESULT_INDEX.call()).toNumber(),
      );

      const consensusThreshold = await decentralizedOracle.consensusThreshold.call();
      await ContractHelper.approve(token, USER1, topicEvent.address, consensusThreshold);

      await decentralizedOracle.voteResult(2, consensusThreshold, { from: USER1 });
      SolAssert.assertBNEqual((await decentralizedOracle.getVoteBalances({ from: USER1 }))[2], consensusThreshold);
      SolAssert.assertBNEqual((await decentralizedOracle.getTotalVotes())[2], consensusThreshold);

      assert.isTrue(await decentralizedOracle.finished.call());
      assert.equal((await decentralizedOracle.resultIndex.call()).toNumber(), 2);
    });

    it('does not allow voting more than the consensusThreshold', async () => {
      assert.isBelow(Utils.getCurrentBlockTime(), (await decentralizedOracle.arbitrationEndTime.call()).toNumber());

      assert.isFalse(await decentralizedOracle.finished.call());
      assert.equal(
        (await decentralizedOracle.resultIndex.call()).toNumber(),
        (await decentralizedOracle.INVALID_RESULT_INDEX.call()).toNumber(),
      );

      const consensusThreshold = await decentralizedOracle.consensusThreshold.call();
      await ContractHelper.approve(token, USER1, topicEvent.address, consensusThreshold);

      const vote = consensusThreshold.add(1);
      await decentralizedOracle.voteResult(2, vote, { from: USER1 });
      SolAssert.assertBNEqual((await decentralizedOracle.getVoteBalances({ from: USER1 }))[2], consensusThreshold);
      SolAssert.assertBNEqual((await decentralizedOracle.getTotalVotes())[2], consensusThreshold);

      assert.isTrue(await decentralizedOracle.finished.call());
      assert.equal((await decentralizedOracle.resultIndex.call()).toNumber(), 2);
    });

    it('throws if eventResultIndex is invalid', async () => {
      assert.isBelow(Utils.getCurrentBlockTime(), (await decentralizedOracle.arbitrationEndTime.call()).toNumber());

      const vote1 = Utils.getBigNumberWithDecimals(7, PRED_DECIMALS);
      await ContractHelper.approve(token, USER1, topicEvent.address, vote1);
      try {
        await decentralizedOracle.voteResult(CENTRALIZED_ORACLE_RESULT, vote1, { from: USER1 });
        assert.fail();
      } catch (e) {
        SolAssert.assertRevert(e);
      }
    });

    it('throws if the Oracle is finished', async () => {
      const arbitrationEndTime = (await decentralizedOracle.arbitrationEndTime.call()).toNumber();
      await timeMachine.increaseTime(arbitrationEndTime - Utils.getCurrentBlockTime());
      assert.isAtLeast(Utils.getCurrentBlockTime(), arbitrationEndTime);

      assert.isFalse(await decentralizedOracle.finished.call());
      await decentralizedOracle.finalizeResult();
      assert.isTrue(await decentralizedOracle.finished.call());
      assert.equal((await decentralizedOracle.resultIndex.call()).toNumber(), CENTRALIZED_ORACLE_RESULT);

      const vote1 = Utils.getBigNumberWithDecimals(7, PRED_DECIMALS);
      await ContractHelper.approve(token, USER1, topicEvent.address, vote1);
      try {
        await decentralizedOracle.voteResult(0, vote1, { from: USER1 });
        assert.fail();
      } catch (e) {
        SolAssert.assertRevert(e);
      }
    });

    it('throws if predAmount is 0', async () => {
      assert.isBelow(Utils.getCurrentBlockTime(), (await decentralizedOracle.arbitrationEndTime.call()).toNumber());

      try {
        await decentralizedOracle.voteResult(CENTRALIZED_ORACLE_RESULT, 0, { from: USER1 });
        assert.fail();
      } catch (e) {
        SolAssert.assertRevert(e);
      }
    });

    it('throws if the time is at the arbitrationEndTime', async () => {
      const arbitrationEndTime = (await decentralizedOracle.arbitrationEndTime.call()).toNumber();
      await timeMachine.increaseTime(arbitrationEndTime - Utils.getCurrentBlockTime());
      assert.isAtLeast(Utils.getCurrentBlockTime(), arbitrationEndTime);

      const vote1 = Utils.getBigNumberWithDecimals(7, PRED_DECIMALS);
      await ContractHelper.approve(token, USER1, topicEvent.address, vote1);

      try {
        await decentralizedOracle.voteResult(0, vote1, { from: USER1 });
        assert.fail();
      } catch (e) {
        SolAssert.assertRevert(e);
      }
    });

    it('throws if the voting on the lastResultIndex', async () => {
      const lastResultIndex = (await decentralizedOracle.lastResultIndex.call()).toNumber();

      const vote1 = Utils.getBigNumberWithDecimals(7, PRED_DECIMALS);
      await ContractHelper.approve(token, USER1, topicEvent.address, vote1);

      try {
        await decentralizedOracle.voteResult(lastResultIndex, vote1, { from: USER1 });
        assert.fail();
      } catch (e) {
        SolAssert.assertRevert(e);
      }
    });
  });

  describe('finalizeResult()', () => {
    describe('in valid time range', () => {
      beforeEach(async () => {
        const arbitrationEndTime = (await decentralizedOracle.arbitrationEndTime.call()).toNumber();
        await timeMachine.increaseTime(arbitrationEndTime - Utils.getCurrentBlockTime());
        assert.isAtLeast(Utils.getCurrentBlockTime(), arbitrationEndTime);
      });

      it('finalizes the result', async () => {
        assert.isFalse(await decentralizedOracle.finished.call());
        assert.equal(
          (await decentralizedOracle.resultIndex.call()).toNumber(),
          (await decentralizedOracle.INVALID_RESULT_INDEX.call()).toNumber(),
        );

        await decentralizedOracle.finalizeResult();
        assert.isTrue(await decentralizedOracle.finished.call());
        assert.equal((await decentralizedOracle.resultIndex.call()).toNumber(), CENTRALIZED_ORACLE_RESULT);
      });

      it('throws if the Oracle is finished', async () => {
        await decentralizedOracle.finalizeResult();
        assert.isTrue(await decentralizedOracle.finished.call());
        assert.equal((await decentralizedOracle.resultIndex.call()).toNumber(), CENTRALIZED_ORACLE_RESULT);

        try {
          await decentralizedOracle.finalizeResult();
          assert.fail();
        } catch (e) {
          SolAssert.assertRevert(e);
        }
      });
    });

    describe('in invalid time range', () => {
      it('throws if the time is below the arbitrationEndTime', async () => {
        const arbitrationEndTime = (await decentralizedOracle.arbitrationEndTime.call()).toNumber();
        assert.isBelow(Utils.getCurrentBlockTime(), arbitrationEndTime);

        try {
          await decentralizedOracle.finalizeResult();
          assert.fail();
        } catch (e) {
          SolAssert.assertRevert(e);
        }
      });
    });
  });

  describe('getVoteBalances()', () => {
    it('returns the vote balances', async () => {
      const arbitrationEndTime = (await decentralizedOracle.arbitrationEndTime.call()).toNumber();
      assert.isBelow(Utils.getCurrentBlockTime(), arbitrationEndTime);

      const vote1 = Utils.getBigNumberWithDecimals(10, PRED_DECIMALS);
      await ContractHelper.approve(token, USER1, topicEvent.address, vote1);
      await decentralizedOracle.voteResult(0, vote1, { from: USER1 });
      SolAssert.assertBNEqual((await decentralizedOracle.getVoteBalances({ from: USER1 }))[0], vote1);

      const vote2 = Utils.getBigNumberWithDecimals(17, PRED_DECIMALS);
      await ContractHelper.approve(token, USER2, topicEvent.address, vote2);
      await decentralizedOracle.voteResult(2, vote2, { from: USER2 });
      SolAssert.assertBNEqual((await decentralizedOracle.getVoteBalances({ from: USER2 }))[2], vote2);
    });
  });

  describe('getTotalVotes()', () => {
    it('returns the total votes', async () => {
      const arbitrationEndTime = (await decentralizedOracle.arbitrationEndTime.call()).toNumber();
      assert.isBelow(Utils.getCurrentBlockTime(), arbitrationEndTime);

      const vote1 = Utils.getBigNumberWithDecimals(10, PRED_DECIMALS);
      await ContractHelper.approve(token, USER1, topicEvent.address, vote1);
      await decentralizedOracle.voteResult(0, vote1, { from: USER1 });

      const vote2 = Utils.getBigNumberWithDecimals(17, PRED_DECIMALS);
      await ContractHelper.approve(token, USER2, topicEvent.address, vote2);
      await decentralizedOracle.voteResult(0, vote2, { from: USER2 });

      const totalVotes = vote1.add(vote2);
      SolAssert.assertBNEqual((await decentralizedOracle.getTotalVotes())[0], totalVotes);
    });
  });
});
