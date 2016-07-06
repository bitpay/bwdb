'use strict';

var EventEmitter = require('events').EventEmitter;
var chai = require('chai');
var should = chai.should();
var sinon = require('sinon');
var bitcore = require('bitcore-lib');
var BloomFilter = require('bloom-filter');

var utils = require('../lib/utils');
var Wallet = require('../lib/wallet-service');
var BlockFilter = require('../lib/block-filter');

describe.skip('Wallet Service', function() {
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
  });
  describe('#_getWorkerOptions', function() {
    it('', function() {
    });
  });
  describe('#_startWriterWorker', function() {
    it('', function() {
    });
  });
  describe('#_connectWriterWorker', function() {
    it('', function() {
    });
  });
  describe('#_connectWriterSocket', function() {
    it('', function() {
    });
  });
  describe('#_queueWriterSyncTask', function() {
    it('', function() {
    });
  });
  describe('#_startWebWorkers', function() {
    it('', function() {
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
      wallet._setupDatabase = sinon.stub().callsArg(0);
      sinon.stub(wallet, '_loadWalletData', function(callback) {
        wallet.walletData = walletData;
        callback();
      });
      wallet.start(function(err) {
        if (err) {
          return done(err);
        }
        // init wallet data
        wallet._setupDatabase.callCount.should.equal(1);
        wallet._loadWalletData.callCount.should.equal(1);

        // set the block handler
        wallet.blockFilter.should.be.instanceOf(BlockFilter);
        wallet.blockFilter.addressFilter.should.be.instanceOf(BloomFilter);
        wallet.blockFilter.network.should.equal(bitcore.Networks.testnet);

        // will call sync
        wallet.sync.callCount.should.equal(1);

        // will setup event for tip and call sync
        bitcoind.once('tip', function() {
          wallet.sync.callCount.should.equal(2);

          // will not call sync if node is stopping
          wallet.node.stopping = true;
          bitcoind.once('tip', function() {
            wallet.sync.callCount.should.equal(2);
            done();
          });
          bitcoind.emit('tip');

        });
        bitcoind.emit('tip');
      });
    });
    it('will give error from setup series', function(done) {
      var testNode = {
        services: {
          bitcoind: {}
        },
        network: 'testnet'
      };
      var wallet  = new Wallet({node: testNode});
      sandbox.stub(utils, 'setupDirectory').callsArgWith(1, new Error('test'));
      wallet.start(function(err) {
        err.should.be.instanceOf(Error);
        err.message.should.equal('test');
        done();
      });
    });
  });
  describe('#stop', function() {
    it('will call db close if defined', function(done) {
      var wallet = new Wallet({node: node});
      wallet.db = {
        env: {
          close: sinon.stub()
        },
        addresses: {
          close: sinon.stub()
        },
        wallet: {
          close: sinon.stub()
        },
        txids: {
          close: sinon.stub()
        },
        txs: {
          close: sinon.stub()
        }
      };
      wallet.stop(done);
    });
    it('will continue if db is undefined', function(done) {
      var wallet = new Wallet({node: node});
      wallet.stop(done);
    });
  });

});
