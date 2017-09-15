pragma solidity ^0.4.11;

import "./SafeMath.sol";

contract Topic {
    using SafeMath for uint256;

    struct Result {
        bytes32 name;
        uint256 balance;
        mapping (address => uint256) betBalances;
    }

    address public owner;
    bytes32 public name;
    Result[] results;
    uint256 public bettingEndBlock;
    uint finalResultIndex;
    bool public finalResultSet;

    event TopicCreated(bytes32 _name);
    event BetAccepted(address _better, uint _resultIndex, uint256 _betAmount, uint256 _betBalance);
    event WinningsWithdrawn(uint256 _amountWithdrawn);
    event FinalResultSet(uint _finalResultIndex);

    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

    modifier validResultIndex(uint _resultIndex) {
        require(_resultIndex >= 0);
        require(_resultIndex <= results.length - 1);
        _;
    }

    modifier validBet() {
        require(block.number < bettingEndBlock);
        require(msg.value > 0);
        _;
    }

    modifier hasEnded() {
        require(block.number >= bettingEndBlock);
        _;
    }

    modifier finalResultNotSet() {
        require(!finalResultSet);
        _;
    }

    modifier finalResultIsSet() {
        require(finalResultSet);
        _;
    }

    function Topic(address _owner, bytes32 _name, bytes32[] _resultNames, uint256 _bettingEndBlock) {
        owner = _owner;
        name = _name;

        // Cannot have a prediction topic with only 1 result
        // require(_resultNames.length > 1);

        for (uint i = 0; i < _resultNames.length; i++) {
            results.push(Result({
            name: _resultNames[i],
            balance: 0
            }));
        }

        bettingEndBlock = _bettingEndBlock;

        TopicCreated(name);
    }

    function getResultName(uint _resultIndex) 
        public 
        validResultIndex(_resultIndex) 
        constant 
        returns (bytes32) 
    {
        return results[_resultIndex].name;
    }

    function getResultBalance(uint _resultIndex) 
        public 
        validResultIndex(_resultIndex) 
        constant 
        returns (uint256) 
    {
        return results[_resultIndex].balance;
    }

    function getBetBalance(uint _resultIndex) 
        public 
        validResultIndex(_resultIndex) 
        constant 
        returns (uint256) 
    {
        return results[_resultIndex].betBalances[msg.sender];
    }

    function getTotalTopicBalance() public constant returns (uint256) {
        uint256 totalTopicBalance = 0;
        for (uint i = 0; i < results.length; i++) {
            totalTopicBalance = results[i].balance.add(totalTopicBalance);
        }
        return totalTopicBalance;
    }

    function bet(uint _resultIndex) public validBet payable {
        Result storage updatedResult = results[_resultIndex];
        updatedResult.balance = updatedResult.balance.add(msg.value);
        updatedResult.betBalances[msg.sender] = updatedResult.betBalances[msg.sender].add(msg.value);
        results[_resultIndex] = updatedResult;

        BetAccepted(msg.sender, _resultIndex, msg.value, results[_resultIndex].betBalances[msg.sender]);
    }

    function withdrawWinnings() public hasEnded finalResultIsSet {
        uint256 totalTopicBalance = getTotalTopicBalance();
        require(totalTopicBalance > 0);

        Result storage finalResult = results[finalResultIndex];
        uint256 betBalance = finalResult.betBalances[msg.sender];
        require(betBalance > 0);

        // Clear out balance in case withdrawBet() is called again before the prior transfer is complete
        finalResult.betBalances[msg.sender] = 0;

        uint256 withdrawAmount = totalTopicBalance.mul(betBalance).div(finalResult.balance);
        require(withdrawAmount > 0);

        msg.sender.transfer(withdrawAmount);

        WinningsWithdrawn(withdrawAmount);
    }

    function revealResult(uint _resultIndex)
        public
        onlyOwner
        hasEnded
        validResultIndex(_resultIndex)
        finalResultNotSet
    {
        finalResultIndex = _resultIndex;
        finalResultSet = true;
        FinalResultSet(finalResultIndex);
    }

    function getFinalResultIndex() 
        public 
        finalResultIsSet 
        constant 
        returns (uint) 
    {
        return finalResultIndex;
    }

    function getFinalResultName() 
        public 
        finalResultIsSet 
        constant 
        returns (bytes32) 
    {
        return results[finalResultIndex].name;
    }

    function destroy() onlyOwner {
        suicide(owner);
    }
}
