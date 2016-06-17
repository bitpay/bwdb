'use strict';

var chai = require('chai');
var should = chai.should();
var sinon = require('sinon');

var Wallet = require('../lib/index');

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
      });
    });
    describe('#_setupApplicationDirectory', function() {
      it('will make directory if the application directory does not exist', function() {
      });
      it('will give unhandled error while trying to access application directory', function() {
      });
      it('will continue if application directory already exists', function() {
      });
    });
    describe('#_getDatabasePath', function() {
      it('will give database path for livenet', function() {
      });
      it('will give database path for regtest', function() {
      });
      it('will give database path for testnet', function() {
      });
      it('will give error with unknown network', function() {
      });
    });
    describe('#_setupDatabase', function() {
      it('will open database from path', function() {
      });
    });
    describe('#_loadWalletData', function() {
      it('will create new wallet at current height if wallet not found', function() {
      });
      it('will give unhandled error for getting wallet data', function() {
      });
      it('will set the wallet reference to wallet data', function() {
      });
      it('will create new wallet txids if not found', function() {
      });
      it('will give unhandled error for getting wallet txids', function() {
      });
      it('will set the wallet refernce to wallet txids', function() {
      });
    });
    describe('#start', function() {
      it('will setup application directory, database and load wallet', function() {
      });
      it('will give error from loading database', function() {
      });
      it('will set the block handler for the wallet', function() {
      });
      it('will call sync', function() {
      });
      it('will register to call sync when there is a new bitcoin tip', function() {
      });
    });
  });
  describe('stopping service', function() {
    describe('#stop', function() {
      it('will call db close if defined', function() {
      });
      it('will continue if db is undefined', function() {
      });
    });
  });
  describe('syncing', function() {
    describe('#_connectBlockAddressDeltas', function() {
      it('will get database key for address', function() {
      });
      it('will skip if address does not exist', function() {
      });
      it('will give error during address database lookup', function() {
      });
      it('will insert txids into walletTxIds', function() {
      });
      it.skip('will update balance of walletData', function() {
      });
    });
    describe('#_connectBlockCommit', function() {
      it('will update walletData with block hash and height', function() {
      });
      it('will create two batch operations for walletTxids and walletData', function() {
      });
      it('will give error from batch', function() {
      });
      it('will batch ops to the database', function() {
      });
      it('will update wallet walletTxids and walletData references', function() {
      });
    });
    describe('#_connectBlock', function() {
      it('will get address deltas from block handler', function() {
      });
      it('will give error from connecting block address deltas', function() {
      });
      it('will commit block', function() {
      });
    });
    describe.skip('#_disconnectTip', function() {
      it('', function() {
      });
    });
    describe('#_isSynced', function() {
      it('will return true if wallet data height matches bitcoin height', function() {
      });
      it('will return false if wallet data height does not match bitcoin height', function() {
      });
    });
    describe('#_updateTip', function() {
      it('will get raw block or the next block height', function() {
      });
      it('will handle error from getting block', function() {
      });
      it('will set block height', function() {
      });
      it('will connect block if next block advances chain', function() {
      });
      it('will handle error while connecting block', function() {
      });
      it('will disconnect block if block does not advance chain', function() {
      });
      it('will handle error while disconnecting block', function() {
      });
    });
    describe('#sync', function() {
      it('will bail out if already syncing', function() {
      });
      it('will bail out if node is stopping', function() {
      });
      it('will bail out if walletData is not available', function() {
      });
      it('will bail out if walletTxids is not available', function() {
      });
      it('will set synced until finished', function() {
      });
      it('will bail out if node is stopping while syncing', function() {
      });
      it('will update tip until height matches', function() {
      });
      it('will emit synced when height matches', function() {
      });
      it('will bail out while stopping and finished syncing', function() {
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
          }
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
          }
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
          })
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
          })
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
          })
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
          }
          wallet.walletTxids = {
            clone: sinon.stub()
          }
          wallet._checkKeyImported = function(key, callback) {
            wallet.syncing.should.equal(true);
            callback(new Error('test'));
          }
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
              return callback(err);
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
          }
          wallet.walletTxids = {
            clone: sinon.stub().returns(walletTxidsClone)
          }
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
          }
          wallet.walletTxids = {
            clone: sinon.stub()
          }
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
          }
          wallet.walletTxids = {
            clone: sinon.stub()
          }
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
        wallet.getWalletTxids({}, function(err) {
          if (err) {
            return callback(err);
          }
          wallet.walletTxids.getLatest.callCount.should.equal(1);
          wallet.walletTxids.getLatest.args[0][0].should.equal(0);
          wallet.walletTxids.getLatest.args[0][1].should.equal(10);
          callback();
        });
      }
      it('will set default options if missing "from" and "to"', function(done) {
        testDefaultOptions({}, done);
      });
      it('will set default options if missing "from"', function(done) {
        testDefaultOptions({to: 100}, done);
      });
      it('will set default options if missing "to"', function(done) {
        testDefaultOptions({from: 100}, done);
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
