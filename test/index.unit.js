'use strict';

var proxyquire = require('proxyquire');
var EventEmitter = require('events').EventEmitter;
var chai = require('chai');
var should = chai.should();
var sinon = require('sinon');
var bitcore = require('bitcore-lib');
var BloomFilter = require('bloom-filter');

var Wallet = require('../lib/index');
var BlockHandler = require('../lib/block-handler');
var models = require('../lib/models');
var blockData = require('./data/blocks.json');

describe('Wallet', function() {
  var node = {};
  describe('@constructor', function() {
    it('will set node', function() {
      var wallet = new Wallet({node: node});
      wallet.node.should.equal(node);
    });
  });
  describe('starting service', function() {
    describe('#_getApplicationDir', function() {
      it('will resolve application path based on home directory', function() {
        var wallet = new Wallet({node: node});
        var appPath = wallet._getApplicationDir();
        appPath.should.equal(process.env.HOME + '/.bwsv2');
      });
    });
    describe('#_setupApplicationDirectory', function() {
      it('will make directory if the application directory does not exist', function(done) {
        var mkdirp = sinon.stub().callsArg(1);
        var enoentError = new Error();
        enoentError.code = 'ENOENT';
        var access = sinon.stub().callsArgWith(1, enoentError);
        var TestWallet = proxyquire('../lib/index', {
          'fs': {
            access: access
          },
          'mkdirp': mkdirp
        });
        var wallet = new TestWallet({node: node});
        wallet._setupApplicationDirectory(function(err) {
          if (err) {
            return done(err);
          }
          mkdirp.callCount.should.equal(1);
          access.callCount.should.equal(1);
          done();
        });
      });
      it('will give unhandled error while trying to access application directory', function(done) {
        var mkdirp = sinon.stub().callsArg(1);
        var access = sinon.stub().callsArgWith(1, new Error('test'));
        var TestWallet = proxyquire('../lib/index', {
          'fs': {
            access: access
          },
          'mkdirp': mkdirp
        });
        var wallet = new TestWallet({node: node});
        wallet._setupApplicationDirectory(function(err) {
          err.should.be.instanceOf(Error);
          err.message.should.equal('test');
          mkdirp.callCount.should.equal(0);
          done();
        });
      });
      it('will continue if application directory already exists', function(done) {
        var mkdirp = sinon.stub().callsArg(1);
        var access = sinon.stub().callsArg(1);
        var TestWallet = proxyquire('../lib/index', {
          'fs': {
            access: access
          },
          'mkdirp': mkdirp
        });
        var wallet = new TestWallet({node: node});
        wallet._setupApplicationDirectory(function(err) {
          if (err) {
            return done(err);
          }
          mkdirp.callCount.should.equal(0);
          access.callCount.should.equal(1);
          done();
        });
      });
    });
    describe('#_getDatabasePath', function() {
      afterEach(function() {
        bitcore.Networks.disableRegtest();
      });
      it('will give database path for livenet', function() {
        var testNode = {
          network: bitcore.Networks.livenet
        };
        var wallet = new Wallet({node: testNode});
        var dbPath = wallet._getDatabasePath();
        dbPath.should.equal(process.env.HOME + '/.bwsv2/wallet-livenet.db');
      });
      it('will give database path for regtest', function() {
        var testNode = {
          network: bitcore.Networks.testnet
        };
        bitcore.Networks.enableRegtest();
        var wallet = new Wallet({node: testNode});
        var dbPath = wallet._getDatabasePath();
        dbPath.should.equal(process.env.HOME + '/.bwsv2/wallet-regtest.db');
      });
      it('will give database path for testnet', function() {
        var testNode = {
          network: bitcore.Networks.testnet
        };
        var wallet = new Wallet({node: testNode});
        var dbPath = wallet._getDatabasePath();
        dbPath.should.equal(process.env.HOME + '/.bwsv2/wallet-testnet3.db');
      });
      it('will give error with unknown network', function() {
        var testNode = {
          network: 'unknown'
        };
        var wallet = new Wallet({node: testNode});
        (function() {
          wallet._getDatabasePath();
        }).should.throw(TypeError);
      });
    });
    describe('#_setupDatabase', function() {
      it('will open database from path', function() {
        var testNode = {};
        var db = {
          open: sinon.stub()
        };
        var leveldown = sinon.stub().returns(db);
        var TestWallet = proxyquire('../lib/index', {
          'leveldown': leveldown
        });
        var wallet = new Wallet({node: testNode});
        wallet._getDatabasePath = sinon.stub().returns('/tmp/dbpath');
        wallet._setupDatabase(function(err) {
          if (err) {
            return done(err);
          }
          leveldown.callCount.should.equal(1);
          leveldown.args[0][0].should.equal('/tmp/dbpath');
          db.open.callCount.should.eqaul(1);
          db.open.args[0][0].should.deep.equal({createIfMissing: true});
        });
      });
    });
    describe('#_loadWalletData', function() {
      it('will create new wallet at current height if wallet not found', function(done) {
        var testNode = {
          services: {
            bitcoind: {
              height: 100,
              tiphash: '000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4941'
            }
          }
        };
        var wallet = new Wallet({node: testNode});
        wallet.db = {
          get: sinon.stub().callsArgWith(1, new Error('NotFound'))
        };
        wallet._loadWalletData(function(err) {
          if (err) {
            return done(err);
          }
          should.exist(wallet.walletData);
          done();
        });
      });
      it('will give unhandled error for getting wallet data', function(done) {
        var wallet = new Wallet({node: node});
        wallet.db = {
          get: sinon.stub().callsArgWith(1, new Error('test'))
        };
        wallet._loadWalletData(function(err) {
          err.should.be.instanceOf(Error);
          err.message.should.equal('test');
          done();
        });
      });
      it('will set the wallet reference to wallet data', function(done) {
        var blockHash = new Buffer('000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4941', 'hex');
        var walletData = models.Wallet.create({height: 100, blockHash: blockHash});
        var wallet = new Wallet({node: node});
        wallet.db = {
          get: sinon.stub().callsArgWith(1, null, walletData.toBuffer())
        };
        wallet._loadWalletData(function(err) {
          if (err) {
            return done(err);
          }
          wallet.walletData.should.deep.equal(walletData);
          done();
        });
      });
    });
    describe('#_loadWalletTxids', function() {
      it('will create new wallet txids if not found', function(done) {
        var wallet = new Wallet({node: node});
        wallet.db = {
          get: sinon.stub().callsArgWith(1, new Error('NotFound'))
        };
        wallet._loadWalletTxids(function(err) {
          if (err) {
            return done(err);
          }
          should.exist(wallet.walletTxids);
          done();
        });
      });
      it('will give unhandled error for getting wallet txids', function(done) {
        var wallet = new Wallet({node: node});
        wallet.db = {
          get: sinon.stub().callsArgWith(1, new Error('test'))
        };
        wallet._loadWalletTxids(function(err) {
          err.should.be.instanceOf(Error);
          err.message.should.equal('test');
          done();
        });
      });
      it('will set the wallet refernce to wallet txids', function(done) {
        var walletTxids = models.WalletTxids.create();
        var wallet = new Wallet({node: node});
        wallet.db = {
          get: sinon.stub().callsArgWith(1, null, walletTxids.toBuffer())
        };
        wallet._loadWalletTxids(function(err) {
          if (err) {
            return done(err);
          }
          wallet.walletTxids.should.deep.equal(walletTxids);
          done();
        });
      });
    });
    describe('#_loadWalletDataAll', function() {
      it('will call all methods in series', function(done) {
        var wallet = new Wallet({node: node});
        wallet._loadWalletData = sinon.stub().callsArg(0);
        wallet._loadWalletTxids = sinon.stub().callsArg(0);
        wallet._loadWalletDataAll(function(err) {
          if (err) {
            return done(err);
          }
          wallet._loadWalletData.callCount.should.equal(1);
          wallet._loadWalletTxids.callCount.should.equal(1);
          done();
        });
      });
    });
    describe('#start', function() {
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
        wallet._setupApplicationDirectory = sinon.stub().callsArg(0);
        wallet._setupDatabase = sinon.stub().callsArg(0);
        sinon.stub(wallet, '_loadWalletDataAll', function(callback) {
          wallet.walletData = walletData;
          callback();
        });
        wallet.start(function(err) {
          if (err) {
            return done(err);
          }
          // init wallet data
          wallet._setupApplicationDirectory.callCount.should.equal(1);
          wallet._setupDatabase.callCount.should.equal(1);
          wallet._loadWalletDataAll.callCount.should.equal(1);

          // set the block handler
          wallet.blockHandler.should.be.instanceOf(BlockHandler);
          wallet.blockHandler.addressFilter.should.be.instanceOf(BloomFilter);
          wallet.blockHandler.network.should.equal(bitcore.Networks.testnet);

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
        var testNode = {};
        var wallet  = new Wallet({node: testNode});
        wallet._setupApplicationDirectory = sinon.stub().callsArgWith(0, new Error('test'));
        wallet.start(function(err) {
          err.should.be.instanceOf(Error);
          err.message.should.equal('test');
          done();
        });
      });
    });
  });
  describe('stopping service', function() {
    describe('#stop', function() {
      it('will call db close if defined', function(done) {
        var wallet = new Wallet({node: node});
        wallet.db = {
          close: sinon.stub().callsArg(0)
        };
        wallet.stop(done);
      });
      it('will continue if db is undefined', function(done) {
        var wallet = new Wallet({node: node});
        wallet.stop(done);
      });
    });
  });
  describe('syncing', function() {
    describe('#_connectBlockAddressDeltas', function() {
      var deltaData = {
        blockHeight: 10,
        address: '16VZnHwRhwrExfeHFHGjwrgEMq8VcYPs9r',
        deltas: [
          {
            blockIndex: 2,
            txid: 'd51a988ab4ed0cb80cdf228a1e657857708a6205c7037493010144441d60c676'
          }
        ],
      };
      it('will get database key for address', function(done) {
        var testNode = {};
        var wallet = new Wallet({node: testNode});
        wallet.db = {
          get: sinon.stub().callsArgWith(1, null)
        };
        var walletTxids = {
          insert: sinon.stub()
        };
        var walletData = {};
        wallet._connectBlockAddressDeltas(walletTxids, walletData, deltaData, function(err) {
          if (err) {
            return done(err);
          }
          walletTxids.insert.callCount.should.equal(1);
          walletTxids.insert.args[0][0].should.equal(10);
          walletTxids.insert.args[0][1].should.equal(2);
          walletTxids.insert.args[0][2].should.be.instanceOf(Buffer);
          walletTxids.insert.args[0][2].toString('hex').should.equal(deltaData.deltas[0].txid);
          done();
        });
      });
      it('will skip if address does not exist', function(done) {
        var testNode = {};
        var wallet = new Wallet({node: testNode});
        wallet.db = {
          get: sinon.stub().callsArgWith(1, new Error('NotFound'))
        };
        var walletTxids = {
          insert: sinon.stub()
        };
        var walletData = {};
        wallet._connectBlockAddressDeltas(walletTxids, walletData, deltaData, function(err) {
          if (err) {
            return done(err);
          }
          walletTxids.insert.callCount.should.equal(0);
          done();
        });
      });
      it('will give error during address database lookup', function(done) {
        var testNode = {};
        var wallet = new Wallet({node: testNode});
        wallet.db = {
          get: sinon.stub().callsArgWith(1, new Error('unexpected'))
        };
        var walletTxids = {
          insert: sinon.stub()
        };
        var walletData = {};
        wallet._connectBlockAddressDeltas(walletTxids, walletData, deltaData, function(err) {
          err.should.be.instanceOf(Error);
          err.message.should.equal('unexpected');
          done();
        });
      });
      it.skip('will update balance of walletData', function() {
      });
    });
    describe('#_connectBlockCommit', function() {
      it('will batch and update wallet data references', function(done) {
        var testNode = {
          log: {
            info: sinon.stub()
          }
        };
        var wallet = new Wallet({node: testNode});
        wallet.db = {
          batch: sinon.stub().callsArg(1)
        };
        var walletTxids = {
          toBuffer: sinon.stub().returns(new Buffer('abcdef', 'hex')),
        };
        var walletData = {
          toBuffer: sinon.stub().returns(new Buffer('fedcba', 'hex')),
        };
        var block = {
          hash: '0000000000253b76babed6f36b68b79a0c232f89e6756bd7a848c63b83ca53a4'
        };
        wallet._connectBlockCommit(walletTxids, walletData, block, function(err) {
          if (err) {
            return done(err);
          }
          wallet.db.batch.callCount.should.equal(1);
          wallet.db.batch.args[0][0].should.deep.equal([
            {
              type: 'put',
              key: new Buffer('1000', 'hex'),
              value: new Buffer('fedcba', 'hex')
            },
            {
              type: 'put',
              key: new Buffer('1001', 'hex'),
              value: new Buffer('abcdef', 'hex')
            }
          ]);
          wallet.walletData.should.equal(walletData);
          wallet.walletTxids.should.equal(walletTxids);
          done();
        });
      });
      it('will give error from batch', function(done) {
        var testNode = {};
        var wallet = new Wallet({node: testNode});
        wallet.db = {
          batch: sinon.stub().callsArgWith(1, new Error('test'))
        };
        var walletTxids = {
          toBuffer: sinon.stub().returns(new Buffer('abcdef', 'hex')),
        };
        var walletData = {
          toBuffer: sinon.stub().returns(new Buffer('fedcba', 'hex')),
        };
        var block = {
          hash: '0000000000253b76babed6f36b68b79a0c232f89e6756bd7a848c63b83ca53a4'
        };
        wallet._connectBlockCommit(walletTxids, walletData, block, function(err) {
          err.should.be.instanceOf(Error);
          err.message.should.equal('test');
          done();
        });
      });
    });
    describe('#_connectBlock', function() {
      it('will get address deltas from block handler', function(done) {
        var testNode = {};
        var wallet = new Wallet({node: testNode});
        wallet._connectBlockAddressDeltas = sinon.stub().callsArg(3);
        wallet._connectBlockCommit = sinon.stub().callsArg(3);
        wallet.blockHandler = {
          buildAddressDeltaList: sinon.stub().returns({
            'address1': [],
            'address2': []
          })
        };
        var walletDataClone = {};
        wallet.walletData = {
          clone: sinon.stub().returns(walletDataClone)
        };
        var walletTxidsClone = {};
        wallet.walletTxids = {
          clone: sinon.stub().returns(walletTxidsClone)
        };
        var block = {
          __height: 100
        };
        wallet._connectBlock(block, function(err) {
          if (err) {
            return done(err);
          }
          wallet._connectBlockAddressDeltas.callCount.should.equal(2);
          wallet._connectBlockAddressDeltas.args[0][0].should.equal(walletTxidsClone);
          wallet._connectBlockAddressDeltas.args[0][1].should.equal(walletDataClone);
          wallet._connectBlockAddressDeltas.args[0][2].should.deep.equal({
            address: 'address1',
            deltas: [],
            blockHeight: 100
          });
          wallet._connectBlockCommit.callCount.should.equal(1);
          wallet._connectBlockCommit.args[0][0].should.equal(walletTxidsClone);
          wallet._connectBlockCommit.args[0][1].should.equal(walletDataClone);
          wallet._connectBlockCommit.args[0][2].should.equal(block);
          done();
        });
      });
      it('will give error from connecting block address deltas', function(done) {
        var testNode = {};
        var wallet = new Wallet({node: testNode});
        wallet._connectBlockAddressDeltas = sinon.stub().callsArgWith(3, new Error('test'));
        wallet._connectBlockCommit = sinon.stub().callsArg(3);
        wallet.blockHandler = {
          buildAddressDeltaList: sinon.stub().returns({
            'address1': [],
            'address2': []
          })
        };
        var walletDataClone = {};
        wallet.walletData = {
          clone: sinon.stub().returns(walletDataClone)
        };
        var walletTxidsClone = {};
        wallet.walletTxids = {
          clone: sinon.stub().returns(walletTxidsClone)
        };
        var block = {
          __height: 100
        };
        wallet._connectBlock(block, function(err) {
          err.should.be.instanceOf(Error);
          err.message.should.equal('test');
          done();
        });
      });
    });
    describe.skip('#_disconnectTip', function() {
      it('', function() {
      });
    });
    describe('#_updateTip', function() {
      it('will get raw block or the next block height', function(done) {
        var testNode = {
          getRawBlock: function(height, callback) {
            height.should.equal(1);
            callback(null, new Buffer(blockData[0], 'hex'));
          }
        };
        var wallet = new Wallet({node: testNode});
        wallet.walletData = {
          blockHash: new Buffer('000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4943', 'hex')
        };
        wallet._connectBlock = sinon.stub().callsArg(1);
        wallet._updateTip(0, function(err) {
          if (err) {
            return done(err);
          }
          wallet._connectBlock.callCount.should.equal(1);
          wallet._connectBlock.args[0][0].__height.should.equal(1);
          done();
        });
      });
      it('will handle error from getting block', function(done) {
        var testNode = {
          getRawBlock: sinon.stub().callsArgWith(1, new Error('test'))
        };
        var wallet = new Wallet({node: testNode});
        wallet._updateTip(100, function(err) {
          err.should.be.instanceOf(Error);
          err.message.should.equal('test');
          done();
        });
      });
      it('will handle error while connecting block', function(done) {
        var testNode = {
          getRawBlock: function(height, callback) {
            height.should.equal(1);
            callback(null, new Buffer(blockData[0], 'hex'));
          }
        };
        var wallet = new Wallet({node: testNode});
        wallet.walletData = {
          blockHash: new Buffer('000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4943', 'hex')
        };
        wallet._connectBlock = sinon.stub().callsArgWith(1, new Error('test'));
        wallet._updateTip(0, function(err) {
          err.should.be.instanceOf(Error);
          wallet._connectBlock.callCount.should.equal(1);
          done();
        });
      });
      it('will disconnect block if block does not advance chain', function(done) {
        var testNode = {
          log: {
            warn: sinon.stub()
          },
          getRawBlock: function(height, callback) {
            height.should.equal(1);
            callback(null, new Buffer(blockData[0], 'hex'));
          }
        };
        var wallet = new Wallet({node: testNode});
        wallet.walletData = {
          blockHash: new Buffer('000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4941', 'hex')
        };
        wallet._connectBlock = sinon.stub().callsArg(1);
        wallet._disconnectTip = sinon.stub().callsArg(0);
        wallet._updateTip(0, function(err) {
          if (err) {
            return done(err);
          }
          wallet._disconnectTip.callCount.should.equal(1);
          wallet._connectBlock.callCount.should.equal(0);
          done();
        });
      });
      it('will handle error while disconnecting block', function(done) {
        var testNode = {
          log: {
            warn: sinon.stub()
          },
          getRawBlock: function(height, callback) {
            height.should.equal(1);
            callback(null, new Buffer(blockData[0], 'hex'));
          }
        };
        var wallet = new Wallet({node: testNode});
        wallet.walletData = {
          blockHash: new Buffer('000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4941', 'hex')
        };
        wallet._connectBlock = sinon.stub().callsArg(1);
        wallet._disconnectTip = sinon.stub().callsArgWith(0, new Error('test'));
        wallet._updateTip(0, function(err) {
          err.should.be.instanceOf(Error);
          err.message.should.equal('test');
          wallet._disconnectTip.callCount.should.equal(1);
          wallet._connectBlock.callCount.should.equal(0);
          done();
        });
      });
    });
    describe('#sync', function() {
      it('will bail out if already syncing', function() {
        var wallet = new Wallet({node: node});
        wallet.syncing = true;
        var started = wallet.sync();
        started.should.equal(false);
      });
      it('will bail out if node is stopping', function() {
        var testNode = {};
        var wallet = new Wallet({node: testNode});
        wallet.node.stopping = true;
        var started = wallet.sync();
        started.should.equal(false);
      });
      it('will bail out if walletData is not available', function() {
        var wallet = new Wallet({node: node});
        wallet.walletData = null;
        var started = wallet.sync();
        started.should.equal(false);
      });
      it('will bail out if walletTxids is not available', function() {
        var wallet = new Wallet({node: node});
        wallet.walletTxids = null;
        var started = wallet.sync();
        started.should.equal(false);
      });
      it('will emit synced when height matches', function() {
        var wallet = new Wallet({node: node});
        wallet.walletTxids = null;
        var started = wallet.sync();
        started.should.equal(false);
      });
      it('will update wallet height until it matches bitcoind height', function(done) {
        var testNode = {};
        testNode.stopping = false;
        testNode.services = {
          bitcoind: {
            height: 200
          }
        };
        var wallet = new Wallet({node: testNode});
        wallet.walletData = {};
        wallet.walletData.height = 100;
        wallet.walletTxids = {};
        wallet._updateTip = function(height, callback) {
          wallet.walletData.height += 1;
          setImmediate(callback);
        };
        sinon.spy(wallet, '_updateTip');
        wallet.once('synced', function() {
          wallet._updateTip.callCount.should.equal(100);
          wallet.walletData.height.should.equal(200);
          wallet.syncing.should.equal(false);
          done();
        });
        var started = wallet.sync();
        started.should.equal(true);
      });
      it('will bail out if node is stopping while syncing', function(done) {
        var testNode = {};
        testNode.stopping = false;
        testNode.services = {
          bitcoind: {
            height: 200
          }
        };
        var wallet = new Wallet({node: testNode});
        wallet.walletData = {};
        wallet.walletData.height = 100;
        wallet.walletTxids = {};
        wallet._updateTip = function(height, callback) {
          wallet.walletData.height += 1;
          wallet.node.stopping = true;
          setImmediate(callback);
        };
        sinon.spy(wallet, '_updateTip');
        wallet.once('synced', function() {
          throw new Error('Sync should not be called');
        });
        var started = wallet.sync();
        setImmediate(function() {
          started.should.equal(true);
          wallet._updateTip.callCount.should.equal(1);
          wallet.walletData.height.should.equal(101);
          wallet.syncing.should.equal(false);
          done();
        });
      });
      it('will emit error while syncing', function(done) {
        var testNode = {};
        testNode.stopping = false;
        testNode.services = {
          bitcoind: {
            height: 200
          }
        };
        var wallet = new Wallet({node: testNode});
        wallet.walletData = {};
        wallet.walletData.height = 100;
        wallet.walletTxids = {};
        wallet._updateTip = sinon.stub().callsArgWith(1, new Error('test'));
        wallet.once('synced', function() {
          throw new Error('Sync should not be called');
        });
        wallet.once('error', function(err) {
          err.should.be.instanceOf(Error);
          wallet.syncing.should.equal(false);
          wallet._updateTip.callCount.should.equal(1);
          wallet.walletData.height.should.equal(100);
          done();
        });
        var started = wallet.sync();
        started.should.equal(true);
      });
    });
  });
  describe('api methods', function() {
    describe('importing wallet keys', function() {
      describe('#_checkKeyImported', function() {
        it('it will continue if key is not found', function(done) {
          var wallet = new Wallet({node: node});
          wallet.db = {
            get: sinon.stub().callsArgWith(1, new Error('NotFound'))
          };
          var key = {
            address: '16VZnHwRhwrExfeHFHGjwrgEMq8VcYPs9r'
          };
          wallet._checkKeyImported(key, done);
        });
        it('it will give unexpected error', function(done) {
          var wallet = new Wallet({node: node});
          wallet.db = {
            get: sinon.stub().callsArgWith(1, new Error('test'))
          };
          var key = {
            address: '16VZnHwRhwrExfeHFHGjwrgEMq8VcYPs9r'
          };
          wallet._checkKeyImported(key, function(err) {
            err.should.be.instanceOf(Error);
            done();
          });
        });
        it('will give error if key already exists', function(done) {
          var wallet = new Wallet({node: node});
          wallet.db = {
            get: sinon.stub().callsArgWith(1, null, new Buffer(new Array(0)))
          };
          var key = {
            address: '16VZnHwRhwrExfeHFHGjwrgEMq8VcYPs9r'
          };
          wallet._checkKeyImported(key, function(err) {
            err.should.be.instanceOf(Error);
            err.message.should.equal('Key already imported');
            done();
          });
        });
      });
      describe('#_addKeyToWallet', function() {
        it('will handle error from client query', function(done) {
          var node = {
            services: {
              bitcoind: {
                client: {
                  getAddressDeltas: sinon.stub().callsArgWith(1, {code: -1, message: 'test'})
                }
              }
            }
          };
          var wallet = new Wallet({node: node});
          var walletTxids = {
            insert: sinon.stub()
          };
          var walletData = {
            addressFilter: {
              insert: sinon.stub()
            },
            balance: 0,
            height: 100
          };
          var keyData = {
            address: '16VZnHwRhwrExfeHFHGjwrgEMq8VcYPs9r'
          };
          wallet._addKeyToWallet(walletTxids, walletData, keyData, function(err) {
            err.should.be.instanceOf(Error);
            done();
          });
        });
        it('will insert txids, update bloom filter and add to balance', function(done) {
          var deltas = [{
            satoshis: 50000000,
            height: 198,
            blockindex: 12,
            txid: '90e262c7baaf4a5a8eb910d075e945d5a27f856f71a06ff8681128115a07441a'
          }];
          var node = {
            services: {
              bitcoind: {
                client: {
                  getAddressDeltas: sinon.stub().callsArgWith(1, null, {
                    result: deltas
                  })
                }
              }
            }
          };
          var wallet = new Wallet({node: node});
          var walletTxids = {
            insert: sinon.stub()
          };
          var walletData = {
            addressFilter: {
              insert: sinon.stub()
            },
            balance: 50000000,
            height: 200
          };
          var keyData = {
            address: '16VZnHwRhwrExfeHFHGjwrgEMq8VcYPs9r'
          };
          wallet._addKeyToWallet(walletTxids, walletData, keyData, function(err) {
            var getAddressDeltas = node.services.bitcoind.client.getAddressDeltas;
            getAddressDeltas.callCount.should.equal(1);
            var query = getAddressDeltas.args[0][0];
            query.should.deep.equal({addresses: ['16VZnHwRhwrExfeHFHGjwrgEMq8VcYPs9r'], start: 1, end: 200});
            walletTxids.insert.callCount.should.equal(1);
            walletTxids.insert.args[0][0].should.equal(198);
            walletTxids.insert.args[0][1].should.equal(12);
            walletTxids.insert.args[0][2].should.deep.equal(
              new Buffer('90e262c7baaf4a5a8eb910d075e945d5a27f856f71a06ff8681128115a07441a', 'hex')
            );
            walletData.addressFilter.insert.callCount.should.equal(1);
            var hashBuffer = walletData.addressFilter.insert.args[0][0].toString('hex');
            hashBuffer.should.equal('3c3fa3d4adcaf8f52d5b1843975e122548269937');
            walletData.balance.should.equal(100000000);
            done();
          });
        });
      });
      describe('#_commitWalletKey', function() {
        it('will send expected operations to batch command', function(done) {
          var wallet = new Wallet({node: node});
          wallet.db = {};
          wallet.db.batch = sinon.stub().callsArg(1);
          var walletTxids = {
            toBuffer: sinon.stub().returns(new Buffer('01', 'hex'))
          };
          var walletData = {
            toBuffer: sinon.stub().returns(new Buffer('02', 'hex'))
          };
          var keyData = {
            getKey: sinon.stub().returns(new Buffer('03', 'hex')),
            getValue: sinon.stub().returns(new Buffer('04', 'hex'))
          };
          wallet._commitWalletKey(walletTxids, walletData, keyData, function(err) {
            if (err) {
              return done(err);
            }
            wallet.db.batch.callCount.should.equal(1);
            var ops = wallet.db.batch.args[0][0];
            ops.should.deep.equal([
              {
                type: 'put',
                key: new Buffer('1000', 'hex'),
                value: new Buffer('02', 'hex')
              },
              {
                type: 'put',
                key: new Buffer('1001', 'hex'),
                value: new Buffer('01', 'hex')
              },
              {
                type: 'put',
                key: new Buffer('03', 'hex'),
                value: new Buffer('04', 'hex')
              }
            ]);
            done();
          });
        });
        it('will handle error from batch and leave wallet references unchanged', function(done) {
          var wallet = new Wallet({node: node});
          wallet.walletTxids = null;
          wallet.walletData = null;
          wallet.db = {};
          wallet.db.batch = sinon.stub().callsArgWith(1, new Error('test'));
          var walletTxids = {
            toBuffer: sinon.stub()
          };
          var walletData = {
            toBuffer: sinon.stub()
          };
          var keyData = {
            getKey: sinon.stub(),
            getValue: sinon.stub()
          };
          wallet._commitWalletKey(walletTxids, walletData, keyData, function(err) {
            err.should.be.instanceOf(Error);
            should.equal(wallet.walletTxids, null);
            should.equal(wallet.walletData, null);
            done();
          });
        });
        it('will update wallet references with updated data', function(done) {
          var wallet = new Wallet({node: node});
          wallet.db = {};
          wallet.db.batch = sinon.stub().callsArg(1);
          var walletTxids = {
            toBuffer: sinon.stub()
          };
          var walletData = {
            toBuffer: sinon.stub()
          };
          var keyData = {
            getKey: sinon.stub(),
            getValue: sinon.stub()
          };
          wallet._commitWalletKey(walletTxids, walletData, keyData, function(err) {
            if (err) {
              return done(err);
            }
            wallet.walletTxids.should.equal(walletTxids);
            wallet.walletData.should.equal(walletData);
            done();
          });
        });
      });
      describe('#importWalletKey', function() {
        it('will give error if wallet is currency syncing or importing another address', function(done) {
          var wallet = new Wallet({node: node});
          wallet.syncing = true;
          wallet.importWalletKey({}, function(err) {
            err.should.be.instanceOf(Error);
            done();
          });
        });
        it('will set syncing until there is an error', function(done) {
          var wallet = new Wallet({node: node});
          wallet.walletData = {
            clone: sinon.stub()
          };
          wallet.walletTxids = {
            clone: sinon.stub()
          };
          wallet._checkKeyImported = function(key, callback) {
            wallet.syncing.should.equal(true);
            callback(new Error('test'));
          };
          wallet.importWalletKey({address: '16VZnHwRhwrExfeHFHGjwrgEMq8VcYPs9r'}, function(err) {
            err.should.be.instanceOf(Error);
            wallet.syncing.should.equal(false);
            done();
          });
        });
        it('will set syncing until finished', function(done) {
          var wallet = new Wallet({node: node});
          wallet.walletData = {
            clone: sinon.stub()
          };
          wallet.walletTxids = {
            clone: sinon.stub()
          };
          wallet._checkKeyImported = function(key, callback) {
            wallet.syncing.should.equal(true);
            callback();
          };
          wallet._addKeyToWallet = function(walletTxids, walletData, keyData, callback) {
            wallet.syncing.should.equal(true);
            callback();
          };
          wallet._commitWalletKey = function(walletTxids, walletData, keydata, callback) {
            wallet.syncing.should.equal(true);
            callback();
          };
          wallet.importWalletKey({address: '16VZnHwRhwrExfeHFHGjwrgEMq8VcYPs9r'}, function(err) {
            if (err) {
              return done(err);
            }
            wallet.syncing.should.equal(false);
            done();
          });
        });
        it('will check that key is not imported', function(done) {
          var wallet = new Wallet({node: node});
          wallet.walletData = {
            clone: sinon.stub()
          };
          wallet.walletTxids = {
            clone: sinon.stub()
          };
          wallet._checkKeyImported = sinon.stub().callsArgWith(1, new Error('Key already imported'));
          wallet.importWalletKey({address: '16VZnHwRhwrExfeHFHGjwrgEMq8VcYPs9r'}, function(err) {
            err.should.be.instanceOf(Error);
            err.message.should.equal('Key already imported');
            wallet.syncing.should.equal(false);
            done();
          });
        });
        it('will add key to cloned wallet and commit changes', function(done) {
          var wallet = new Wallet({node: node});
          var walletDataClone = {};
          var walletTxidsClone = {};
          wallet.walletData = {
            clone: sinon.stub().returns(walletDataClone)
          };
          wallet.walletTxids = {
            clone: sinon.stub().returns(walletTxidsClone)
          };
          wallet._checkKeyImported = sinon.stub().callsArgWith(1);
          wallet._addKeyToWallet = sinon.stub().callsArgWith(3);
          wallet._commitWalletKey = sinon.stub().callsArgWith(3);
          wallet.importWalletKey({address: '16VZnHwRhwrExfeHFHGjwrgEMq8VcYPs9r'}, function(err) {
            wallet._addKeyToWallet.callCount.should.equal(1);
            wallet._addKeyToWallet.args[0][0].should.equal(walletTxidsClone);
            wallet._addKeyToWallet.args[0][1].should.equal(walletDataClone);
            wallet._commitWalletKey.callCount.should.equal(1);
            wallet._commitWalletKey.args[0][0].should.equal(walletTxidsClone);
            wallet._commitWalletKey.args[0][1].should.equal(walletDataClone);
            done();
          });
        });
        it('will give error from updating wallet and set syncing to false', function(done) {
          var wallet = new Wallet({node: node});
          wallet.walletData = {
            clone: sinon.stub()
          };
          wallet.walletTxids = {
            clone: sinon.stub()
          };
          wallet._checkKeyImported = sinon.stub().callsArg(1);
          wallet._addKeyToWallet = sinon.stub().callsArgWith(3, new Error('test'));
          wallet.importWalletKey({address: '16VZnHwRhwrExfeHFHGjwrgEMq8VcYPs9r'}, function(err) {
            err.should.be.instanceOf(Error);
            done();
          });
        });
        it('will give error from commiting changes to wallet and set syncing to false', function(done) {
          var wallet = new Wallet({node: node});
          wallet.walletData = {
            clone: sinon.stub()
          };
          wallet.walletTxids = {
            clone: sinon.stub()
          };
          wallet._checkKeyImported = sinon.stub().callsArg(1);
          wallet._addKeyToWallet = sinon.stub().callsArg(3);
          wallet._commitWalletKey = sinon.stub().callsArgWith(3, new Error('test'));
          wallet.importWalletKey({address: '16VZnHwRhwrExfeHFHGjwrgEMq8VcYPs9r'}, function(err) {
            err.should.be.instanceOf(Error);
            done();
          });
        });
      });
    });
    describe('#_validateFromAndTo', function() {
      function testValidate(options) {
        var wallet = new Wallet({node: node});
        (function() {
          wallet._validateFromAndTo(options);
        }).should.throw(Error);
      }
      it('will throw error if "from" or "to" is not a number', function() {
        testValidate({from: 0.1});
        testValidate({to: 0.1});
      });
      it('will throw if "from" is greater than "to"', function() {
        testValidate({from: 10, to: 0});
      });
      it('will throw if range exceeds maximum', function() {
        testValidate({from: 0, to: 10000});
      });
      it('will not throw error', function() {
        var wallet = new Wallet({node: node});
        wallet._validateFromAndTo({from: 0, to: 10});
      });
    });
    describe('#getWalletTxids', function() {
      function testDefaultOptions(options, callback) {
        var wallet = new Wallet({node: node});
        wallet.walletTxids = {};
        wallet.walletTxids.getLatest = sinon.stub().returns([]);
        wallet.getWalletTxids(options, function(err) {
          if (err) {
            return callback(err);
          }
          wallet.walletTxids.getLatest.callCount.should.equal(1);
          wallet.walletTxids.getLatest.args[0][0].should.equal(0);
          wallet.walletTxids.getLatest.args[0][1].should.equal(10);
          callback();
        });
      }
      it('will set default options', function(done) {
        testDefaultOptions(null, done);
      });
      it('will set default options if missing "from" and "to"', function(done) {
        testDefaultOptions({}, done);
      });
      it('will set default options if missing "from"', function(done) {
        testDefaultOptions({to: 100}, done);
      });
      it('will set default options if missing "to"', function(done) {
        testDefaultOptions({from: 100}, done);
      });
      it('will set "from" and "to" options', function(done) {
        var wallet = new Wallet({node: node});
        wallet.walletTxids = {};
        wallet.walletTxids.getLatest = sinon.stub().returns([]);
        wallet.getWalletTxids({from: 3, to: 20}, function() {
          wallet.walletTxids.getLatest.callCount.should.equal(1);
          wallet.walletTxids.getLatest.args[0][0].should.equal(3);
          wallet.walletTxids.getLatest.args[0][1].should.equal(20);
          done();
        });
      });
      it('will give error if options are invalid', function(done) {
        var wallet = new Wallet({node: node});
        wallet._validateFromAndTo = sinon.stub().throws(new Error('test'));
        wallet.getWalletTxids({}, function(err) {
          err.should.be.instanceOf(Error);
          done();
        });
      });
      it('will give buffers if option is set', function(done) {
        var wallet = new Wallet({node: node});
        var txid = new Buffer(new Array(0));
        wallet.walletTxids = {};
        wallet.walletTxids.getLatest = sinon.stub().returns([txid]);
        wallet.getWalletTxids({buffers: true}, function(err, txids) {
          txids[0].should.be.instanceOf(Buffer);
          done();
        });
      });
      it('will give hex strings if option buffer is not set', function(done) {
        var wallet = new Wallet({node: node});
        var txid = new Buffer(new Array(0));
        wallet.walletTxids = {};
        wallet.walletTxids.getLatest = sinon.stub().returns([txid]);
        wallet.getWalletTxids({buffers: false}, function(err, txids) {
          txids[0].should.be.a('string');
          done();
        });
      });
    });
    describe('#getAPIMethods', function() {
      it('will return expected methods', function() {
        var wallet = new Wallet({node: node});
        wallet.getAPIMethods().length.should.equal(2);
      });
    });
  });
  describe('events', function() {
    describe('#getPublishEvents', function() {
      it('will return expected events', function() {
        var wallet = new Wallet({node: node});
        wallet.getPublishEvents().should.deep.equal([]);
      });
    });
  });
});
