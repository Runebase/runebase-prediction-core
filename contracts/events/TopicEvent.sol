pragma solidity ^0.4.18;

import "./ITopicEvent.sol";
import "../BaseContract.sol";
import "../storage/IAddressManager.sol";
import "../oracles/IOracleFactory.sol";
import "../tokens/ERC20.sol";
import "../libs/Ownable.sol";
import "../libs/SafeMath.sol";
import "../libs/ByteUtils.sol";

contract TopicEvent is ITopicEvent, BaseContract, Ownable {
    using ByteUtils for bytes32;
    using SafeMath for uint256;

    /*
    * @notice Status types
    *   Betting: Bet with RUNEBASE during this phase.
    *   Arbitration: Vote with PRED during this phase.
    *   Collection: Winners collect their winnings during this phase.
    */
    enum Status {
        Betting,
        OracleVoting,
        Collection
    }

    struct Oracle {
        address oracleAddress;
        bool didSetResult;
    }

    // Amount of RUNEBASE to be distributed to PRED winners
    uint8 public constant RUNEBASE_PERCENTAGE = 1;

    Status public status = Status.Betting;
    bool public escrowWithdrawn;
    bytes32[10] public eventName;
    bytes32[11] public eventResults;
    uint256 public totalRunebaseValue;
    uint256 public totalPredValue;
    uint256 public escrowAmount;
    IAddressManager private addressManager;
    Oracle[] public oracles;
    mapping(address => bool) public didWithdraw;

    // Events
    event FinalResultSet(
        uint16 indexed _version, 
        address indexed _eventAddress, 
        uint8 _finalResultIndex);
    event WinningsWithdrawn(
        uint16 indexed _version, 
        address indexed _winner, 
        uint256 _runebaseTokenWon, 
        uint256 _predTokenWon);

    // Modifiers
    modifier fromCentralizedOracle() {
        require(msg.sender == oracles[0].oracleAddress);
        _;
    }

    modifier inCollectionStatus() {
        require(status == Status.Collection);
        _;
    }

    /*
    * @notice Creates new TopicEvent contract.
    * @param _version The contract version.
    * @param _owner The address of the owner.
    * @param _centralizedOracle The address of the CentralizedOracle that will decide the result.
    * @param _name The question or statement prediction broken down by multiple bytes32.
    * @param _resultNames The possible results.
    * @param _bettingStartTime The unix time when betting will start.
    * @param _bettingEndTime The unix time when betting will end.
    * @param _resultSettingStartTime The unix time when the CentralizedOracle can set the result.
    * @param _resultSettingEndTime The unix time when anyone can set the result.
    * @param _escrowAmount The amount of PRED deposited to create the Event.
    * @param _addressManager The address of the AddressManager.
    */
    constructor(
        uint16 _version,
        address _owner,
        address _centralizedOracle,
        bytes32[10] _name,
        bytes32[11] _resultNames,
        uint8 _numOfResults,
        uint256 _bettingStartTime,
        uint256 _bettingEndTime,
        uint256 _resultSettingStartTime,
        uint256 _resultSettingEndTime,
        address _addressManager)
        Ownable(_owner)
        public
        validAddress(_centralizedOracle)
        validAddress(_addressManager)
    {
        require(!_name[0].isEmpty());
        require(!_resultNames[0].isEmpty());
        require(!_resultNames[1].isEmpty());
        require(_bettingEndTime > _bettingStartTime);
        require(_resultSettingStartTime >= _bettingEndTime);
        require(_resultSettingEndTime > _resultSettingStartTime);

        version = _version;
        owner = _owner;
        eventName = _name;
        eventResults = _resultNames;
        numOfResults = _numOfResults;
        addressManager = IAddressManager(_addressManager);
        escrowAmount = addressManager.eventEscrowAmount();

        createCentralizedOracle(_centralizedOracle, _bettingStartTime, _bettingEndTime, _resultSettingStartTime,
            _resultSettingEndTime);
    }

    /// @notice Fallback function that rejects any amount sent to the contract.
    function() external payable {
        revert();
    }

    /*
    * @dev CentralizedOracle contract can call this method to bet.
    * @param _better The address that is placing the bet.
    * @param _resultIndex The index of result to bet on.
    */
    function betFromOracle(address _better, uint8 _resultIndex) 
        external 
        payable
        validAddress(_better)
        validResultIndex(_resultIndex)
        fromCentralizedOracle()
    {
        require(msg.value > 0);

        balances[_resultIndex].totalBets = balances[_resultIndex].totalBets.add(msg.value);
        balances[_resultIndex].bets[_better] = balances[_resultIndex].bets[_better].add(msg.value);
        totalRunebaseValue = totalRunebaseValue.add(msg.value);
    }

    /* 
    * @dev CentralizedOracle contract can call this method to set the result.
    * @param _oracle The address of the CentralizedOracle.
    * @param _resultIndex The index of the result to set.
    * @param _consensusThreshold The PRED threshold that the CentralizedOracle has to contribute to validate the result.
    */
    function centralizedOracleSetResult(
        address _oracle, 
        uint8 _resultIndex, 
        uint256 _consensusThreshold)
        external 
        validResultIndex(_resultIndex)
        fromCentralizedOracle()
    {
        require(!oracles[0].didSetResult);
        require(status == Status.Betting);

        ERC20 token = ERC20(addressManager.runebasepredictionTokenAddress());
        require(token.allowance(_oracle, address(this)) >= _consensusThreshold);

        oracles[0].didSetResult = true;
        status = Status.OracleVoting;
        resultIndex = _resultIndex;

        balances[_resultIndex].totalVotes = balances[_resultIndex].totalVotes.add(_consensusThreshold);
        balances[_resultIndex].votes[_oracle] = balances[_resultIndex].votes[_oracle].add(_consensusThreshold);
        totalPredValue = totalPredValue.add(_consensusThreshold);

        token.transferFrom(_oracle, address(this), _consensusThreshold);

        uint256 increment = addressManager.thresholdPercentIncrease().mul(_consensusThreshold).div(100);
        createDecentralizedOracle(_consensusThreshold.add(increment));
    }

    /*
    * @dev DecentralizedOracle contract can call this method to vote for a user. Voter must PRED approve() with the 
    *   amount to TopicEvent address before voting.
    * @param _resultIndex The index of result to vote on.
    * @param _sender The address of the person voting on a result.
    * @param _amount The PRED amount used to vote.
    * @return Flag indicating a successful transfer.
    */
    function voteFromOracle(uint8 _resultIndex, address _sender, uint256 _amount)
        external
        validResultIndex(_resultIndex)
        returns (bool)
    {
        bool isValidOracle = false;
        for (uint8 i = 1; i < oracles.length; i++) {
            if (msg.sender == oracles[i].oracleAddress) {
                isValidOracle = true;
                break;
            }
        }
        require(isValidOracle);
        require(_amount > 0);

        ERC20 token = ERC20(addressManager.runebasepredictionTokenAddress());
        require(token.allowance(_sender, address(this)) >= _amount);

        balances[_resultIndex].totalVotes = balances[_resultIndex].totalVotes.add(_amount);
        balances[_resultIndex].votes[_sender] = balances[_resultIndex].votes[_sender].add(_amount);
        totalPredValue = totalPredValue.add(_amount);

        return token.transferFrom(_sender, address(this), _amount);
    }

    /* 
    * @dev DecentralizedOracle contract can call this to set the result after vote passes consensus threshold.
    * @param _resultIndex The index of the result to set.
    * @param _currentConsensusThreshold The current consensus threshold for the Oracle.
    */
    function decentralizedOracleSetResult(uint8 _resultIndex, uint256 _currentConsensusThreshold)
        external 
        validResultIndex(_resultIndex)
        returns (bool)
    {
        bool isValidOracle = false;
        uint8 oracleIndex;
        for (uint8 i = 1; i < oracles.length; i++) {
            if (msg.sender == oracles[i].oracleAddress && !oracles[i].didSetResult) {
                isValidOracle = true;
                oracleIndex = i;
                break;
            }
        }
        require(isValidOracle);

        oracles[oracleIndex].didSetResult = true;
        status = Status.OracleVoting;
        resultIndex = _resultIndex;

        uint256 increment = addressManager.thresholdPercentIncrease().mul(_currentConsensusThreshold).div(100);
        return createDecentralizedOracle(_currentConsensusThreshold.add(increment));
    }

    /*
    * @dev The last DecentralizedOracle contract can call this method to change status to Collection.
    * @return Flag to indicate success of finalizing the result.
    */
    function decentralizedOracleFinalizeResult() 
        external 
        returns (bool)
    {
        require(msg.sender == oracles[oracles.length - 1].oracleAddress);
        require(status == Status.OracleVoting);

        status = Status.Collection;
 
        emit FinalResultSet(version, address(this), resultIndex);

        return true;
    }

    /*
    * @notice Allows winners of the Event to withdraw their RUNEBASE and PRED winnings after the final result is set.
    */
    function withdrawWinnings() 
        external 
        inCollectionStatus()
    {
        require(!didWithdraw[msg.sender]);

        didWithdraw[msg.sender] = true;

        uint256 predWon;
        uint256 runebaseWon;
        (predWon, runebaseWon) = calculateWinnings();

        if (runebaseWon > 0) {
            msg.sender.transfer(runebaseWon);
        }
        if (predWon > 0) {
            ERC20(addressManager.runebasepredictionTokenAddress()).transfer(msg.sender, predWon);
        }

        emit WinningsWithdrawn(version, msg.sender, runebaseWon, predWon);
    }

    /*
    * @notice Allows the creator of the Event to withdraw the escrow amount.
    */
    function withdrawEscrow()
        external
        onlyOwner()
        inCollectionStatus()
    {
        require(!escrowWithdrawn);

        escrowWithdrawn = true;

        addressManager.withdrawEscrow(msg.sender, escrowAmount);
    }

    /*
    * @notice Gets the final result index and flag indicating if the result is final.
    * @return The result index and finalized bool.
    */
    function getFinalResult() 
        public 
        view
        returns (uint8, bool) 
    {
        return (resultIndex, status == Status.Collection);
    }

    /* 
    * @notice Calculates the PRED and RUNEBASE tokens won based on the sender's contributions.
    * @return The amount of PRED and RUNEBASE tokens won.
    */
    function calculateWinnings()
        public 
        view
        inCollectionStatus()
        returns (uint256, uint256)  
    {
        uint256 votes = balances[resultIndex].votes[msg.sender];
        uint256 bets = balances[resultIndex].bets[msg.sender];

        // Calculate Runebase reward total
        uint256 losersTotal = 0;
        for (uint8 i = 0; i < numOfResults; i++) {
            if (i != resultIndex) {
                losersTotal = losersTotal.add(balances[i].totalBets);
            }
        }
        uint256 rewardRunebase = uint256(RUNEBASE_PERCENTAGE).mul(losersTotal).div(100);
        losersTotal = losersTotal.sub(rewardRunebase);

        // Calculate RUNEBASE winnings
        uint256 winnersTotal;
        uint256 runebaseWon = 0;
        if (bets > 0) {
            winnersTotal = balances[resultIndex].totalBets;
            runebaseWon = bets.mul(losersTotal).div(winnersTotal).add(bets);
        }

        // Calculate PRED winnings
        uint256 predWon = 0;
        if (votes > 0) {
            winnersTotal = balances[resultIndex].totalVotes;
            losersTotal = 0;
            for (i = 0; i < numOfResults; i++) {
                if (i != resultIndex) {
                    losersTotal = losersTotal.add(balances[i].totalVotes);
                }
            }
            predWon = votes.mul(losersTotal).div(winnersTotal).add(votes);
            uint256 rewardWon = votes.mul(rewardRunebase).div(winnersTotal);
            runebaseWon = runebaseWon.add(rewardWon);
        }

        return (predWon, runebaseWon);
    }

    function createCentralizedOracle(
        address _centralizedOracle, 
        uint256 _bettingStartTime,
        uint256 _bettingEndTime,
        uint256 _resultSettingStartTime,
        uint256 _resultSettingEndTime)
        private
    {
        address oracleFactory = addressManager.oracleFactoryVersionToAddress(version);
        address newOracle = IOracleFactory(oracleFactory).createCentralizedOracle(address(this), 
            numOfResults, _centralizedOracle, _bettingStartTime, _bettingEndTime, _resultSettingStartTime, 
            _resultSettingEndTime, addressManager.startingOracleThreshold());
        
        assert(newOracle != address(0));
        oracles.push(Oracle({
            oracleAddress: newOracle,
            didSetResult: false
            }));
    }

    function createDecentralizedOracle(uint256 _consensusThreshold) 
        private 
        returns (bool)
    {
        address oracleFactory = addressManager.oracleFactoryVersionToAddress(version);
        uint256 arbitrationLength = addressManager.arbitrationLength();
        address newOracle = IOracleFactory(oracleFactory).createDecentralizedOracle(address(this), numOfResults, 
            resultIndex, block.timestamp.add(arbitrationLength), _consensusThreshold);
        
        assert(newOracle != address(0));
        oracles.push(Oracle({
            oracleAddress: newOracle,
            didSetResult: false
            }));

        return true;
    }
}
