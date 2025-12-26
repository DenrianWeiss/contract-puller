#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// Parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    const config = {
        apiKey: process.env.ETHERSCAN_API_KEY || '',
        address: process.env.CONTRACT_ADDRESS || '',
        apiUrl: process.env.API_URL || 'https://api.etherscan.io/v2/api',
        chainId: process.env.CHAIN_ID || '1',
        outputDir: process.env.OUTPUT_DIR || './contracts'
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--api-key':
            case '-k':
                config.apiKey = args[++i];
                break;
            case '--address':
            case '-a':
                config.address = args[++i];
                break;
            case '--api-url':
            case '-u':
                config.apiUrl = args[++i];
                break;
            case '--output':
            case '-o':
                config.outputDir = args[++i];
                break;
            case '--chain-id':
            case '-c':
                config.chainId = args[++i];
                break;
            case '--help':
            case '-h':
                showHelp();
                process.exit(0);
            default:
                if (!config.address && args[i] && !args[i].startsWith('-')) {
                    config.address = args[i];
                }
        }
    }

    return config;
}

function showHelp() {
    console.log(`
Contract Puller - Fetch smart contract source code from blockchain explorers

Usage:
  contract-puller [options] [address]

Options:
  -a, --address <address>    Contract address (required)
  -k, --api-key <key>        API key for the explorer
  -u, --api-url <url>        API base URL (default: https://api.etherscan.io/v2/api)
  -c, --chain-id <id>        Chain ID (default: 1 for Ethereum mainnet)
  -o, --output <dir>         Output directory (default: ./contracts)
  -h, --help                 Show this help message

Environment Variables:
  CONTRACT_ADDRESS           Contract address
  ETHERSCAN_API_KEY         API key for Etherscan/Blockscout
  API_URL                   API base URL
  CHAIN_ID                  Chain ID (default: 1)
  OUTPUT_DIR                Output directory

Examples:
  contract-puller --address 0x123... --api-key YOUR_KEY
  CONTRACT_ADDRESS=0x123... ETHERSCAN_API_KEY=YOUR_KEY contract-puller
  `);
}

// Make HTTPS request
function httpsGet(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve(data);
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                }
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

// Fetch contract source code
async function fetchContract(apiUrl, address, apiKey, chainId) {
    const url = `${apiUrl}?chainid=${chainId}&module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`;

    console.log(`Fetching contract from: ${address}`);

    const response = await httpsGet(url);
    const data = JSON.parse(response);

    if (data.status !== '1') {
        throw new Error(`API Error: ${data.message} - ${data.result}`);
    }

    if (!data.result || data.result.length === 0) {
        throw new Error('No contract data returned');
    }

    return data.result[0];
}

// Parse source code (handle both single file and multi-file formats)
function parseSourceCode(sourceCode, contractName) {
    if (!sourceCode) {
        throw new Error('Empty source code');
    }

    // Try to parse as JSON (multi-file contract)
    if (sourceCode.startsWith('{')) {
        try {
            let parsed = sourceCode;

            // Handle {{...}} format (double-wrapped) - remove outer braces first
            if (sourceCode.startsWith('{{')) {
                parsed = sourceCode.slice(1, -1);
            }

            const jsonData = JSON.parse(parsed);

            // Handle {sources: {...}} format - this is the multi-file contract format
            if (jsonData.sources && typeof jsonData.sources === 'object') {
                // Return the sources object which has structure: { "path/to/file.sol": { "content": "..." } }
                return jsonData.sources;
            }

            // If no sources property, it might be a different format, return as is
            return jsonData;
        } catch (e) {
            // If JSON parsing fails, treat as single file
            const fileName = contractName ? `${contractName}.sol` : 'Contract.sol';
            return { [fileName]: { content: sourceCode } };
        }
    }

    // Single file contract - use contract name
    const fileName = contractName ? `${contractName}.sol` : 'Contract.sol';
    return { [fileName]: { content: sourceCode } };
}

// Write files to filesystem
function writeContractFiles(contractData, outputDir, contractName) {
    const actualContractName = contractName || contractData.ContractName || 'UnknownContract';
    const sources = parseSourceCode(contractData.SourceCode, contractData.ContractName);

    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log(`\nWriting files to: ${outputDir}`);

    // Write source files directly to outputDir
    let fileCount = 0;
    const fileList = [];
    for (const [filePath, fileData] of Object.entries(sources)) {
        const content = fileData.content || fileData;
        const fullPath = path.join(outputDir, filePath);

        // Create subdirectories if needed
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`  ✓ ${filePath}`);
        fileList.push(filePath);
        fileCount++;
    }

    // Prepare metadata and ABI for results file
    const metadata = {
        contractName: contractData.ContractName,
        compilerVersion: contractData.CompilerVersion,
        optimizationUsed: contractData.OptimizationUsed === '1',
        runs: contractData.Runs,
        evmVersion: contractData.EVMVersion,
        licenseType: contractData.LicenseType,
        proxy: contractData.Proxy === '1',
        implementation: contractData.Implementation,
        constructorArguments: contractData.ConstructorArguments
    };

    // Parse ABI if available
    let abi = null;
    if (contractData.ABI && contractData.ABI !== 'Contract source code not verified') {
        try {
            abi = JSON.parse(contractData.ABI);
        } catch (e) {
            abi = contractData.ABI;
        }
    }

    return {
        fileCount,
        contractDir: outputDir,
        metadata,
        abi,
        fileList,
        directoryName: actualContractName
    };
}

