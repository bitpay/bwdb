'use strict';

var EventEmitter = require('events').EventEmitter;
var chai = require('chai');
var should = chai.should();
var sinon = require('sinon');
var bitcore = require('bitcore-lib');
var BloomFilter = require('bloom-filter');

var utils = require('../lib/utils');
var Wallet = require('../lib/wallet');
var BlockHandler = require('../lib/block-handler');
var models = require('../lib/models');
var blockData = require('./data/blocks.json');

describe('Wallet', function() {
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
  describe('starting service', function() {
    describe('#_setupDatabase', function() {
      it('will open database from path', function(done) {
        var testNode = {
          network: 'testnet',
          bitcoind: {},
          services: {
            bitcoind: {}
          }
        };
        // This will attempt to actually create the directory and database
        var wallet = new Wallet({node: testNode});
        wallet._getDatabasePath = sinon.stub().returns('/tmp/bwsv2-test.lmdb');
        wallet._setupDatabase(function(err) {
          if (err) {
            return done(err);
          }
          done();
        });
      });
    });
    describe('#_loadWalletData', function() {
      it('will create new wallet at current height if wallet not found', function(done) {
        var testNode = {
          network: 'testnet'
        };
        var wallet = new Wallet({node: testNode});
        wallet.bitcoind = {
          height: 100,
          tiphash: '000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4941'
        };
        wallet.db = {
          env: {
            beginTxn: sinon.stub().returns({
              getBinary: sinon.stub().returns(null),
              abort: sinon.stub()
            })
          }
        };
        wallet._loadWalletData(function(err) {
          if (err) {
            return done(err);
          }
          should.exist(wallet.walletData);
          done();
        });
      });
      it('will set the wallet reference to wallet data', function(done) {
        var blockHash = new Buffer('000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4941', 'hex');
        var walletData = models.Wallet.create({height: 100, blockHash: blockHash});
        var wallet = new Wallet({node: node});
        wallet.db = {
          env: {
            beginTxn: sinon.stub().returns({
              getBinary: sinon.stub().returns(walletData.toBuffer()),
              abort: sinon.stub()
            })
          }
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
  });
  describe('stopping service', function() {
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
  describe('syncing', function() {
    var testNode = {
      network: 'testnet'
    };
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
        var wallet = new Wallet({node: testNode});
        var txidsDbi = {};
        wallet.db = {
          txids: txidsDbi
        };
        var txn = {
          getBinary: sinon.stub().returns(true),
          putBinary: sinon.stub()
        };
        var walletData = {};
        wallet._connectBlockAddressDeltas(txn, walletData, deltaData, function(err) {
          if (err) {
            return done(err);
          }
          txn.putBinary.callCount.should.equal(1);
          txn.putBinary.args[0][0].should.equal(txidsDbi);
          txn.putBinary.args[0][1].should.equal('0000000a00000002');
          txn.putBinary.args[0][2].should.be.instanceOf(Buffer);
          txn.putBinary.args[0][2].toString('hex').should.equal(deltaData.deltas[0].txid);
          done();
        });
      });
      it('will skip if address does not exist', function(done) {
        var wallet = new Wallet({node: testNode});
        var txidsDbi = {};
        wallet.db = {
          txids: txidsDbi
        };
        var txn = {
          getBinary: sinon.stub().returns(false),
          putBinary: sinon.stub()
        };
        var walletData = {};
        wallet._connectBlockAddressDeltas(txn, walletData, deltaData, function(err) {
          if (err) {
            return done(err);
          }
          txn.putBinary.callCount.should.equal(0);
          done();
        });
      });
      it.skip('will update balance of walletData', function() {
      });
    });
    describe('#_connectBlockCommit', function() {
      it('will batch and update wallet data references', function(done) {
        var testNode2 = {
          log: {
            info: sinon.stub()
          },
          network: 'testnet'
        };
        var wallet = new Wallet({node: testNode2});
        var walletDbi = {};
        wallet.db = {
          wallet: walletDbi,
          env: {
            sync: sinon.stub().callsArg(0)
          }
        };
        var walletData = {
          toBuffer: sinon.stub().returns(new Buffer('fedcba', 'hex')),
        };
        var block = {
          hash: '0000000000253b76babed6f36b68b79a0c232f89e6756bd7a848c63b83ca53a4'
        };
        var txn = {
          putBinary: sinon.stub(),
          commit: sinon.stub()
        };
        wallet._connectBlockCommit(txn, walletData, block, function(err) {
          if (err) {
            return done(err);
          }
          txn.commit.callCount.should.equal(1);
          txn.putBinary.callCount.should.equal(1);
          txn.putBinary.args[0][0].should.equal(walletDbi);
          txn.putBinary.args[0][1].should.equal('1000');
          txn.putBinary.args[0][2].should.deep.equal(new Buffer('fedcba', 'hex'));
          wallet.walletData.should.equal(walletData);
          done();
        });
      });
      it('will give error from sync', function(done) {
        var wallet = new Wallet({node: testNode});
        wallet.db = {
          env: {
            sync: sinon.stub().callsArgWith(0, new Error('test'))
          }
        };
        var walletData = {
          toBuffer: sinon.stub().returns(new Buffer('fedcba', 'hex')),
        };
        var block = {
          hash: '0000000000253b76babed6f36b68b79a0c232f89e6756bd7a848c63b83ca53a4'
        };
        var txn = {
          putBinary: sinon.stub(),
          commit: sinon.stub()
        };
        wallet._connectBlockCommit(txn, walletData, block, function(err) {
          err.should.be.instanceOf(Error);
          err.message.should.equal('test');
          done();
        });
      });
    });
    describe('#_connectBlock', function() {
      var testNode = {
        network: 'testnet'
      };
      it('will get address deltas from block handler', function(done) {
        var wallet = new Wallet({node: testNode});
        var txn = {};
        wallet.db = {
          env: {
            beginTxn: sinon.stub().returns(txn)
          }
        };
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
          wallet._connectBlockAddressDeltas.args[0][0].should.equal(txn);
          wallet._connectBlockAddressDeltas.args[0][1].should.equal(walletDataClone);
          wallet._connectBlockAddressDeltas.args[0][2].should.deep.equal({
            address: 'address1',
            deltas: [],
            blockHeight: 100
          });
          wallet._connectBlockCommit.callCount.should.equal(1);
          wallet._connectBlockCommit.args[0][0].should.equal(txn);
          wallet._connectBlockCommit.args[0][1].should.equal(walletDataClone);
          wallet._connectBlockCommit.args[0][2].should.equal(block);
          done();
        });
      });
      it('will give error from connecting block address deltas', function(done) {
        var wallet = new Wallet({node: testNode});
        var txn = {};
        wallet.db = {
          env: {
            beginTxn: sinon.stub().returns(txn)
          }
        };
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
    describe('#_disconnectTip', function() {
      it('will call callback', function(done) {
        var testNode = {
          network: 'testnet'
        };
        var wallet = new Wallet({node: testNode});
        wallet._disconnectTip(done);
      });
    });
    describe('#_updateTip', function() {
      it('will get raw block or the next block height', function(done) {
        var testNode = {
          getRawBlock: function(height, callback) {
            height.should.equal(1);
            callback(null, new Buffer(blockData[0], 'hex'));
          },
          network: 'testnet'
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
          getRawBlock: sinon.stub().callsArgWith(1, new Error('test')),
          network: 'testnet'
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
          },
          network: 'testnet'
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
          },
          network: 'testnet'
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
          },
          network: 'testnet'
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
        var testNode = {
          network: 'testnet'
        };
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
        var testNode = {
          network: 'testnet'
        };
        testNode.stopping = false;
        var wallet = new Wallet({node: testNode});
        wallet.walletData = {};
        wallet.walletData.height = 100;
        wallet.walletTxids = {};
        wallet.bitcoind = {
          height: 200
        };
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
        var testNode = {
          network: 'testnet'
        };
        testNode.stopping = false;
        var wallet = new Wallet({node: testNode});
        wallet.walletData = {};
        wallet.walletData.height = 100;
        wallet.walletTxids = {};
        wallet.bitcoind = {
          height: 200
        };
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
        var testNode = {
          network: 'testnet'
        };
        testNode.stopping = false;
        var wallet = new Wallet({node: testNode});
        wallet.walletData = {};
        wallet.walletData.height = 100;
        wallet.walletTxids = {};
        wallet.bitcoind = {
          height: 200
        };
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
    describe.skip('importing wallet keys', function() {
      describe('#_checkKeyImported', function() {
        it('it will continue if key is not found', function(done) {
          var wallet = new Wallet({node: node});
          wallet.db = {
            keys: {}
          };
          var key = {
            address: '16VZnHwRhwrExfeHFHGjwrgEMq8VcYPs9r'
          };
          var txn = {
            getBinary: sinon.stub().returns(false)
          };
          wallet._checkKeyImported(txn, key, done);
        });
        it('will give error if key already exists', function(done) {
          var wallet = new Wallet({node: node});
          wallet.db = {
            keys: {}
          };
          var key = {
            address: '16VZnHwRhwrExfeHFHGjwrgEMq8VcYPs9r'
          };
          var txn = {
            getBinary: sinon.stub().returns(true),
            abort: sinon.stub()
          };
          wallet._checkKeyImported(txn, key, function(err) {
            err.should.be.instanceOf(Error);
            err.message.should.equal('Key already imported');
            txn.abort.callCount.should.equal(1);
            done();
          });
        });
      });
      describe('#_addKeyToWallet', function() {
        it('will handle error from client query', function(done) {
          var node = {
            network: 'livenet'
          };
          var wallet = new Wallet({node: node});
          wallet.bitcoind = {
            client: {
              getAddressDeltas: sinon.stub().callsArgWith(1, {code: -1, message: 'test'})
            }
          };
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
            network: 'livenet'
          };
          var wallet = new Wallet({node: node});
          var txidsDbi = {};
          wallet.db = {
            txids: txidsDbi
          };
          wallet.bitcoind = {
            client: {
              getAddressDeltas: sinon.stub().callsArgWith(1, null, {
                result: deltas
              })
            }
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
          var txn = {
            putBinary: sinon.stub()
          };
          wallet._addKeyToWallet(txn, walletData, keyData, function(err) {
            var getAddressDeltas = wallet.bitcoind.client.getAddressDeltas;
            getAddressDeltas.callCount.should.equal(1);
            var query = getAddressDeltas.args[0][0];
            query.should.deep.equal({addresses: ['16VZnHwRhwrExfeHFHGjwrgEMq8VcYPs9r'], start: 1, end: 200});
            txn.putBinary.callCount.should.equal(1);
            txn.putBinary.args[0][0].should.equal(txidsDbi);
            txn.putBinary.args[0][1].should.equal('000000c60000000c');
            txn.putBinary.args[0][2].should.deep.equal(
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
          var walletDbi = {};
          var keysDbi = {};
          wallet.db = {
            wallet: walletDbi,
            keys: keysDbi,
            env: {
              sync: sinon.stub().callsArg(0)
            }
          };
          var walletData = {
            toBuffer: sinon.stub().returns(new Buffer('02', 'hex'))
          };
          var keyData = {
            getKey: sinon.stub().returns(new Buffer('03', 'hex')),
            getValue: sinon.stub().returns(new Buffer('04', 'hex'))
          };
          var txn = {
            putBinary: sinon.stub(),
            commit: sinon.stub()
          };
          wallet._commitWalletKey(txn, walletData, keyData, function(err) {
            if (err) {
              return done(err);
            }
            txn.commit.callCount.should.equal(1);

            txn.putBinary.callCount.should.equal(2);
            txn.putBinary.args[0][0].should.equal(walletDbi);
            txn.putBinary.args[0][1].should.equal('1000');
            txn.putBinary.args[0][2].should.deep.equal(new Buffer('02', 'hex'));

            txn.putBinary.args[1][0].should.equal(keysDbi);
            txn.putBinary.args[1][1].should.equal('03');
            txn.putBinary.args[1][2].should.deep.equal(new Buffer('04', 'hex'));
            done();
          });
        });
        it('will handle error from batch and leave wallet references unchanged', function(done) {
          var wallet = new Wallet({node: node});
          wallet.walletTxids = null;
          wallet.walletData = null;
          var walletDbi = {};
          var keysDbi = {};
          wallet.db = {
            wallet: walletDbi,
            keys: keysDbi,
            env: {
              sync: sinon.stub().callsArgWith(0, new Error('test'))
            }
          };
          var walletData = {
            toBuffer: sinon.stub()
          };
          var keyData = {
            getKey: sinon.stub().returns(new Buffer('03', 'hex')),
            getValue: sinon.stub()
          };
          var txn = {
            putBinary: sinon.stub(),
            commit: sinon.stub()
          };
          wallet._commitWalletKey(txn, walletData, keyData, function(err) {
            err.should.be.instanceOf(Error);
            err.message.should.equal('test');
            should.equal(wallet.walletData, null);
            done();
          });
        });
        it('will update wallet references with updated data', function(done) {
          var wallet = new Wallet({node: node});
          var walletDbi = {};
          var keysDbi = {};
          wallet.db = {
            wallet: walletDbi,
            keys: keysDbi,
            env: {
              sync: sinon.stub().callsArg(0)
            }
          };
          var walletData = {
            toBuffer: sinon.stub()
          };
          var keyData = {
            getKey: sinon.stub().returns(new Buffer('03', 'hex')),
            getValue: sinon.stub()
          };
          var txn = {
            putBinary: sinon.stub(),
            commit: sinon.stub()
          };
          wallet._commitWalletKey(txn, walletData, keyData, function(err) {
            if (err) {
              return done(err);
            }
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
          wallet.db = {
            env: {
              beginTxn: sinon.stub()
            }
          };
          wallet.walletData = {
            clone: sinon.stub()
          };
          wallet._checkKeyImported = function(txn, key, callback) {
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
          wallet.db = {
            env: {
              beginTxn: sinon.stub()
            }
          };
          wallet.walletData = {
            clone: sinon.stub()
          };
          wallet._checkKeyImported = function(txn, key, callback) {
            wallet.syncing.should.equal(true);
            callback();
          };
          wallet._addKeyToWallet = function(txn, walletData, keyData, callback) {
            wallet.syncing.should.equal(true);
            callback();
          };
          wallet._commitWalletKey = function(txn, walletData, keydata, callback) {
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
          wallet.db = {
            env: {
              beginTxn: sinon.stub()
            }
          };
          wallet.walletData = {
            clone: sinon.stub()
          };
          wallet._checkKeyImported = sinon.stub().callsArgWith(2, new Error('Key already imported'));
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
          var txn = {};
          wallet.db = {
            env: {
              beginTxn: sinon.stub().returns(txn)
            }
          };
          wallet.walletData = {
            clone: sinon.stub().returns(walletDataClone)
          };
          wallet._checkKeyImported = sinon.stub().callsArgWith(2);
          wallet._addKeyToWallet = sinon.stub().callsArgWith(3);
          wallet._commitWalletKey = sinon.stub().callsArgWith(3);
          wallet.importWalletKey({address: '16VZnHwRhwrExfeHFHGjwrgEMq8VcYPs9r'}, function(err) {
            wallet._addKeyToWallet.callCount.should.equal(1);
            wallet._addKeyToWallet.args[0][0].should.equal(txn);
            wallet._addKeyToWallet.args[0][1].should.equal(walletDataClone);
            wallet._commitWalletKey.callCount.should.equal(1);
            wallet._commitWalletKey.args[0][0].should.equal(txn);
            wallet._commitWalletKey.args[0][1].should.equal(walletDataClone);
            done();
          });
        });
        it('will give error from updating wallet and set syncing to false', function(done) {
          var wallet = new Wallet({node: node});
          wallet.db = {
            env: {
              beginTxn: sinon.stub()
            }
          };
          wallet.walletData = {
            clone: sinon.stub()
          };
          wallet._checkKeyImported = sinon.stub().callsArg(2);
          wallet._addKeyToWallet = sinon.stub().callsArgWith(3, new Error('test'));
          wallet.importWalletKey({address: '16VZnHwRhwrExfeHFHGjwrgEMq8VcYPs9r'}, function(err) {
            err.should.be.instanceOf(Error);
            done();
          });
        });
        it('will give error from commiting changes to wallet and set syncing to false', function(done) {
          var wallet = new Wallet({node: node});
          wallet.db = {
            env: {
              beginTxn: sinon.stub()
            }
          };
          wallet.walletData = {
            clone: sinon.stub()
          };
          wallet._checkKeyImported = sinon.stub().callsArg(2);
          wallet._addKeyToWallet = sinon.stub().callsArg(3);
          wallet._commitWalletKey = sinon.stub().callsArgWith(3, new Error('test'));
          wallet.importWalletKey({address: '16VZnHwRhwrExfeHFHGjwrgEMq8VcYPs9r'}, function(err) {
            err.should.be.instanceOf(Error);
            done();
          });
        });
      });
    });
    describe('#_checkTxidsQuery', function() {
      function testDefaultOptions(options, callback) {
        var wallet = new Wallet({node: node});
        wallet.bitcoind = {
          height: 100
        };
        wallet.walletTxids = {};
        wallet.walletTxids.getLatest = sinon.stub().returns([]);
        var query = wallet._checkTxidsQuery(options);
        query.limit.should.equal(10);
        query.height.should.equal(100);
        query.index.should.equal(0);
        callback();
      }
      it('will set default options', function(done) {
        testDefaultOptions(null, done);
      });
      it('will set default options if missing "height" and "index"', function(done) {
        testDefaultOptions({}, done);
      });
      it('will set default options if missing "height"', function(done) {
        testDefaultOptions({height: 100}, done);
      });
      it('will set default options if missing "index"', function(done) {
        testDefaultOptions({index: 0}, done);
      });
      it('will set "height" and "index" options', function(done) {
        var wallet = new Wallet({node: node});
        wallet.walletTxids = {};
        wallet.walletTxids.getLatest = sinon.stub().returns([]);
        var query = wallet._checkTxidsQuery({height: 3, index: 20});
        query.height.should.equal(3);
        query.index.should.equal(20);
        done();
      });
    });
    describe('#getWalletTxid', function() {
      it('will give error if options are invalid', function(done) {
        var wallet = new Wallet({node: node});
        var txn = {
          abort: sinon.stub()
        };
        wallet.db = {
          env: {
            beginTxn: sinon.stub().returns(txn)
          }
        };
        wallet._checkTxidsQuery = sinon.stub().throws(new Error('test'));
        wallet.getWalletTxids({}, function(err) {
          err.should.be.instanceOf(Error);
          txn.abort.callCount.should.equal(1);
          done();
        });
      });
      it.skip('will give buffers if option is set', function() {
      });
      it.skip('will give hex strings if option buffer is not set', function() {
      });
    });
    describe.skip('getting wallet transactions', function() {
      describe('#_validateStartAndEnd', function() {
        it('will throw error if start is not a number', function() {
        });
        it('will throw error if end is not a number ', function() {
        });
        it('will throw error if end is less than start', function() {
        });
        it('will throw error if the range exceeds the max', function() {
        });
      });
      describe('#_importTransaction', function() {
        it('will get detailed transaction from bitcoind and save to database', function() {
        });
        it('will handle error from bitcoind', function() {
        });
      });
      describe('#getWalletTransactions', function() {
        it('will set default start and end options', function() {
        });
        it('will validate start and end options', function() {
        });
        it('will map over txids and get wallet transactions', function() {
        });
        it('will map over txids and import transactions that are missing', function() {
        });
      });
    });
    describe('#getAPIMethods', function() {
      it('will return expected methods', function() {
        var wallet = new Wallet({node: node});
        wallet.getAPIMethods().length.should.equal(3);
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
