**Note**: Currently in active development

# bwdb

[![Build Status](https://travis-ci.org/bitpay/bwdb.svg?branch=master)](https://travis-ci.org/bitpay/bwdb)

A bitcoin wallet database for multiple wallets with millions of addresses and transactions.

## Development and Testing

Installing:
```bash
git clone https://github.com/bitpay/bwdb
cd bwdb
npm install
```

Running all of the tests, coverage and linting:
```bash
npm run test
npm run coverage
npm run integration
npm run regtest
npm run jshint
```

Running the daemon and utilities:
```bash
./bin/bwdb --help
./bin/bwdb-cli --help
```

And with testnet *(or regtest)*:
```bash
./bin/bwdb --testnet <command>
./bin/bwdb-cli --testnet <command>
```

## Database Design

Wallet data is stored in a [B+ tree](https://en.wikipedia.org/wiki/B%2B_tree) using the key/value pairs shown below. The design is optimized for wallet queries for balances, txids, transactions, addresses and utxos. Multiple wallets are supported, each with several million addresses and transactions.

### Structures

Database    | Key | Value
----------- | ------------ | -------------
Address | walletId, addressType, addressHash  | null
Address Map | addressType, addressHash | walletId[]
Block | height | blockHash, blockAddressFilter, deltas, spentOutputs
Transaction | walletId, txid | walletTransaction
Txid | walletId, height, blockIndex | txid
UTXO | walletId, txid, outputIndex | height, satoshis, addressType, addressHash
UTXO Satoshis | walletId, satoshis, txid, outputIndex | height, addressType, addressHash
UTXO Height | walletId, height, txid, outputIndex | satoshis, addressType, addressHash
Wallet | walletId | addressFilter, balance

### Types

Type    | Size | Encoding | Description
----------- | ------------ | ------------- | ----------
walletId    | 32 bytes  |  | Wallet identifier
addressType | 1 byte |  | Either 01 *(pubkey)* or 02 *(script)*
addressHash | 20 bytes | | The publickey or script hash
height | 4 bytes | uint32be | The block height
blockIndex | 4 bytes | uint32be | The transaction index in block
txid | 32 bytes |  | Transaction identifier
satoshis | 8 bytes | doublebe |
outputIndex | 4 bytes | uint32be | The output index
addressFilter | ? | BSON | Bloom filter with wallet's addresses
balance | ? | BSON | Confirmed balance for the wallet
blockHash | ? | BSON | Hash of the latest block
blockAddressFilter | ? | BSON | Bloom filter with all addresses
walletTransaction | ? | BSON | Wallet transaction JSON (see below)
deltas | ? | BSON | All of the address deltas in the block
spentOutputs | ? | BSON | All outputs that were spent in the block

### Wallet Transaction JSON Format

```json
{
  "blockHash": "0000000000000000024e3d937faf0da8898b4e125a72810253e83ee53e0188a8",
  "blockIndex": 44,
  "height": 409938,
  "blockTimestamp": 1462229100,
  "version": 1,
  "hash": "82c4ea12e5d7bfaa54d90aa96080f41af1f700ad1a2d122fb7e42fb25ba66e78",
  "locktime": 0,
  "inputSatoshis": 17805609,
  "outputSatoshis": 17765609,
  "inputs": [
    {
      "wallet": false,
      "satoshis": 17805609,
      "address": "1LivuBq28WP6X7D2JKb77wz1pVXo9LEbsK",
      "prevTxId": "563291347309d03f40fa056a02390c44b95dfad668021acc1b18dded8d355c33",
      "outputIndex": 0,
      "sequence": 4294967295
    }
  ],
  "outputs": [
    {
      "script": "76a914819bc856ce0182e720b27f8810a72ecbf4b651aa88ac",
      "satoshis": 17265609,
      "address": "1CpJni8cZ63BV3pA6cSBp5nWd71hx5MgX2",
      "wallet": false
    },
    {
      "script": "76a914b3407d4b4d1fca87fb930abe3fa6c2baed6e6fd888ac",
      "satoshis": 500000,
      "address": "1HLoD9E4SDFFPDiYfNYnkBLQ85Y51J3Zb1",
      "wallet": true
    }
  ],
  "feeSatoshis": 40000
}
```

## Process Structure

There are three groups of processes that are started from the `bwdb` master process:

```
               [bwdb]
              /   |   \
           /      |      \
        /         |         \
[bwdb-web]  [bwdb-writer]  [bitcoind]
[bwdb-web]
[bwdb-web]
[bwdb-web]
[bwdb-web]
```

- Bitcoin block chain process, `bitcoind`, is accessible via ZMQ and JSON-RPC for requesting block and address deltas.
- Wallet writer process, `bwdb-writer` opens a unix socket for other processes to add to the writer queue. The writer is the only process that can open a write database transaction.
- Wallet reader processes, `bwdb-web-master` with several `bwdb-web` processes that listen at a port for the wallet API, described below. Only read-only database transactions can be opened in these processes.

## Questions

- **Why use LMDB?** It's atomic so that blocks can be applied and unapplied with confidence that it will not be left in an incomplete state. It's a B+ tree database which is great for iterating across key-values in sequence, a common use case. It's also possible to read from the database from multiple processes which is great for Node.js clustering.

- **How does wallet synchronization work?** There are two modes of synchronization, there is the "active" mode and the "historical" mode. When an address is added to a wallet, there is the "historical" sync that will scan the block chain for relevant transactions and make adjustments to the wallet. This is using a fork of Bitcoin Core with additional address indexes to make these queries. Once the address has been added, it will then stay synced in "active" mode. When a new block arrives, only the wallets changed by the wallet will be updated. This optimization makes it possible to optimize queries in advance per wallet by knowing which addresses belong together, and thus a wallet can have millions of addresses and transactions.

- **What influenced the design of the data structures?** There were several criteria that guided the structure. There needed to be support for multiple wallets, and thus there needed to be a way to query by a wallet identifier. Furthermore, there are several wallet queries that need to be made including: transactions, txids, balances, and utxos. The main entry point for transaction history is the txids database that organizes txids in block order. A query to get full transaction details is a query to the txids at a block height and index, followed by queries for the details of each of those transactions. A query for utxos is a bit different because it's typically requested by satoshis amount. For this reason there are three databases for utxos and each with a separate key, with each optimized for querying by either wallet id and satoshis or by wallet id and height. The last utxo database is for internal utxo book keeping. There is also a block database, and this keeps track of the current block chain state of the wallets. Every time there is a new block that has been applied to the wallets, a new block is added. A query to determine the current block chain height is a query to the last entry in blocks, with the largest block height.

- **Why does the block database keep additional block data?** This is because we need to store undo information for each block that is applied to the database, so that in the event of a reorganization, we can atomically unapply those changes. As time goes on this database could grow in size, and as such it's possible to prune out old data once there is sufficient confidence that there will not be a block reorganization more than "n" blocks deep.

- **What influenced the format of the transaction JSON format?** The transaction that is returned for a wallet query is different than the serialization format of a typical bitcoin transaction. It includes some meta information about which block it was included, the total input and output satoshi amount and fees that would otherwise need to be several queries. The address of the input and outputs are included, rather than simply a "pointer" to the output that would have this information. There is also a field "wallet" that is a boolean to determine if this output or input is part of the wallet, without needing to manually scan through the transaction. You will also notice that all of the data is cachable, "confirmations" is not included so that any future queries can more quickly read the data without it being necessary to make possibly several thousand random reads, and computation time to assemble the data.

- **Why use multiple processes and Node.js?** It's to glue together consensus critical functionality of bitcoind, written in C/C++, with wallet functionality written in JavaScript for browser based wallet applications written with Cordova, Electron, NW.js and Node.js. There are several reader workers for improved concurrency that is common when handling multiple wallets.

## Wallet API

### Create Wallets

A wallet identified by a 32 byte hexidecimal string. A status code of 204 will be given if the wallet already exists, otherwise status code 201 is given.

`PUT /wallets/:walletId`

### Add Addresses

Add an address to a wallet so that txids, transactions, utxos and the balance can be queried for the wallet. A status code of 201 will be given if the address was newly added, and a status code of 200 if the address was already added.

`PUT /wallets/:walletId/addresses/:address`

If many addreses are being added it's better to add many together. A status code of 201 will be given if new addresses have been added in the set, and the response will include the addresses that have been added. If no new addresses have been added a status code of 204 will be given.

`POST /wallets/:walletId/addresses`

Example JSON params:
```json
{
  "addresses": ["12c6DSiU4Rq3P4ZxziKxzrL5LmMBrzjrJX", "1HLoD9E4SDFFPDiYfNYnkBLQ85Y51J3Zb1"]
}
```

### Get Balance

`GET /wallets/:walletId/balance`

Example response:

```json
{
  "balance": 8354268032
}
```

### Get Txids

`GET /wallets/:walletId/txids`

Example response:

```json
{
  "txids": [
    "cd1274c9561b5fdf60255caec601055156d42fd35d6da294cfa360bf0fa1c41a",
    "32cbbaa866c1a820e8a3d81002da3e1338e98416d0d5c6970c938faa1ccec085",
    "9c92d5880d76f33f67362edbd1fa03642448e815d82194331c59ae21414aec83",
    "d0459025f8ae12963912a2ccac3a545964a781bf9977bcce5c408d1fc66eb0c8",
    "f8318ccc98cb6c73a3f56b8a170ef428c6440a0c42d962cb6e302620ec783f5b",
    "11376cf3615d9d81bf43ed4cec2c32f321fc5eea7e335989b528e2be49a90381",
    "8b8772b4b852b5ee162ed491f2793c1da70fe48cd8b35f4280a547dce09f09f5",
    "222b435bab905e3e24ccbe3147a8c4dd5fc3d064341bc939f8c59bbad713b3e4",
    "55755da7ba5cae94170ba0c33db27699c919c1ff42198467927702a76f8e0c6d",
    "8142571d9daeba73a8fb1ea0ee799653fa0ccc300218011515afcd395da9e0fe"
  ],
  "start": {
    "height": 422555,
    "index": 0
  },
  "end": {
    "height": 422514,
    "index": 1240
  }
}
```

### Get Transactions

`GET /wallets/:walletId/transactions`

Example response:

```json
{
  "transactions": [
    {
      "blockHash": "0000000000000000016b9ff97eec5ed2ed44b833b7fa593dadb98ace6e05930a",
      "blockIndex": 1240,
      "height": 422514,
      "blockTimestamp": 1469651594,
      "version": 1,
      "hash": "8142571d9daeba73a8fb1ea0ee799653fa0ccc300218011515afcd395da9e0fe",
      "locktime": 0,
      "inputSatoshis": 690000,
      "outputSatoshis": 670000,
      "inputs": [
        {
          "wallet": false,
          "satoshis": 500000,
          "address": "1LuckyY9fRzcJre7aou7ZhWVXktxjjBb9S",
          "prevTxId": "2bda2c395b484762c7c87c79ffec340c42097132c1aeca05fcf2289afedd4d91",
          "outputIndex": 15,
          "sequence": 4294967295
        },
        {
          "wallet": true,
          "satoshis": 190000,
          "address": "1NxaBCFQwejSZbQfWcYNwgqML5wWoE3rK4",
          "prevTxId": "7beeacffd4804dd17e710a7329a518eeaa04b6ce167a3954d248b9779597ac13",
          "outputIndex": 1,
          "sequence": 4294967295
        }
      ],
      "outputs": [
        {
          "script": "76a91405147a48d37f67e905c567683eae30fa328b509588ac",
          "satoshis": 490000,
          "address": "1TrumpveJrAYhsmuU2FdeMy48wuvQswKn",
          "wallet": false
        },
        {
          "script": "76a914f0dd368cc5ce378301947691548fb9b2c8a0b69088ac",
          "satoshis": 180000,
          "address": "1NxaBCFQwejSZbQfWcYNwgqML5wWoE3rK4",
          "wallet": true
        }
      ],
      "feeSatoshis": 20000
    }
  ],
  "start": {
    "height": 422555,
    "index": 0
  },
  "end": {
    "height": 422514,
    "index": 1240
  }
}
```

### Get Unspent Outputs

Unspent outputs can be queried by satoshis as well as by block height and confirmation.

`GET /wallets/:walletId/utxos`

Example response:

```json
{
  "utxos": [
    {
      "address": "1dice8EMZmqKvrGE4Qc9bUFf9PX3xaYDp",
      "satoshis": 9000,
      "height": 335525,
      "txid": "0169b6c82dcfa697c867504c53734de856c2b60b130441649d6d52aba1e3b811",
      "index": 1
    },
    {
      "address": "1dice8EMZmqKvrGE4Qc9bUFf9PX3xaYDp",
      "satoshis": 1,
      "height": 211738,
      "txid": "019d5a495c92dad98857c2192bc5367edf099a975792860ff6bf6ddd6c63bd3d",
      "index": 7
    }
  ],
  "start": {
    "height": 335525,
    "index": 0
  },
  "end": {
    "height": 211738,
    "index": 1240
  }
}
```
