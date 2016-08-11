'use strict';

var EventEmitter = require('events').EventEmitter;
var chai = require('chai');
var should = chai.should();
var sinon = require('sinon');
var proxyquire = require('proxyquire');
var bitcore = require('bitcore-lib');
var BloomFilter = require('bloom-filter');

var utils = require('../lib/utils');
var Wallet = require('../lib/wallet-service');

describe('Wallet Service', function() {
  var node = {
    services: {
      bitcoind: {}
    },
    network: 'testnet'
  };
  describe('@constructor', function() {
    it('will set node', function() {
      var wallet = new Wallet({node: node});
      wallet.node.should.equal(node);
    });
    it('will set node with route prefix', function() {
      var options = {
        node: node,
        routePrefix: 'walletservice'
      };
      var wallet = new Wallet(options);
      wallet.node.should.equal(node);
      wallet.routePrefix.should.equal(options.routePrefix);
    });
  });
  describe('#_getWorkerOptions', function() {
    it('will get options for writer worker with spawn', function() {
      var node = {
        network: 'testnet',
        services: {
          bitcoind: {
            height: 100,
            tiphash: '00000000000000000495aa8f7662444b0e26cbcbe1a2311b10d604eaa7df319e',
            spawn: {
              config: {
                rpcport: 18333,
                rpcuser: 'testuser',
                rpcpassword: 'testpassword'
              }
            }
          }
        }
      };
      var options = {
        configPath: process.env.HOME,
        node: node
      };

      var wallet = new Wallet(options);
      var ops = wallet._getWorkerOptions();
      ops.configPath.should.equal(process.env.HOME);
      ops.network.should.equal('testnet');
      ops.bitcoinHeight.should.equal(100);
      ops.bitcoinHash.should.equal('00000000000000000495aa8f7662444b0e26cbcbe1a2311b10d604eaa7df319e');
      ops.clientsConfig[0].rpcport.should.equal(18333);
      ops.clientsConfig[0].rpcuser.should.equal('testuser');
      ops.clientsConfig[0].rpcpassword.should.equal('testpassword');
    });
    it('will get options for writer worker with connect', function() {
      var node = {
        network: 'testnet',
        services: {
          bitcoind: {
            height: 100,
            tiphash: '00000000000000000495aa8f7662444b0e26cbcbe1a2311b10d604eaa7df319e',
            options: {
              connect: [{
                rpcport: 18333,
                rpcuser: 'testuser',
              rpcpassword: 'testpassword'
              }]
            }
          }
        }
      };
      var options = {
        configPath: process.env.HOME,
        node: node
      };

      var wallet = new Wallet(options);
      var ops = wallet._getWorkerOptions();
      ops.configPath.should.equal(process.env.HOME);
      ops.network.should.equal('testnet');
      ops.bitcoinHeight.should.equal(100);
      ops.bitcoinHash.should.equal('00000000000000000495aa8f7662444b0e26cbcbe1a2311b10d604eaa7df319e');
      ops.clientsConfig[0].rpcport.should.equal(18333);
      ops.clientsConfig[0].rpcuser.should.equal('testuser');
      ops.clientsConfig[0].rpcpassword.should.equal('testpassword');
    });
  });
  describe('#_startWriterWorker', function() {
    it('will start the writer worker thread', function() {
      var node = {
        network: 'testnet',
        services: {
          bitcoind: {
            height: 100,
            tiphash: '00000000000000000495aa8f7662444b0e26cbcbe1a2311b10d604eaa7df319e',
            options: {
              connect: [{
                rpcport: 18333,
                rpcuser: 'testuser',
              rpcpassword: 'testpassword'
              }]
            }
          }
        }
      };
      var options = {
        configPath: process.env.HOME,
        node: node
      };

      var fn = sinon.stub();
      var temp = function(msg, t){t('ready');};
      var spawnStub = sinon.stub().returns({once:temp});
      var Wallet = proxyquire('../lib/wallet-service', {
        child_process: {
          spawn : spawnStub
        }
      });
      var wallet = new Wallet(options);
      wallet._startWriterWorker(fn);
      fn.callCount.should.equal(1);
    });
  });
  describe('#_connectWriterSocket', function() {
    it('will connect to writer socket', function() {
      var node = {
        network: 'testnet',
        services: {
          bitcoind: {
            height: 100,
            tiphash: '00000000000000000495aa8f7662444b0e26cbcbe1a2311b10d604eaa7df319e',
            options: {
              connect: [{
                rpcport: 18333,
                rpcuser: 'testuser',
              rpcpassword: 'testpassword'
              }]
            }
          }
        }
      };
      var options = {
        configPath: process.env.HOME,
        node: node
      };
      var fn = sinon.stub();
      var tempEmitter = new EventEmitter();
      var tempFunc;
      var connect = function(path, func) {
        tempFunc = func;
        return tempEmitter;
      };

      var WalletStub = proxyquire('../lib/wallet-service', {
        net: {
          connect: connect
        }
      });
      var wallet = new WalletStub(options);
      wallet._connectWriterSocket(fn);
      tempFunc();
      tempEmitter.emit('data', '"json data"');
      fn.callCount.should.equal(1);
    });
  });
  describe('#_queueWriterSyncTask', function() {
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });
    it('will queue the writer task synchronously', function() {
      var node = {
        network: 'testnet',
        services: {
          bitcoind: {
            height: 100,
            tiphash: '00000000000000000495aa8f7662444b0e26cbcbe1a2311b10d604eaa7df319e',
            options: {
              connect: [{
                rpcport: 18333,
                rpcuser: 'testuser',
              rpcpassword: 'testpassword'
              }]
            }
          }
        }
      };
      var options = {
        configPath: process.env.HOME,
        node: node
      };
      var write = sinon.stub();
      var wallet = new Wallet(options);
      wallet._writerSocket  = {write:write};
      wallet._queueWriterSyncTask();
      write.callCount.should.equal(1);
    });
  });
  describe('#_startWebWorkers', function() {
    it('will start web workers', function() {
      var node = {
        network: 'testnet',
        services: {
          bitcoind: {
            height: 100,
            tiphash: '00000000000000000495aa8f7662444b0e26cbcbe1a2311b10d604eaa7df319e',
            options: {
              connect: [{
                rpcport: 18333,
                rpcuser: 'testuser',
              rpcpassword: 'testpassword'
              }]
            }
          }
        }
      };
      var options = {
        configPath: process.env.HOME,
        node: node,
        data: {
          wallet: {
            port: 17333
          }
        }
      };
      var spawnStub = sinon.stub();
      var fn = sinon.stub();
      var Wallet = proxyquire('../lib/wallet-service', {
        child_process: {
          spawn : spawnStub
        }
      });
      var wallet = new Wallet(options);
      wallet._startWebWorkers(fn);
      fn.callCount.should.equal(1);
      spawnStub.callCount.should.equal(1);
    });
  });
  describe('#start', function() {
    var sandbox;
    beforeEach(function() {
      sandbox = sinon.sandbox.create();
    });
    afterEach(function() {
      sandbox.restore();
    });
    it('will setup database, load wallet, block handler and register sync events', function(done) {
      var bitcoind = new EventEmitter();
      var testNode = {
        network: bitcore.Networks.testnet,
        log: {
          info: sinon.stub()
        },
        services: {
          bitcoind: bitcoind
        }
      };
      var wallet  = new Wallet({node: testNode});
      wallet.sync = sinon.stub();
      var walletData = {
        addressFilter: BloomFilter.create(1000, 0.1)
      };
      sinon.stub(wallet, '_getWorkerOptions');
      sinon.stub(wallet, '_startWriterWorker').callsArg(0);
      sinon.stub(wallet, '_connectWriterSocket').callsArg(0);
      sinon.stub(wallet, '_queueWriterSyncTask');
      //      sinon.stub(wallet, '_startWebWorkers').callsArgWith(0, new Error('error'));
      sinon.stub(wallet, '_startWebWorkers').callsArgWith(0);
      wallet.config = {setupConfig: sinon.stub().callsArg(0)};

      wallet.start(function(err) {
        if (err) {
          done(err);
        }

        // will setup event for tip and call sync
        bitcoind.once('tip', function() {

          // will not call sync if node is stopping
          wallet.node.stopping = true;
          bitcoind.emit('tip');
        });
        bitcoind.emit('tip');
        done();
      });
    });
    it('wallet service start returns error', function(done) {
      var bitcoind = new EventEmitter();
      var testNode = {
        network: bitcore.Networks.testnet,
        log: {
          info: sinon.stub()
        },
        services: {
          bitcoind: bitcoind
        }
      };
      var wallet  = new Wallet({node: testNode});
      wallet.sync = sinon.stub();
      var walletData = {
        addressFilter: BloomFilter.create(1000, 0.1)
      };
      sinon.stub(wallet, '_getWorkerOptions');
      sinon.stub(wallet, '_startWriterWorker').callsArg(0);
      sinon.stub(wallet, '_connectWriterSocket').callsArg(0);
      sinon.stub(wallet, '_queueWriterSyncTask');
      sinon.stub(wallet, '_startWebWorkers').callsArgWith(0, new Error('error'));
      wallet.config = {setupConfig: sinon.stub().callsArg(0)};

      wallet.start(function(err) {
        if (err) {
          done();
        }

        // will setup event for tip and call sync
        bitcoind.once('tip', function() {

          // will not call sync if node is stopping
          wallet.node.stopping = true;
          bitcoind.emit('tip');
        });
        bitcoind.emit('tip');
      });
    });
  });
  describe('#stop', function() {
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });

    var exitWorker = sinon.stub().callsArg(2);
    var node = {
      network: 'testnet',
      services: {
        bitcoind: {
          height: 100,
          tiphash: '00000000000000000495aa8f7662444b0e26cbcbe1a2311b10d604eaa7df319e',
          options: {
            connect: [{
              rpcport: 18333,
              rpcuser: 'testuser',
              rpcpassword: 'testpassword'
            }]
          }
        }
      }
    };
    var options = {
      configPath: process.env.HOME,
      node: node
    };
    it('will exit all workers', function(done) {
      sandbox.stub(utils, 'exitWorker', exitWorker);
      var fn = sinon.stub();
      var wallet = new Wallet(options);
      wallet.stop(fn);
      done();
    });
    it('will exit all workers with error', function(done) {
      var exitWorker = sinon.stub().callsArgWith(2, new Error('error'));
      sandbox.stub(utils, 'exitWorker', exitWorker);
      var fn = sinon.stub();
      var wallet = new Wallet(options);
      wallet.stop(function(err) {
        done();
      });
    });
  });
});
