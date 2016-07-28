**Note**: Currently in active development

# bwdb

A database for high and low volume bitcoin wallets

## Database Design

Wallet data is stored in a [B+ tree](https://en.wikipedia.org/wiki/B%2B_tree) using the key/value pairs shown below. The design is optimized for wallet queries for balances, txids, transactions, addresses and utxos. Multiple wallets are supported, each with several million addresses and transactions.

### Structures

Database    | Key | Value
----------- | ------------ | -------------
Address | walletId, addressType, addressHash  | null
Address Map | addressType, addressHash | walletId[]
Block | height | blockHash, blockAddressFilter
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