// Save or update results file
function saveResults(outputDir, contractResults) {
    const resultsPath = path.join(outputDir, 'results.json');
    let allResults = {};

    // Load existing results if file exists
    if (fs.existsSync(resultsPath)) {
        try {
            const existing = fs.readFileSync(resultsPath, 'utf8');
            allResults = JSON.parse(existing);
        } catch (e) {
            // If can't parse, start fresh
            allResults = {};
        }
    }

    // Add or update this contract's results
    allResults[contractResults.address] = {
        address: contractResults.address,
        contractName: contractResults.metadata.contractName,
        directory: contractResults.directoryName,
        files: contractResults.fileList,
        metadata: contractResults.metadata,
        abi: contractResults.abi,
        fetchedAt: new Date().toISOString()
    };

    // Write results file
    fs.writeFileSync(resultsPath, JSON.stringify(allResults, null, 2), 'utf8');
    console.log(`\n  ✓ Updated ${resultsPath}`);
}

// Main function
async function main() {
    const config = parseArgs();

    // Validate required parameters
    if (!config.address) {
        console.error('Error: Contract address is required\n');
        showHelp();
        process.exit(1);
    }

    if (!config.apiKey) {
        console.error('Warning: No API key provided. Rate limits may apply.\n');
    }

    try {
        // Fetch the contract
        let contractData = await fetchContract(config.apiUrl, config.address, config.apiKey, config.chainId);
        const originalAddress = config.address;

        console.log(`Contract: ${contractData.ContractName}`);
        console.log(`Compiler: ${contractData.CompilerVersion}`);

        // Check if this is a proxy contract
        if (contractData.Proxy === '1' && contractData.Implementation) {
            console.log(`\n[WARN] Proxy contract detected!`);
            console.log(`Implementation address: ${contractData.Implementation}`);

            // Write the proxy contract first
            const proxyResult = writeContractFiles(contractData, config.outputDir, `${contractData.ContractName}_Proxy`);
            console.log(`\nProxy contract saved: ${proxyResult.fileCount} files written`);

            // Save proxy results
            saveResults(config.outputDir, {
                address: originalAddress,
                ...proxyResult
            });

            // Now fetch and write the implementation contract
            console.log(`\nFetching implementation contract...`);
            const implAddress = contractData.Implementation;
            contractData = await fetchContract(config.apiUrl, implAddress, config.apiKey, config.chainId);

            console.log(`Implementation: ${contractData.ContractName}`);
            console.log(`Compiler: ${contractData.CompilerVersion}`);

            // Write implementation files
            const result = writeContractFiles(contractData, config.outputDir, contractData.ContractName);

            // Save implementation results
            saveResults(config.outputDir, {
                address: implAddress,
                ...result
            });

            console.log(`\n[INFO] Success! ${result.fileCount} files written to ${result.contractDir}`);

            // Show summary
            console.log('\nContract Summary:');
            console.log(`  Name: ${result.metadata.contractName}`);
            console.log(`  Compiler: ${result.metadata.compilerVersion}`);
            console.log(`  Optimization: ${result.metadata.optimizationUsed ? `Yes (${result.metadata.runs} runs)` : 'No'}`);
            console.log(`  License: ${result.metadata.licenseType}`);
        } else {
            // Write the contract files
            const result = writeContractFiles(contractData, config.outputDir, contractData.ContractName);

            // Save results
            saveResults(config.outputDir, {
                address: originalAddress,
                ...result
            });

            console.log(`\n[INFO] Success! ${result.fileCount} files written to ${result.contractDir}`);

            // Show summary
            console.log('\nContract Summary:');
            console.log(`  Name: ${result.metadata.contractName}`);
            console.log(`  Compiler: ${result.metadata.compilerVersion}`);
            console.log(`  Optimization: ${result.metadata.optimizationUsed ? `Yes (${result.metadata.runs} runs)` : 'No'}`);
            console.log(`  License: ${result.metadata.licenseType}`);

            if (result.metadata.proxy) {
                console.log(`  Proxy: Yes (Implementation: ${result.metadata.implementation})`);
            }
        }

    } catch (error) {
        console.error(`\n[ERRO] Error: ${error.message}`);
        process.exit(1);
    }
}

// Run the CLI
main();
