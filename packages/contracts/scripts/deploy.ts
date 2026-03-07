import hre from "hardhat";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  // Fuji USDC address
  const USDC_ADDRESS = process.env.USDC_ADDRESS || "0x5425890298aed601595a70AB815c96711a31Bc65";
  const SETTLEMENT_SIGNER = process.env.SETTLEMENT_SIGNER || deployer.address;
  const FEE_RECIPIENT = process.env.FEE_RECIPIENT || deployer.address;
  const PROTOCOL_FEE_BPS = 300; // 3%

  const WagerWars = await hre.ethers.getContractFactory("WagerWars");
  const wagerWars = await WagerWars.deploy(
    USDC_ADDRESS,
    SETTLEMENT_SIGNER,
    PROTOCOL_FEE_BPS,
    FEE_RECIPIENT,
  );

  await wagerWars.waitForDeployment();
  const address = await wagerWars.getAddress();
  console.log("WagerWars deployed to:", address);

  console.log("\nVerify on Snowtrace:");
  console.log(`npx hardhat verify --network fuji ${address} ${USDC_ADDRESS} ${SETTLEMENT_SIGNER} ${PROTOCOL_FEE_BPS} ${FEE_RECIPIENT}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
