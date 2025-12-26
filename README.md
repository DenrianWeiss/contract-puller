# Contract Puller

A Node.js CLI tool that fetches smart contract source from exploree and rebuild the structure locally.

## Installation

Download from the artifact or just copy the index.js

## Usage

### Command Line

```bash
# Basic usage
node index.js --address 0xYourContractAddress --api-key YOUR_API_KEY

# Or if installed globally
contract-puller --address 0xYourContractAddress --api-key YOUR_API_KEY

# Custom output directory
node index.js -a 0xYourContractAddress -k YOUR_API_KEY -o ./my-contracts

# Custom chain ID (e.g., for Polygon)
node index.js -a 0xYourContractAddress -k YOUR_API_KEY -c 137
```

### Environment Variables

You can also use environment variables:

```bash
export ETHERSCAN_API_KEY="YOUR_API_KEY"
export CONTRACT_ADDRESS="0xYourContractAddress"
export CHAIN_ID="1"
export OUTPUT_DIR="./contracts"
export API_URL="https://api.etherscan.io/v2/api"

node index.js
```

### Options

| Option | Short | Environment Variable | Description | Default |
|--------|-------|---------------------|-------------|---------|
| `--address` | `-a` | `CONTRACT_ADDRESS` | Contract address to fetch (required) | - |
| `--api-key` | `-k` | `ETHERSCAN_API_KEY` | API key for the explorer | - |
| `--api-url` | `-u` | `API_URL` | API base URL | `https://api.etherscan.io/v2/api` |
| `--chain-id` | `-c` | `CHAIN_ID` | Chain ID | `1` (Ethereum mainnet) |
| `--output` | `-o` | `OUTPUT_DIR` | Output directory | `./contracts` |
| `--help` | `-h` | - | Show help message | - |


### metadata.json

Contains raw result from the explorer, 

## License

MIT
