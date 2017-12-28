pragma solidity ^0.4.18;

contract BaseContract {
    struct ResultBalance {
        uint256 totalBets;
        uint256 totalVotes;
        mapping(address => uint256) bets;
        mapping(address => uint256) votes;
    }

    uint8 public constant INVALID_RESULT_INDEX = 255;

    uint8 public numOfResults;
    uint16 public version;
    bytes32[10] public eventName;
    bytes32[11] public eventResults;
}
