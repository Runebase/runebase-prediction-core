pragma solidity ^0.4.18;

import "./IAddressManager.sol";
import "../libs/Ownable.sol";
import "../tokens/ERC20.sol";

contract AddressManager is IAddressManager, Ownable {
    uint256 public constant predDecimals = 8; // Number of decimals for PRED

    uint16 public currentEventFactoryIndex = 0; // Version of the next upgraded EventFactory contract
    uint16 public currentOracleFactoryIndex = 0; // Version of the next upgraded OracleFactory contract
    uint256 public eventEscrowAmount = 100 * (10**predDecimals); // Amount of escrow deposit needed to create an event
    uint256 public arbitrationLength = 86400; // Number of seconds for arbitration period
    uint256 public startingOracleThreshold = 100 * (10**predDecimals); // Consensus threshold for CentralizedOracles
    uint256 public thresholdPercentIncrease = 10; // Percentage to increase the Consensus Threshold every round
    mapping(address => uint16) public eventFactoryAddressToVersion;
    mapping(address => uint16) public oracleFactoryAddressToVersion;
    mapping(address => bool) private whitelistedContracts;

    // Events
    event RunebasePredictionTokenAddressChanged(address indexed _newAddress);
    event EventFactoryAddressAdded(uint16 _index, address indexed _contractAddress);
    event OracleFactoryAddressAdded(uint16 _index, address indexed _contractAddress);
    event EscrowDeposited(address indexed _depositer, uint256 escrowAmount);
    event EscrowWithdrawn(address indexed _eventAddress, address indexed _depositer, uint256 escrowAmount);
    event ContractWhitelisted(address indexed _contractAddress);

    // Modifiers
    modifier isWhitelisted(address _contractAddress) {
        require(whitelistedContracts[_contractAddress] == true);
        _;
    }

    constructor() Ownable(msg.sender) public {
    }

    /*
    * @notice Transfer the escrow amount needed to create an Event.
    * @param _creator The address of the creator.
    */
    function transferEscrow(address _creator)
        external
        isWhitelisted(msg.sender)
    {
        ERC20 token = ERC20(runebasepredictionTokenAddress);
        require(token.allowance(_creator, address(this)) >= eventEscrowAmount);

        token.transferFrom(_creator, address(this), eventEscrowAmount);

        emit EscrowDeposited(_creator, eventEscrowAmount);
    }

    /*
    * @notice Withdraws the escrow for an Event.
    * @param _creator The address of the creator.
    */
    function withdrawEscrow(address _creator, uint256 _escrowAmount)
        external
        isWhitelisted(msg.sender)
    {
        ERC20(runebasepredictionTokenAddress).transfer(_creator, _escrowAmount);

        emit EscrowWithdrawn(msg.sender, _creator, _escrowAmount);
    }

    /*
    * @dev Adds a whitelisted contract address. Only allowed to be called from previously whitelisted addresses.
    * @param _contractAddress The address of the contract to whitelist.
    */
    function addWhitelistContract(address _contractAddress)
        external
        isWhitelisted(msg.sender)
        validAddress(_contractAddress)
    {
        whitelistedContracts[_contractAddress] = true;

        emit ContractWhitelisted(_contractAddress);
    }

    /// @dev Allows the owner to set the address of the RunebasePrediction Token contract.
    /// @param _tokenAddress The address of the RunebasePrediction Token contract.
    function setRunebasePredictionTokenAddress(address _tokenAddress) 
        public 
        onlyOwner()
        validAddress(_tokenAddress) 
    {
        runebasepredictionTokenAddress = _tokenAddress;
        whitelistedContracts[_tokenAddress] = true;

        emit RunebasePredictionTokenAddressChanged(runebasepredictionTokenAddress);
        emit ContractWhitelisted(_tokenAddress);
    }

    /// @dev Allows the owner to set the address of an EventFactory contract.
    /// @param _contractAddress The address of the EventFactory contract.
    function setEventFactoryAddress(address _contractAddress) 
        public 
        onlyOwner()
        validAddress(_contractAddress)
    {
        uint16 index = currentEventFactoryIndex;
        eventFactoryVersionToAddress[index] = _contractAddress;
        eventFactoryAddressToVersion[_contractAddress] = index;
        currentEventFactoryIndex++;

        whitelistedContracts[_contractAddress] = true;

        emit EventFactoryAddressAdded(index, _contractAddress);
        emit ContractWhitelisted(_contractAddress);
    }

    /// @dev Allows the owner to set the version of the next EventFactory. In case AddressManager ever gets 
    ///   upgraded, we need to be able to continue where the last version was.
    /// @param _newIndex The index of where the next EventFactory version should start.
    function setCurrentEventFactoryIndex(uint16 _newIndex)
      public
      onlyOwner()
    {
      currentEventFactoryIndex = _newIndex;
    }

    /// @dev Allows the owner to set the address of an OracleFactory contract.
    /// @param _contractAddress The address of the OracleFactory contract.
    function setOracleFactoryAddress(address _contractAddress) 
        public 
        onlyOwner()
        validAddress(_contractAddress) 
    {
        uint16 index = currentOracleFactoryIndex;
        oracleFactoryVersionToAddress[index] = _contractAddress;
        oracleFactoryAddressToVersion[_contractAddress] = index;
        currentOracleFactoryIndex++;

        whitelistedContracts[_contractAddress] = true;

        emit OracleFactoryAddressAdded(index, _contractAddress);
        emit ContractWhitelisted(_contractAddress);
    }

    /// @dev Allows the owner to set the version of the next OracleFactory. In case AddressManager ever gets 
    ///   upgraded, we need to be able to continue where the last version was.
    /// @param _newIndex The index of where the next OracleFactory version should start.
    function setCurrentOracleFactoryIndex(uint16 _newIndex)
      public
      onlyOwner()
    {
      currentOracleFactoryIndex = _newIndex;
    }

    /*
    * @dev Sets the eventEscrowAmount that is needed to create an Event.
    * @param _newEscrowAmount The new escrow amount needed to create an Event.
    */
    function setEventEscrowAmount(uint256 _newEscrowAmount) 
        public
        onlyOwner()
    {   
        eventEscrowAmount = _newEscrowAmount;
    }

    /*
    * @dev Sets the arbitrationLength that DecentralizedOracles will use.
    * @param _newLength The new length in seconds (unix time) of an arbitration period.
    */
    function setArbitrationLength(uint256 _newLength) 
        public
        onlyOwner()
    {   
        require(_newLength > 0);

        arbitrationLength = _newLength;
    }

    /*
    * @dev Sets the startingOracleThreshold that CentralizedOracles will use.
    * @param _newThreshold The new consensusThreshold for CentralizedOracles.
    */
    function setStartingOracleThreshold(uint256 _newThreshold) 
        public
        onlyOwner()
    {   
        startingOracleThreshold = _newThreshold;
    }

    /*
    * @dev Sets the thresholdPercentIncrease that DecentralizedOracles will use.
    * @param _newIncrement The new increment amount for DecentralizedOracles.
    */
    function setConsensusThresholdPercentIncrease(uint256 _newPercentage) 
        public
        onlyOwner()
    {   
        thresholdPercentIncrease = _newPercentage;
    }

    /// @notice Gets the latest index of a deployed EventFactory contract.
    /// @return The index of the latest deployed EventFactory contract.
    function getLastEventFactoryIndex() 
        public 
        view 
        returns (uint16 lastEventFactoryIndex) 
    {
        if (currentEventFactoryIndex == 0) {
            return 0;
        } else {
            return currentEventFactoryIndex - 1;
        }
    }

    /// @notice Gets the latest index of a deployed OracleFactory contract.
    /// @return The index of the latest deployed OracleFactory contract.
    function getLastOracleFactoryIndex() 
        public 
        view 
        returns (uint16 lastOracleFactoryIndex) 
    {
        if (currentOracleFactoryIndex == 0) {
            return 0;
        } else {
            return currentOracleFactoryIndex - 1;
        }
    }
}
