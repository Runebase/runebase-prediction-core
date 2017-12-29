pragma solidity ^0.4.18;

import "../BaseContract.sol";
import "../events/ITopicEvent.sol";
import "../libs/Ownable.sol";
import "../libs/SafeMath.sol";
import "../libs/ByteUtils.sol";

contract Oracle is BaseContract, Ownable {
    using ByteUtils for bytes32;
    using SafeMath for uint256;

    bool public finished;
    address public eventAddress;
    uint256 public consensusThreshold;

    // Events
    event OracleResultVoted(
        uint16 indexed _version, 
        address indexed _oracleAddress, 
        address indexed _participant, 
        uint8 _resultIndex, 
        uint256 _votedAmount);
    event OracleResultSet(
        uint16 indexed _version, 
        address indexed _oracleAddress, 
        uint8 _resultIndex);

    // Modifiers
    modifier validResultIndex(uint8 _resultIndex) {
        require (_resultIndex <= numOfResults - 1);
        _;
    }

    modifier isNotFinished() {
        require(!finished);
        _;
    }

    /*
    * @notice Gets the bet balances of the sender for all the results.
    * @return An array of all the bet balances of the sender.
    */
    function getBetBalances() 
        public
        view
        returns (uint256[10]) 
    {
        uint256[10] memory betBalances;
        for (uint8 i = 0; i < numOfResults; i++) {
            betBalances[i] = balances[i].bets[msg.sender];
        }
        return betBalances;
    }

    /*
    * @notice Gets the vote balances of the sender for all the results.
    * @return An array of all the vote balances of the sender.
    */
    function getVoteBalances() 
        public
        view
        returns (uint256[10]) 
    {
        uint256[10] memory voteBalances;
        for (uint8 i = 0; i < numOfResults; i++) {
            voteBalances[i] = balances[i].votes[msg.sender];
        }
        return voteBalances;
    }

    /*
    * @notice Gets total bets for all the results.
    * @return An array of total bets for all results.
    */
    function getTotalBets() 
        public
        view
        returns (uint256[10])
    {
        uint256[10] memory totalBets;
        for (uint8 i = 0; i < numOfResults; i++) {
            totalBets[i] = balances[i].totalBets;
        }
        return totalBets;
    }

    /*
    * @notice Gets total votes for all the results.
    * @return An array of total votes for all results.
    */
    function getTotalVotes() 
        public
        view
        returns (uint256[10])
    {
        uint256[10] memory totalVotes;
        for (uint8 i = 0; i < numOfResults; i++) {
            totalVotes[i] = balances[i].totalVotes;
        }
        return totalVotes;
    }
}
