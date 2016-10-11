'use strict';

var assert = require('assert');
var async = require('async');
var chai = require('chai');
var bitcore = require('bitcore-lib');
var BitcoinRPC = require('bitcoind-rpc');
var rimraf = require('rimraf');
var should = chai.should();
var index = require('..');
var testUtils = require('./utils');
var Server = index.Server;
var ClientConfig = index.ClientConfig;

var testWIF = 'cSdkPxkAjA4HDr5VHgsebAPDEh9Gyub4HK8UJr2DFGGqKKy4K5sG';
var testKey = bitcore.PrivateKey(testWIF);
var testAddress = testKey.toAddress('regtest').toString();

var bitcoinClient;
var server;
var client;
var config;
var configPath;
var startingNumOfBlocks = 105;
var walletDatAddresses;
var walletInfo;
var options = {
  height: 0,
  index: 0,
  limit: 10,
  end: startingNumOfBlocks + 20
};

describe('Get Transactions List', function() {
  var regtest;

  before(function(done) {
    console.log('This test suite is designed to run as a unit!' +
      ' Individual tests will not run successfully in isolation.');
    this.timeout(60000);

    configPath = __dirname + '/data';
    config = new ClientConfig({path: configPath});

    async.series([
      function(next) {
        rimraf(configPath + '/bitcoin/regtest', next);
      },
      function(next) {
        rimraf(configPath + '/regtest.lmdb', next);
      },
      function(next) {
        config.setup(function(err) {
          if (err) {
            next(err);
          }
          config.unlockClient(function(err, _client) {
            if (err) {
              next(err);
            }
            client = _client;
            next();
          });
        });
      }
    ], function(err) {
      if (err) {
        return done(err);
      }

      server = new Server({network: 'regtest', configPath: configPath});

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

        bitcoinClient.generate(startingNumOfBlocks, function(err) {
          if (err) {
            throw err;
          }
        });

        var syncedHandler = function(height) {
          if (height >= startingNumOfBlocks) {
            server.node.services.bitcoind.removeListener('synced', syncedHandler);
            var imported;
            async.retry({times: 5, interval: 2000}, function(next) {
              client.getInfo(function(err, response) {
                if (parseInt(response.headers['x-bitcoin-height']) >= startingNumOfBlocks) {
                  return next(null, response);
                }
                //do this only once!
                if (!imported) {
                  imported = true;
                  testUtils.importWalletDat({
                    client: client,
                    config: config,
                    path: configPath + '/bitcoin/regtest/wallet.dat'
                  }, function(err, response) {
                    if (err) {
                      throw err;
                    }
                    walletDatAddresses = response.addresses;
                    walletInfo = {
                      name: response.walletName,
                      id: response.walletId
                    };
                    next('try again');
                  });
                } else {
                  next('try again');
                }
              });
            }, done);
          }
        };

        server.node.services.bitcoind.on('synced', syncedHandler);
        bitcoinClient.generate(startingNumOfBlocks, function(err) {
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

  it('should not get a tx history report because none of the wallet addresses should have txs', function(done) {
    this.timeout(3000);
    var txlist = '';
    var error;
    var stream = client.getTransactionsListStream(walletInfo.id, options);
    stream.on('data', function(data) {
      txlist += data;
    });
    stream.on('error', function(data) {
      error = data;
    });
    stream.on('end', function() {
      txlist = JSON.parse(txlist);
      should.not.exist(error);
      txlist.message = 'no results found';
      done();
    });
  });

  it('should get a tx history report with one output and one fee', function(done) {
    this.timeout(20000);
    testUtils.spendCoinbaseTo({
      address: walletDatAddresses[0],
      bitcoinClient: bitcoinClient
    }, function(err, utxo) {
      if(err) {
        return done(err);
      }
      walletInfo.utxo = utxo;
      var txlist = '';
      var error;
      var stream = client.getTransactionsListStream(walletInfo.id, options);
      stream.on('data', function(data) {
        txlist += data;
      });
      stream.on('error', function(data) {
        error = data;
      });
      stream.on('end', function() {
        txlist = JSON.parse('[' + txlist.replace(/\n/g, ',') + ']');
        should.not.exist(error);
        txlist.length.should.equal(1);
        txlist[0].address.should.equal(walletDatAddresses[0]);
        txlist[0].category.should.equal('receive');
        txlist[0].satoshis.should.equal(50 * 1E8 - 6000);
        done();
      });
    });
  });
  it('should get a move type tx history report', function(done) {
    this.timeout(6000);
    testUtils.sendFromUtxo({
      bitcoinClient: bitcoinClient,
      address: walletDatAddresses[0],
      utxo: walletInfo.utxo
    }, function(err, utxo) {
      if(err) {
        return done(err);
      }
      walletInfo.utxo = utxo;
      var txlist = '';
      var error;
      var stream = client.getTransactionsListStream(walletInfo.id, options);
      stream.on('data', function(data) {
        txlist += data;
      });
      stream.on('error', function(data) {
        error = data;
      });
      stream.on('end', function() {
        txlist = JSON.parse('[' + txlist.replace(/\n/g, ',') + ']');
        should.not.exist(error);
        txlist.length.should.equal(4);
        //receive, then receive, then send, then fee
        txlist[0].category.should.equal('receive');
        txlist[0].satoshis.should.equal(50 * 1E8 - 6000);
        txlist[0].address.should.equal(walletDatAddresses[0]);
        txlist[1].category.should.equal('receive');
        txlist[1].satoshis.should.equal(50 * 1E8 - 6000);
        txlist[2].category.should.equal('send');
        txlist[2].satoshis.should.equal((50 * 1E8 - 6000) * -1);
        txlist[3].satoshis.should.equal(-7000);
        txlist[3].category.should.equal('fee');
        done();
      });
    });
  });
  it('should get a join receive type tx history report', function(done) {
    this.timeout(20000);
    testUtils.sendJoinTypeTx({
      bitcoinClient: bitcoinClient,
      address: walletDatAddresses[1],
      utxo: walletInfo.utxo,
      privKey: testKey
    }, function(err, utxo) {
      if(err) {
        return done(err);
      }
      walletInfo.utxo = utxo;
      var txlist = '';
      var error;
      var stream = client.getTransactionsListStream(walletInfo.id, options);
      stream.on('data', function(data) {
        txlist += data;
      });
      stream.on('error', function(data) {
        error = data;
      });
      stream.on('end', function() {
        txlist = JSON.parse('[' + txlist.replace(/\n/g, ',') + ']');
        should.not.exist(error);
        txlist.length.should.equal(5);
        txlist[4].category.should.equal('shared-receive');
        txlist[4].satoshis.should.equal(4999986000);
        done();
      });
    });
  });
  it('should get a join send type tx history report', function(done) {
    this.timeout(20000);
    testUtils.sendJoinTypeTx({
      bitcoinClient: bitcoinClient,
      address: testAddress,
      utxo: walletInfo.utxo,
      privKey: testKey,
      amount: 25 * 1E8
    }, function(err, utxo) {
      if(err) {
        return done(err);
      }
      walletInfo.utxo = utxo;
      var txlist = '';
      var error;
      var stream = client.getTransactionsListStream(walletInfo.id, options);
      stream.on('data', function(data) {
        txlist += data;
      });
      stream.on('error', function(data) {
        error = data;
      });
      stream.on('end', function() {
        txlist = JSON.parse('[' + txlist.replace(/\n/g, ',') + ']');
        should.not.exist(error);
        txlist.length.should.equal(6);
        txlist[5].category.should.equal('shared-send');
        txlist[5].satoshis.should.equal(-9999973000);
        done();
      });
    });
  });
  it('should properly translate block timestamps to block heights', function(done) {
    this.timeout(20000);
    var start = Math.floor(new Date().getTime() + 86400000 * 30);
    var end = Math.floor(new Date().getTime() - 86400000 * 30);
    console.log(end);
    var options = {
      startdate: start,
      enddate: end
    };
    client.getHeightsFromTimestamps(options, function(err, response, body) {
      if (err) {
        done(err);
      }
      body.result[0].should.equal(1);
      assert(body.result[1] >= 114);
      done();
    });
  });
  it('should properly translate block timestamps to block heights by providing dates in any order', function(done) {
    this.timeout(20000);
    var end = Math.floor(new Date().getTime() + 86400000 * 30);
    var start = Math.floor(new Date().getTime() - 86400000 * 30);
    var options = {
      startdate: start,
      enddate: end
    };
    client.getHeightsFromTimestamps(options, function(err, response, body) {
      if (err) {
        done(err);
      }
      body.result[0].should.equal(1);
      assert(body.result[1] >= 114);
      done();
    });
  });
  it('should return an error if a date provided does not make sense as a date', function(done) {
    this.timeout(20000);
    var options = {
      startdate: 'alpaca socks',
      enddate: '2016-11-01'
    };
    client.getHeightsFromTimestamps(options, function(err) {
      err.message.should.equal('400 Bad Request: improper date format');
      done();
    });
  });
  it('should not return block heights created today if the end date is today', function(done) {
    this.timeout(20000);
    var start = Math.floor(new Date().getTime() - 86400000 * 30);
    var end = new Date().getTime();
    var options = {
      startdate: start,
      enddate: end
    };
    client.getHeightsFromTimestamps(options, function(err) {
      err.message.should.be.equal('404 Not Found');
      done();
    });
  });
});
