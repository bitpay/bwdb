**Note**: Currently in active development

# Bitcore Wallet Database

A database for high and low volume bitcoin wallets

## Database Design

Data is stored in a [B+ tree](https://en.wikipedia.org/wiki/B%2B_tree) using the key/value pairs shown below. Design is optimized for wallet queries for balances, txids, transactions, addresses and utxos. Multiple wallets are supported with several million addresses and transactions.

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
