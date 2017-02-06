'use strict';

var AssertionError = require('assert').AssertionError;
var async = require('async');
var chai = require('chai');
var bitcore = require('bitcore-lib');
var BitcoinRPC = require('bitcoind-rpc');
var rimraf = require('rimraf');
var should = chai.should();
var expect = chai.expect;
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

  before(function(done) {
    console.log('This test suite is designed to run as a unit!' +
      ' Individual tests will not run successfully in isolation.');
    this.timeout(60000);

    configPath = __dirname + '/data';
    //configPath = '/home/bwdb/.bwdb';
    config = new ClientConfig({path: configPath, network: 'regtest'});

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
          if (height >= startingNumOfBlocks) {
            server.node.services.bitcoind.removeListener('synced', syncedHandler);
            var imported;
            async.retry({times: 5, interval: 2000}, function(next) {
              client.getInfo(function(err, response) {
                if(err) {
                  return next('try again');
                }
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

  it('should get a tx history report with one output, receive type', function(done) {
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
        txlist = JSON.parse(txlist);
        should.not.exist(error);
        txlist.address.should.equal(walletDatAddresses[0]);
        txlist.category.should.equal('receive');
        txlist.satoshis.should.equal(50 * 1E8 - 6000);
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
        txlist = JSON.parse('[' + txlist.replace(/\n/g, ',').slice(0, -1) + ']');
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
        txlist = JSON.parse('[' + txlist.replace(/\n/g, ',').slice(0, -1) + ']');
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
        txlist = JSON.parse('[' + txlist.replace(/\n/g, ',').slice(0, -1) + ']');
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
    var options = {
      startdate: start,
      enddate: end
    };
    client.getHeightsFromTimestamps(options, function(err, response, body) {
      if (err) {
        done(err);
      }
      body.result[0].should.equal(1);
      body.result[1].should.equal(109);
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
      body.result[1].should.equal(109);
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

  it('should not include any extraneous newlines; the stream should be proper jsonl format', function(done) {
    this.timeout(20000);
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
      //this is a list of records separated by newlinee, so there ought to be N + 1
      //items in the array where N is the nummber of json objects
      var list = txlist.split('\n');
      list.length.should.equal(7);
      expect(error).to.be.an('undefined');
      done();
    });
  });

  it('should pass with differing limits, e.g. limit=1', function(done) {
    this.timeout(20000);
    var txlist = '';
    var error;
    var oldOptionsLimit = options.limit;
    options.limit = 1;
    var stream = client.getTransactionsListStream(walletInfo.id, options);
    stream.on('data', function(data) {
      txlist += data;
    });
    stream.on('error', function(data) {
      error = data;
    });
    stream.on('end', function() {
      var list = txlist.split('\n');
      list.length.should.equal(7);
      expect(error).to.be.an('undefined');
      options.limit = oldOptionsLimit;
      done();
    });
  });

  it('should fail if an invalid limit is used', function(done) {
    this.timeout(10000);
    var oldOptionsLimit = options.limit;
    options.limit = 0;
    var fired = false;
    try {
      client.getTransactionsListStream(walletInfo.id, options);
    } catch(e) {
      expect(e).to.be.instanceof(AssertionError);
      fired = true;
    }
    options.limit = oldOptionsLimit;
    expect(fired).to.be.true;
    done();
  });

  it('should fail if an invalid end is used', function(done) {
    this.timeout(10000);
    var oldOptionsEnd = options.end;
    options.end = -1;
    var fired = false;
    try {
      client.getTransactionsListStream(walletInfo.id, options);
    } catch(e) {
      expect(e).to.be.instanceof(AssertionError);
      options.end = oldOptionsEnd;
      fired = true;
    }
    expect(fired).to.be.true;
    done();
  });

  it('should fail if an invalid height is used', function(done) {
    this.timeout(10000);
    var oldOptionsHeight = options.height;
    options.height = -1;
    var fired = false;
    try {
      client.getTransactionsListStream(walletInfo.id, options);
    } catch(e) {
      expect(e).to.be.instanceof(AssertionError);
      options.end = oldOptionsHeight;
      fired = true;
    }
    expect(fired).to.be.true;
    done();
  });

  it('should fail if an invalid index is used', function(done) {
    this.timeout(10000);
    var oldOptionsIndex = options.index;
    options.index = -1;
    var fired = false;
    try {
      client.getTransactionsListStream(walletInfo.id, options);
    } catch(e) {
      expect(e).to.be.instanceof(AssertionError);
      options.end = oldOptionsIndex;
      fired = true;
    }
    expect(fired).to.be.true;
    done();
  });

  it('should not return results outside the range given.', function(done) {
    this.timeout(10000);
    var options = {
      height: 107,
      index: 0,
      limit: 10,
      end: 107
    };
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
      var list = txlist.split('\n');
      list.length.should.equal(4);
      expect(error).to.be.an('undefined');
      done();
    });
  });

});
