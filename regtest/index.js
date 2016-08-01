'use strict';

var async = require('async');
var chai = require('chai');
var bitcore = require('bitcore-lib');
var BitcoinRPC = require('bitcoind-rpc');
var rimraf = require('rimraf');
var should = chai.should();

var index = require('..');
var Server = index.Server;
var Client = index.Client;
var Config = index.Config;

var testWIF = 'cSdkPxkAjA4HDr5VHgsebAPDEh9Gyub4HK8UJr2DFGGqKKy4K5sG';
var testKey = bitcore.PrivateKey(testWIF);
var testAddress = testKey.toAddress('regtest').toString();

var test2WIF = 'cR4qogdN9UxLZJXCNFNwDRRZNeLRWuds9TTSuLNweFVjiaE4gPaq';
var test2Key = bitcore.PrivateKey(test2WIF);
var test2Address = test2Key.toAddress('regtest').toString();

var test3WIF = 'cNDGTzXC45gTf9jh5JiRuNbiF4GovNHEhZe1rjDK6WhA7H1pem9c';
var test3Key = bitcore.PrivateKey(test3WIF);
var test3Address = test3Key.toAddress('regtest').toString();

var bitcoinClient;
var server;
var client;

describe('Wallet Server & Client', function() {

  var regtest;

  function getOverview(walletId, done) {
    var txids;
    var balance;
    var utxos;

    async.series([
      function(next) {
        client.getTxids(walletId, {}, function(err, result) {
          if (err) {
            return next(err);
          }
          txids = result.txids;
          next();
        });
      }, function(next) {
        client.getBalance(walletId, function(err, result) {
          if (err) {
            return next(err);
          }
          balance = result.balance;
          next();
        });
      }, function(next) {
        client.getUTXOs(walletId, {}, function(err, result) {
          if (err) {
            return next(err);
          }
          utxos = result.utxos;
          next();
        });
      }
    ], function(err) {
      if (err) {
        return done(err);
      }
      done(null, {
        txids: txids,
        balance: balance,
        utxos: utxos
      });
    });
  }

  function replaceAndGenerate(tx, address, amount, done) {
    var data = {};
    tx.outputs = [];
    tx.to(address, amount * 1e8);
    bitcoinClient.signRawTransaction(tx.uncheckedSerialize(), function(err, response) {
      if (err) {
        return done(err);
      }
      data.hex = response.result.hex;
      bitcoinClient.sendRawTransaction(response.result.hex, true, function(err, response) {
        if (err) {
          return done(err);
        }
        data.txid = response.result;
        bitcoinClient.generate(2, function(err, response) {
          if (err) {
            return done(err);
          }
          data.blockHash = response.result[0];
          setTimeout(function() {
            done(null, data);
          }, 2000);
        });
      });
    });
  }

  function sendReplaceableAndGenerate(address, amount, done) {
    var data = {};
    bitcoinClient.listUnspent(function(err, response) {
      if (err) {
        return done(err);
      }
      var utxos = response.result;
      var tx = bitcore.Transaction();
      var totalInput = 0;
      var c = 0;
      while (totalInput < amount) {
        tx.from(utxos[c]);
        totalInput += utxos[c].amount;
        c++;
      }
      tx.change(utxos[0].address);
      tx.enableRBF();
      tx.to(address, amount * 1e8);

      bitcoinClient.signRawTransaction(tx.serialize({disableIsFullySigned: true}), function(err, response) {
        if (err) {
          return done(err);
        }

        data.hex = response.result.hex;

        bitcoinClient.sendRawTransaction(data.hex, function(err, response) {
          if (err) {
            return done(err);
          }
          data.txid = response.result;

          bitcoinClient.generate(1, function(err, response) {
            if (err) {
              return done(err);
            }

            data.blockHash = response.result[0];

            setTimeout(function() {
              done(null, data);
            }, 1000);
          });
        });
      });
    });
  }

  function sendAndGenerate(address, amount, done) {
    var data = {};
    bitcoinClient.sendToAddress(testAddress, amount, function(err, response) {
      if (err) {
        return done(err);
      }
      data.txid = response.result;
      bitcoinClient.generate(1, function(err, response) {
        if (err) {
          return done(err);
        }
        data.blockHash = response.result[0];
        setTimeout(function() {
          done(null, data);
        }, 1000);
      });
    });
  }

  function broadcastAndGenerate(tx, done) {
    var data = {};
    bitcoinClient.sendRawTransaction(tx.serialize(), function(err, response) {
      if (err) {
        return done(err);
      }
      data.txid = response.result;
      bitcoinClient.generate(1, function(err, response) {
        if (err) {
          return done(err);
        }
        data.blockHash = response.result;
        setTimeout(function() {
          done(null, data);
        }, 500);
      });
    });
  }

  before(function(done) {
    this.timeout(60000);

    var configPath = __dirname + '/data';

    async.series([
      function(next) {
        rimraf(configPath + '/bitcoin/regtest', next);
      },
      function(next) {
        rimraf(configPath + '/regtest.lmdb', next);
      }
    ], function(err) {
      if (err) {
        return done(err);
      }

      server = new Server({network: 'regtest', configPath: configPath});

      var config = new Config({network: 'regtest', path: configPath});
      var url = config.getURLSync();
      client = new Client({network: 'regtest', url: url});

      regtest = bitcore.Networks.get('regtest');
      should.exist(regtest);

      server.on('error', function(err) {
        console.error(err);
      });

      server.start(function(err) {
        if (err) {
          return done(err);
        }

        bitcoinClient = new BitcoinRPC({
          protocol: 'http',
          host: '127.0.0.1',
          port: 30331,
          user: 'bitcoin',
          pass: 'local321',
          rejectUnauthorized: false
        });

        var syncedHandler = function(height) {
          // check that the block chain is generated
          if (height >= 150) {
            server.node.services.bitcoind.removeListener('synced', syncedHandler);

            // check that client can connect
            async.retry({times: 5, interval: 2000}, function(next) {
              client.getInfo(next);
            }, done);
          }
        };

        server.node.services.bitcoind.on('synced', syncedHandler);
        bitcoinClient.generate(150, function(err) {
          if (err) {
            throw err;
          }
        });
      });
    });
  });

  after(function(done) {
    this.timeout(20000);
    server.stop(function(err) {
      if (err) {
        throw err;
      }
      done();
    });
  });

  var walletId = 'f4c4dd2e316dd51f962dba79816f4f36e1b371f81e9c33be456ed091c4107d3a';
  it('will create a wallet', function(done) {
    client.createWallet(walletId, function(err, result) {
      if (err) {
        return done(err);
      }
      done();
    });
  });
  it('will import an address', function(done) {
    client.importAddress(walletId, testAddress, function(err, result) {
      if (err) {
        return done(err);
      }
      should.exist(result);
      done();
    });
  });
  describe('wallet block updates', function() {
    var expected;
    before(function(done) {
      this.timeout(10000);
      sendAndGenerate(testAddress, 10, function(err, response) {
        if (err) {
          return done(err);
        }
        expected = response;
        // TODO wait until height is updated
        setTimeout(done, 1000);
      });
    });
    it('will update the balance for the wallet', function(done) {
      client.getBalance(walletId, function(err, result) {
        if (err) {
          return done(err);
        }
        result.balance.should.equal(10 * 1e8);
        done();
      });
    });
    it('will get the latest txids', function(done) {
      client.getTxids(walletId, {}, function(err, result) {
        if (err) {
          return done(err);
        }
        result.txids.length.should.equal(1);
        result.txids[0].should.equal(expected.txid);
        done();
      });
    });
    it('will get the latest transactions', function(done) {
      client.getTransactions(walletId, {}, function(err, result) {
        if (err) {
          return done(err);
        }
        result.transactions.length.should.equal(1);
        result.transactions[0].hash.should.equal(expected.txid);
        done();
      });
    });
    it('will get utxos', function(done) {
      client.getUTXOs(walletId, {}, function(err, result) {
        if (err) {
          return done(err);
        }
        result.utxos.length.should.equal(1);
        result.utxos[0].address.should.equal(testAddress);
        result.utxos[0].satoshis.should.equal(10 * 1e8);
        result.utxos[0].txid.length.should.equal(64);
        result.utxos[0].index.should.be.a('number');
        result.utxos[0].height.should.be.a('number');
        done();
      });
    });
    it('will remove utxo after being spent', function(done) {
      client.getUTXOs(walletId, {}, function(err, result1) {
        if (err) {
          return done(err);
        }
        var tx = bitcore.Transaction();
        var utxo = {
          outputIndex: result1.utxos[0].index,
          satoshis: result1.utxos[0].satoshis,
          txid: result1.utxos[0].txid,
          address: result1.utxos[0].address,
          script: bitcore.Script.fromAddress(result1.utxos[0].address)
        };
        tx.from(utxo);
        tx.to(test2Address, (10 * 1e8) - 1000);
        tx.fee(1000);
        tx.sign(testKey);
        tx.outputs.length.should.equal(1);

        broadcastAndGenerate(tx, function(err, data) {
          if (err) {
            return done(err);
          }
          client.getUTXOs(walletId, {}, function(err, result2) {
            if (err) {
              return done(err);
            }
            result2.utxos.length.should.equal(0);
            done();
          });
        });
      });
    });
  });
  describe('reorg the chain', function() {
    this.timeout(10000);
    var starting;
    var replacedTxid;
    before(function(done) {
      var replaceableTx;
      var invalidBlockHash;
      async.series([
        function(next) {
          getOverview(walletId, function(err, overview) {
            if (err) {
              return next(err);
            }
            starting = overview;
            next();
          });
        },
        function(next) {
          sendReplaceableAndGenerate(testAddress, 10, function(err, result) {
            if (err) {
              return next(err);
            }
            replaceableTx = bitcore.Transaction(result.hex);
            invalidBlockHash = result.blockHash;
            next();
          });
        },
        function(next) {
          getOverview(walletId, function(err, overview) {
            if (err) {
              return next(err);
            }
            overview.txids.length.should.equal(2);
            overview.balance.should.equal(1000000000);
            overview.utxos.length.should.equal(1);
            next();
          });
        },
        function(next) {
          bitcoinClient.invalidateBlock(invalidBlockHash, function() {
            setTimeout(next, 1000);
          });
        },
        function(next) {
          replaceAndGenerate(replaceableTx, test3Address, 9, next);
        }
      ], done);
    });
    it('will have the correct txids', function(done) {
      client.getTxids(walletId, {}, function(err, result) {
        if (err) {
          return done(err);
        }
        result.txids.should.deep.equal(starting.txids);
        done();
      });
    });
    it('will have the correct balance', function(done) {
      client.getBalance(walletId, function(err, result) {
        if (err) {
          return done(err);
        }
        result.balance.should.equal(starting.balance);
        done();
      });
    });
    it('will have the correct utxos', function(done) {
      client.getUTXOs(walletId, {}, function(err, result) {
        if (err) {
          return done(err);
        }
        result.utxos.should.deep.equal(starting.utxos);
        done();
      });
    });
  });
});
