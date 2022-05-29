# Name Registry

A Name Registering System built upon Ethereum Smart Contracts using Solidity.

## Key Features

- Frontrun protection
- Fully decentralised (No admin priviledges)
- Automated protocol revenues
- Registration extention and expiry

## User Workflow

Registering a name is a two step process but first the user will need some ETH in his account to pay for staking amount and registering fee. These values can be fetched by querying the LOCK_AMOUNT() and calcFee() functions respectively. The registering fee is dependant upon the length of the name which the user wants to register.

To be a frontrun protected system, the protocol follows a commit-reveal pattern combined with a delay mechanism. So to register a name the user needs to submit these two transactions.

1. To commit a signature containing the registration details.
2. To actually register the name.

A delay is mandatory between these two transactions to make the system frontrun resistant.

These are the steps for registration:

1. User will need to generate a 32 byte hash of the registering name, his address and a secret text.
   Solidity implementation:
   `abi.encodePacked(keccak256(bytes(name)), owner, secret)`.

2. Call the commit() function on Registrar contract with the previously calculated value as input.
3. Call registerPostCommit() function.

Additional steps:

4. To extend a registration, user can call extendRegistration() function. This will cost user registering fee.
5. To deregister a registration, user or anyone else can call the deregister() function. This will also return the staked amount of user.

## TODOs

These the features/enhancements which can be further added to the protocol.

- perform more validations on function inputs
- transfer of a name registry
- ownership of a name can be denominated as an NFT
- ability to change protocol fee recipient
- invalidate older commits
- deregister a name before its expiry

## Disclaimer

This protocol is just a proof of concept. Please use at your own risk.
