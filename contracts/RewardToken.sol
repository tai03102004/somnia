// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title RewardToken (ERC20)
 * @dev Reward token for community contributors
 */
contract RewardToken {
    string public name = "AI Signal Reward Token";
    string public symbol = "ASRT";
    uint8 public decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool) public isMinter;

    address public owner;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(
        address indexed owner,
        address indexed spender,
        uint256 value
    );
    event Mint(address indexed to, uint256 amount);
    event Burn(address indexed from, uint256 amount);
    event MinterAdded(address indexed minter);
    event MinterRemoved(address indexed minter);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyMinter() {
        require(isMinter[msg.sender] || msg.sender == owner, "Not minter");
        _;
    }

    constructor(uint256 _initialSupply) {
        owner = msg.sender;
        isMinter[msg.sender] = true;
        _mint(msg.sender, _initialSupply * 10 ** decimals);
    }

    /**
     * @dev Transfer tokens
     */
    function transfer(
        address _to,
        uint256 _value
    ) public returns (bool success) {
        require(balanceOf[msg.sender] >= _value, "Insufficient balance");
        require(_to != address(0), "Invalid address");

        balanceOf[msg.sender] -= _value;
        balanceOf[_to] += _value;

        emit Transfer(msg.sender, _to, _value);
        return true;
    }

    /**
     * @dev Approve spender
     */
    function approve(
        address _spender,
        uint256 _value
    ) public returns (bool success) {
        allowance[msg.sender][_spender] = _value;
        emit Approval(msg.sender, _spender, _value);
        return true;
    }

    /**
     * @dev Transfer from
     */
    function transferFrom(
        address _from,
        address _to,
        uint256 _value
    ) public returns (bool success) {
        require(_value <= balanceOf[_from], "Insufficient balance");
        require(_value <= allowance[_from][msg.sender], "Allowance exceeded");

        balanceOf[_from] -= _value;
        balanceOf[_to] += _value;
        allowance[_from][msg.sender] -= _value;

        emit Transfer(_from, _to, _value);
        return true;
    }

    /**
     * @dev Mint new tokens (only minter)
     */
    function mint(
        address _to,
        uint256 _amount
    ) external onlyMinter returns (bool) {
        _mint(_to, _amount);
        return true;
    }

    /**
     * @dev Internal mint function
     */
    function _mint(address _to, uint256 _amount) internal {
        require(_to != address(0), "Invalid address");

        totalSupply += _amount;
        balanceOf[_to] += _amount;

        emit Mint(_to, _amount);
        emit Transfer(address(0), _to, _amount);
    }

    /**
     * @dev Burn tokens
     */
    function burn(uint256 _amount) external returns (bool) {
        require(balanceOf[msg.sender] >= _amount, "Insufficient balance");

        balanceOf[msg.sender] -= _amount;
        totalSupply -= _amount;

        emit Burn(msg.sender, _amount);
        emit Transfer(msg.sender, address(0), _amount);
        return true;
    }

    /**
     * @dev Add minter
     */
    function addMinter(address _minter) external onlyOwner {
        isMinter[_minter] = true;
        emit MinterAdded(_minter);
    }

    /**
     * @dev Remove minter
     */
    function removeMinter(address _minter) external onlyOwner {
        isMinter[_minter] = false;
        emit MinterRemoved(_minter);
    }

    /**
     * @dev Transfer ownership
     */
    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "Invalid address");
        owner = _newOwner;
    }
}
