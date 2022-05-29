import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { Registrar } from "../typechain";

const utils = ethers.utils;
const SECONDS_IN_DAY = 86400;

describe("Registrar", function () {
  let registrar: Registrar;
  let deployer: SignerWithAddress,
    user1: SignerWithAddress,
    user2: SignerWithAddress;

  const name = "ABC";
  const secret = "QWERTY";
  const label = utils.solidityKeccak256(["string"], [name]);
  let defaultCommitment: string;

  beforeEach(async function () {
    [deployer, user1, user2] = await ethers.getSigners();

    const Registrar = await ethers.getContractFactory("Registrar");
    registrar = await Registrar.connect(deployer).deploy();
    await registrar.deployed();

    defaultCommitment = utils.solidityKeccak256(
      ["bytes32", "address", "bytes32"],
      [label, user1.address, utils.formatBytes32String(secret)]
    );
  });

  it("Should be a valid deployment", async function () {
    expect(await registrar.feeRecipient()).to.equal(deployer.address);
    expect(await registrar.DURATION()).to.equal(SECONDS_IN_DAY * 365);
    expect(await registrar.LOCK_AMOUNT()).to.equal(
      ethers.constants.WeiPerEther
    );
    expect(await registrar.MIN_COMMITMENT_DELAY()).to.equal(5 * 60);
    expect(await registrar.feeTiers(0)).to.equal(parseUnits("0.3", 18));
    expect(await registrar.feeTiers(1)).to.equal(parseUnits("0.2", 18));
  });

  it("Should commit", async function () {
    const commitment = defaultCommitment;
    await registrar.connect(user1).commit(commitment);
    const blockTimeStamp = (await ethers.provider.getBlock("latest")).timestamp;
    expect(await registrar.commitments(commitment)).to.equal(blockTimeStamp);
  });

  it("Should not duplicate commit", async function () {
    const commitment = defaultCommitment;
    await registrar.connect(user1).commit(commitment);
    await expect(
      registrar.connect(user1).commit(commitment)
    ).to.be.revertedWith(`AlreadyCommitted`);
    await expect(
      registrar.connect(user1).commit(commitment)
    ).to.be.revertedWith(`AlreadyCommitted("${commitment}")`);
  });

  it("Should not register without commitment", async function () {
    const commitment = defaultCommitment;
    await expect(
      registrar
        .connect(user1)
        .registerPostCommit(
          commitment,
          name,
          user1.address,
          utils.formatBytes32String(secret)
        )
    ).to.be.revertedWith(`InvalidCommitment("${commitment}")`);
  });

  it("Should not register without commitment delay", async function () {
    const commitment = defaultCommitment;
    await registrar.connect(user1).commit(commitment);

    await expect(
      registrar
        .connect(user1)
        .registerPostCommit(
          commitment,
          name,
          user1.address,
          utils.formatBytes32String(secret)
        )
    ).to.be.revertedWith(`NotDelayedCommitment("${commitment}")`);
  });

  it("Should not register with invalid commitment", async function () {
    const commitment = defaultCommitment;
    await registrar.connect(user1).commit(commitment);

    const delay = await registrar.MIN_COMMITMENT_DELAY();
    const blockTimeStamp = (await ethers.provider.getBlock("latest")).timestamp;
    await ethers.provider.send("evm_mine", [blockTimeStamp + delay.toNumber()]);

    const wrongCommitment = utils.solidityKeccak256(
      ["bytes32", "address", "bytes32"],
      [label, user2.address, utils.formatBytes32String(secret)]
    );
    await expect(
      registrar
        .connect(user1)
        .registerPostCommit(
          commitment,
          name,
          user2.address,
          utils.formatBytes32String(secret)
        )
    ).to.be.revertedWith(
      `CommitmentMismatch("${commitment}", "${wrongCommitment}")`
    );
  });

  it("Should not register with insufficieant sent funds", async function () {
    const commitment = defaultCommitment;
    await registrar.connect(user1).commit(commitment);

    const delay = await registrar.MIN_COMMITMENT_DELAY();
    const blockTimeStamp = (await ethers.provider.getBlock("latest")).timestamp;
    await ethers.provider.send("evm_mine", [blockTimeStamp + delay.toNumber()]);

    const lockAmt = await registrar.LOCK_AMOUNT();
    const fee = await registrar.calcFee(name);
    await expect(
      registrar
        .connect(user1)
        .registerPostCommit(
          commitment,
          name,
          user1.address,
          utils.formatBytes32String(secret),
          {
            value: lockAmt.add(fee).sub(1),
          }
        )
    ).to.be.revertedWith(`InsufficientAmount`);
  });

  it("Should register", async function () {
    const commitment = defaultCommitment;

    await registrar.connect(user1).commit(commitment);
    const delay = await registrar.MIN_COMMITMENT_DELAY();
    let blockTimeStamp = (await ethers.provider.getBlock("latest")).timestamp;
    await ethers.provider.send("evm_mine", [blockTimeStamp + delay.toNumber()]);
    const lockAmt = await registrar.LOCK_AMOUNT();
    const fee = await registrar.calcFee(name);
    const tx = await registrar
      .connect(user1)
      .registerPostCommit(
        commitment,
        name,
        user1.address,
        utils.formatBytes32String(secret),
        {
          value: lockAmt.add(fee),
        }
      );
    expect(tx).to.changeEtherBalance(deployer, fee);
    expect(await registrar.ownerOf(name)).to.equal(user1.address);
    expect(await registrar.commitments(commitment)).to.equal(0);
    expect(await ethers.provider.getBalance(registrar.address)).to.equal(
      lockAmt
    );

    blockTimeStamp = (await ethers.provider.getBlock("latest")).timestamp;
    const [owner, registeredAt] = await registrar.registry(label);
    expect(owner).to.equal(user1.address);
    expect(registeredAt).to.equal(BigNumber.from(blockTimeStamp));
  });

  it("Should not register already registered name", async function () {
    const commitment = defaultCommitment;
    await registrar.connect(user1).commit(commitment);
    const delay = await registrar.MIN_COMMITMENT_DELAY();
    let blockTimeStamp = (await ethers.provider.getBlock("latest")).timestamp;
    await ethers.provider.send("evm_mine", [blockTimeStamp + delay.toNumber()]);
    const lockAmt = await registrar.LOCK_AMOUNT();
    const fee = await registrar.calcFee(name);
    await registrar
      .connect(user1)
      .registerPostCommit(
        commitment,
        name,
        user1.address,
        utils.formatBytes32String(secret),
        {
          value: lockAmt.add(fee),
        }
      );

    await registrar.connect(user1).commit(commitment);
    blockTimeStamp = (await ethers.provider.getBlock("latest")).timestamp;
    await ethers.provider.send("evm_mine", [blockTimeStamp + delay.toNumber()]);
    await expect(
      registrar
        .connect(user1)
        .registerPostCommit(
          commitment,
          name,
          user1.address,
          utils.formatBytes32String(secret)
        )
    ).to.be.revertedWith(`AlreadyRegistered("${name}")`);
  });

  it("Should extent registration", async function () {
    const commitment = defaultCommitment;
    await registrar.connect(user1).commit(commitment);
    const delay = await registrar.MIN_COMMITMENT_DELAY();
    let blockTimeStamp = (await ethers.provider.getBlock("latest")).timestamp;
    await ethers.provider.send("evm_mine", [blockTimeStamp + delay.toNumber()]);
    const lockAmt = await registrar.LOCK_AMOUNT();
    const fee = await registrar.calcFee(name);
    await registrar
      .connect(user1)
      .registerPostCommit(
        commitment,
        name,
        user1.address,
        utils.formatBytes32String(secret),
        {
          value: lockAmt.add(fee),
        }
      );

    const nextTimestamp = Date.now() / 1000 + SECONDS_IN_DAY * 364;
    await ethers.provider.send("evm_mine", [nextTimestamp]);

    const tx = await registrar.connect(user1).extendRegistration(name, {
      value: fee,
    });
    const txRecp = await tx.wait();
    expect(tx).to.changeEtherBalance(deployer, fee);

    blockTimeStamp = (await ethers.provider.getBlock(txRecp.blockNumber))
      .timestamp;
    const [owner, registeredAt] = await registrar.registry(label);
    expect(owner).to.equal(user1.address);
    expect(registeredAt).to.equal(BigNumber.from(blockTimeStamp));
  });

  it("Should deregister", async function () {
    const commitment = defaultCommitment;
    await registrar.connect(user1).commit(commitment);
    const delay = await registrar.MIN_COMMITMENT_DELAY();
    const blockTimeStamp = (await ethers.provider.getBlock("latest")).timestamp;
    await ethers.provider.send("evm_mine", [blockTimeStamp + delay.toNumber()]);
    const lockAmt = await registrar.LOCK_AMOUNT();
    const fee = await registrar.calcFee(name);
    await registrar
      .connect(user1)
      .registerPostCommit(
        commitment,
        name,
        user1.address,
        utils.formatBytes32String(secret),
        {
          value: lockAmt.add(fee),
        }
      );

    const nextTimestamp =
      (await ethers.provider.getBlock("latest")).timestamp +
      SECONDS_IN_DAY * 366;
    await ethers.provider.send("evm_mine", [nextTimestamp]);

    await expect(
      await registrar.connect(user2).deregister(name)
    ).to.changeEtherBalance(user1, lockAmt);
    expect(await registrar.ownerOf(name)).to.equal(
      ethers.constants.AddressZero
    );

    const [owner, registeredAt] = await registrar.registry(label);
    expect(owner).to.equal(ethers.constants.AddressZero);
    expect(registeredAt).to.equal(0);
  });
});
