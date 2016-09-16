'use strict';

var net = require('net');
var EventEmitter = require('events').EventEmitter;

var chai = require('chai');
var should = chai.should();
var sinon = require('sinon');
var proxyquire = require('proxyquire');
var bitcore = require('bitcore-lib');
var lmdb = require('node-lmdb');
var _ = require('lodash');

var WebWorker = require('../lib/web-workers');
var db = require('../lib/db');
var messages = require('../lib/messages');
var utils = require('../lib/utils');
var models = require('../lib/models');
var validators = require('../lib/validators');
var version = require('../package.json').version;

var transactionData = require('./data/transactions.json');

var MAX_INT = Math.pow(2, 32) - 1;

describe('Wallet Web Worker', function() {
  var options = {
    network: 'testnet',
    bitcoinHeight: 200,
    bitcoinHash: 'f47dd62225a96d8306e9e3404efd7d35e3693c266db0c9ec5e1aaa88950dc41d',
    configPath: '/tmp/bwdb',
    clientsConfig: [{
      rpcport: 2000,
      rpcuser: 'user',
      rpcpassword: 'password'
    }],
    port: 20001,
    writerSocketPath: '/tmp/writer-1000.sock'
  };
  describe('@constructor', function() {
    it('will create a new instance', function() {
      var worker = new WebWorker(options);
      worker.port.should.equal(20001);
      worker.writerSocketPath.should.equal('/tmp/writer-1000.sock');
      worker.clientsConfig.should.deep.equal([{
        rpcport: 2000,
        rpcuser: 'user',
        rpcpassword: 'password'
      }]);
      worker.bitcoinHash.should.equal('f47dd62225a96d8306e9e3404efd7d35e3693c266db0c9ec5e1aaa88950dc41d');
      worker.bitcoinHeight.should.equal(200);
      worker.network.should.equal(bitcore.Networks.testnet);
      worker.config.network.should.equal(bitcore.Networks.testnet);
      worker.config.path.should.equal('/tmp/bwdb');
      worker._stopping.should.equal(false);
      worker.safeConfirmations.should.equal(12);
    });
    it('will set the safe confirmations setting', function() {
      var options2 = _.clone(options);
      options2.safeConfirmations = 32;
      var worker = new WebWorker(options2);
      worker.safeConfirmations.should.equal(32);
    });
  });
  describe('#start', function() {
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });
    it('it will call all start methods', function(done) {
      var worker = new WebWorker(options);
      sandbox.stub(db, 'open').returns({});
      worker.config.getDatabasePath = sinon.stub();
      worker._connectWriterSocket = sinon.stub().callsArg(0);
      worker._startListener = sinon.stub().callsArg(0);
      worker.start(done);
    });
    it('it will give error from start methods', function(done) {
      var worker = new WebWorker(options);
      sandbox.stub(db, 'open').returns({});
      worker.config.getDatabasePath = sinon.stub();
      worker._connectWriterSocket = sinon.stub().callsArg(0);
      worker._startListener = sinon.stub().callsArgWith(0, new Error('test'));
      worker.start(function(err) {
        should.exist(err);
        err.message.should.equal('test');
        done();
      });
    });
  });
  describe('#stop', function() {
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });
    it('it will close db if not stopping', function(done) {
      var worker = new WebWorker(options);
      sandbox.stub(db, 'close');
      worker.db = db;
      worker.stop(function(err) {
        if (err) {
          return done(err);
        }
        db.close.callCount.should.equal(1);
        done();
      });
    });
    it('it will not close db if db is undefined', function(done) {
      var worker = new WebWorker(options);
      sandbox.stub(db, 'close');
      worker.db = null;
      worker.stop(function(err) {
        if (err) {
          return done(err);
        }
        db.close.callCount.should.equal(0);
        done();
      });
    });
    it('it will not close db if already stopping', function(done) {
      var worker = new WebWorker(options);
      worker._stopping = true;
      sandbox.stub(db, 'close');
      worker.db = db;
      worker.stop(function(err) {
        if (err) {
          return done(err);
        }
        db.close.callCount.should.equal(0);
        done();
      });
    });
  });
  describe('#_connectWriterSocket', function() {
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });
    it('will run callback function associated with writer task', function(done) {
      var worker = new WebWorker(options);
      var socket = new EventEmitter();
      sandbox.stub(net, 'connect').callsArg(1).returns(socket);
      var msg = {
        id: 'cgtbe3t',
        error: null,
        result: {hello: 'world'}
      };
      sandbox.stub(messages, 'parser', function(callback) {
        return function() {
          callback(msg);
        };
      });
      worker._connectWriterSocket(function(err) {
        if (err) {
          return done(err);
        }
        worker._writerCallbacks.cgtbe3t = function(err, result) {
          if (err) {
            return done(err);
          }
          result.should.deep.equal({
            hello: 'world'
          });
          should.not.exist(worker._writerCallbacks.cgtbe3t);
          done();
        };
        socket.emit('data');
      });
    });
    it('will give error from writer task callback', function(done) {
      var worker = new WebWorker(options);
      var socket = new EventEmitter();
      sandbox.stub(net, 'connect').callsArg(1).returns(socket);
      var msg = {
        id: 'cgtbe3t',
        error: {message: 'test'},
        result: {}
      };
      sandbox.stub(messages, 'parser', function(callback) {
        return function() {
          callback(msg);
        };
      });
      worker._connectWriterSocket(function(err) {
        if (err) {
          return done(err);
        }
        worker._writerCallbacks.cgtbe3t = function(err) {
          should.exist(err);
          err.message.should.equal('test');
          done();
        };
        socket.emit('data');
      });
    });
  });
  describe('#_queueWriterTask', function() {
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });
    it('will log error from socket write', function() {
      var worker = new WebWorker(options);
      sandbox.stub(utils, 'getTaskId').returns('ac12meo');
      sandbox.stub(messages, 'encodeWriterMessage').returns('message');
      sandbox.stub(console, 'error');
      worker._writerSocket = {
        write: sinon.stub().callsArgWith(2, new Error('test'))
      };
      worker._queueWriterTask('foo', ['baz'], 10, sinon.stub());
      should.not.exist(worker._writerCallbacks.ac12meo);
      messages.encodeWriterMessage.callCount.should.equal(1);
      worker._writerSocket.write.callCount.should.equal(1);
      console.error.callCount.should.equal(1);
    });
    it('will write to socket with write task message', function() {
      var worker = new WebWorker(options);
      sandbox.stub(utils, 'getTaskId').returns('ac12meo');
      sandbox.stub(messages, 'encodeWriterMessage').returns('message');
      worker._writerSocket = {
        write: sinon.stub().callsArgWith(2, null)
      };
      worker._queueWriterTask('foo', ['baz'], 10, sinon.stub());
      worker._writerCallbacks.ac12meo.should.be.a('function');
      messages.encodeWriterMessage.callCount.should.equal(1);
      messages.encodeWriterMessage.args[0][0].should.equal('ac12meo');
      messages.encodeWriterMessage.args[0][1].should.equal('foo');
      messages.encodeWriterMessage.args[0][2].should.deep.equal(['baz']);
      messages.encodeWriterMessage.args[0][3].should.equal(10);
      worker._writerSocket.write.callCount.should.equal(1);
      worker._writerSocket.write.args[0][0].should.equal('message');
      worker._writerSocket.write.args[0][1].should.equal('utf8');
    });
  });
  describe('#_transformRawTransaction', function() {
    var walletId = 'bc3914647cfbfffb7b5f431d3d231e05c01c70ac72e47d992b885d596b87ead0';
    var txn = {
      getBinary: function(dbi, key) {
        if (key === walletId + '01' + 'd459616bfac2fb02b3150dd83c8be25e7be5358a') {
          return new Buffer(new Array(0));
        }
        return false;
      }
    };
    var wallet = {
      addressFilter: {
        contains: function(hash) {
          if (hash.toString('hex') === 'd459616bfac2fb02b3150dd83c8be25e7be5358a') {
            return true;
          }
          // false positive
          if (hash.toString('hex') === '8903f021e71cf3383bc595fb9af482746f50b069') {
            return true;
          }
          return false;
        }
      }
    };
    var blockIndex = 100;
    transactionData.forEach(function(item, n) {
      it('transform: ' + item.comment + ' (' + n + ')', function() {
        var worker = new WebWorker(options);
        worker.db = {
          addresses: {}
        };
        var transformed = worker._transformRawTransaction(txn, wallet, walletId, blockIndex, item.raw);
        transformed.should.deep.equal(item.expected);
      });
    });
  });
  describe('#_importTransaction', function() {
    var walletId = 'bc3914647cfbfffb7b5f431d3d231e05c01c70ac72e47d992b885d596b87ead0';
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });
    it('will handle error from bitcoind', function(done) {
      var worker = new WebWorker(options);
      var txn = {};
      var wallet = {};
      var txidInfo = [400, 12, 'txid'];
      sandbox.stub(worker._clients[0], 'getRawTransaction').callsArgWith(2, new Error('test'));
      worker._importTransaction(txn, wallet, walletId, txidInfo, function(err) {
        err.should.be.instanceOf(Error);
        err.message.should.equal('test');
        done();
      });
    });
    it('queue a write task to save the transaction if above safe confirmations', function(done) {
      var worker = new WebWorker(options);
      var txn = {};
      var wallet = {};
      var txidInfo = [400, 12, 'txid'];
      var response = {
        result: {
          confirmations: 100
        }
      };
      sandbox.stub(worker._clients[0], 'getRawTransaction').callsArgWith(2, null, response);
      worker._transformRawTransaction = sinon.stub().returns('transaction');
      worker._queueWriterTask = sinon.stub().callsArgWith(3, null);
      worker._importTransaction(txn, wallet, walletId, txidInfo, function(err, transaction) {
        worker._clients[0].getRawTransaction.callCount.should.equal(1);
        worker._queueWriterTask.callCount.should.equal(1);
        worker._queueWriterTask.args[0][0].should.equal('saveTransaction');
        worker._queueWriterTask.args[0][1].should.deep.equal([walletId, 'transaction']);
        worker._queueWriterTask.args[0][2].should.equal(1);
        transaction.should.equal('transaction');
        done();
      });
    });
    it('will give error from writer', function(done) {
      var worker = new WebWorker(options);
      var txn = {};
      var wallet = {};
      var txidInfo = [400, 12, 'txid'];
      var response = {
        result: {
          confirmations: 100
        }
      };
      sandbox.stub(worker._clients[0], 'getRawTransaction').callsArgWith(2, null, response);
      worker._transformRawTransaction = sinon.stub().returns('transaction');
      worker._queueWriterTask = sinon.stub().callsArgWith(3, new Error('test'));
      worker._importTransaction(txn, wallet, walletId, txidInfo, function(err) {
        err.should.be.instanceOf(Error);
        err.message.should.equal('test');
        done();
      });
    });
    it('will give back transaction directly if below safe confirmations', function(done) {
      var worker = new WebWorker(options);
      var txn = {};
      var wallet = {};
      var txidInfo = [400, 12, 'txid'];
      var response = {
        result: {
          confirmations: 1
        }
      };
      sandbox.stub(worker._clients[0], 'getRawTransaction').callsArgWith(2, null, response);
      worker._transformRawTransaction = sinon.stub().returns('transaction');
      worker._queueWriterTask = sinon.stub().callsArgWith(3, null);
      worker._importTransaction(txn, wallet, walletId, txidInfo, function(err, transaction) {
        worker._clients[0].getRawTransaction.callCount.should.equal(1);
        worker._queueWriterTask.callCount.should.equal(0);
        transaction.should.equal('transaction');
        done();
      });
    });
  });
  describe('#getWalletTransactions', function() {
    var walletId = 'bc3914647cfbfffb7b5f431d3d231e05c01c70ac72e47d992b885d596b87ead0';
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });
    it('will give 404 error if wallet not found', function(done) {
      var worker = new WebWorker(options);
      var txn = {
        getBinary: sinon.stub().returns(null),
        abort: sinon.stub()
      };
      worker.db = {
        env: {
          beginTxn: sinon.stub().returns(txn)
        }
      };
      worker._getLatestTxids = sinon.stub().callsArgWith(3, new Error('test'));
      var opts = {};
      worker.getWalletTransactions(walletId, opts, function(err) {
        err.should.be.instanceOf(Error);
        err.statusCode.should.equal(404);
        txn.abort.callCount.should.equal(1);
        done();
      });
    });
    it('will handle error from get latest txids', function(done) {
      var worker = new WebWorker(options);
      var txn = {
        getBinary: sinon.stub().returns(new Buffer([])),
        abort: sinon.stub()
      };
      worker.db = {
        env: {
          beginTxn: sinon.stub().returns(txn)
        }
      };
      sandbox.stub(models.Wallet, 'fromBuffer').returns({});
      worker._getLatestTxids = sinon.stub().callsArgWith(3, new Error('test'));
      var opts = {};
      worker.getWalletTransactions(walletId, opts, function(err) {
        err.should.be.instanceOf(Error);
        err.message.should.equal('test');
        txn.abort.callCount.should.equal(1);
        done();
      });
    });
    it('will map over txids and get wallet transactions from db', function(done) {
      var worker = new WebWorker(options);
      var getBinary = sinon.stub().returns(new Buffer([]));
      var txn = {
        getBinary: getBinary,
        abort: sinon.stub()
      };
      worker.db = {
        env: {
          beginTxn: sinon.stub().returns(txn)
        }
      };
      sandbox.stub(models.Wallet, 'fromBuffer').returns({});
      sandbox.stub(models.WalletTransaction, 'getKey').returns({toString: sinon.stub().returns('key')});
      sandbox.stub(models.WalletTransaction, 'fromBuffer').returns({value: 'transaction'});
      var result = {
        txids: [
          [400, 0, 'txid'],
          [402, 12, 'txid']
        ],
        start: {
          height: 400,
          index: 12
        },
        end: {
          height: 400,
          index: 14
        }
      };
      worker._importTransaction = sinon.stub();
      worker._getLatestTxids = sinon.stub().callsArgWith(3, null, result);
      var opts = {
        height: 400,
        index: 12
      };
      worker.getWalletTransactions(walletId, opts, function(err, result) {
        if (err) {
          return done(err);
        }
        worker._importTransaction.callCount.should.equal(0);
        should.exist(result);
        result.transactions.length.should.equal(2);
        result.transactions[0].should.equal('transaction');
        result.transactions[1].should.equal('transaction');
        getBinary.callCount.should.equal(3);
        models.WalletTransaction.getKey.callCount.should.equal(2);
        models.WalletTransaction.getKey.args[0][0].should.equal(walletId);
        models.WalletTransaction.getKey.args[0][1].should.equal('txid');
        models.WalletTransaction.fromBuffer.callCount.should.equal(2);
        models.WalletTransaction.fromBuffer.args[0][0].should.equal(walletId);
        models.WalletTransaction.fromBuffer.args[0][1].should.deep.equal(new Buffer(new Array(0)));
        result.start.height.should.equal(400);
        result.start.index.should.equal(12);
        result.end.height.should.equal(400);
        result.end.index.should.equal(14);
        txn.abort.callCount.should.equal(1);
        done();
      });
    });
    it('get error from importing a transaction', function(done) {
      var worker = new WebWorker(options);
      var getBinary = sinon.stub().returns(null);
      getBinary.onFirstCall().returns(new Buffer(new Array(0)));
      var txn = {
        getBinary: getBinary,
        abort: sinon.stub()
      };
      worker.db = {
        env: {
          beginTxn: sinon.stub().returns(txn)
        }
      };
      sandbox.stub(models.Wallet, 'fromBuffer').returns({});
      sandbox.stub(models.WalletTransaction, 'getKey').returns({toString: sinon.stub().returns('key')});
      sandbox.stub(models.WalletTransaction, 'fromBuffer');
      var result = {
        txids: [
          [400, 0, 'txid'],
          [402, 12, 'txid']
        ],
        start: {
          height: 400,
          index: 12
        },
        end: {
          height: 400,
          index: 14
        }
      };
      worker._importTransaction = sinon.stub().callsArgWith(4, new Error('test'));
      worker._getLatestTxids = sinon.stub().callsArgWith(3, null, result);
      var opts = {
        height: 400,
        index: 12
      };
      worker.getWalletTransactions(walletId, opts, function(err) {
        err.should.be.instanceOf(Error);
        err.message.should.equal('test');
        txn.abort.callCount.should.equal(1);
        done();
      });
    });
    it('will import transactions from bitcoind if not in db', function(done) {
      var worker = new WebWorker(options);
      var getBinary = sinon.stub().returns(null);
      getBinary.onFirstCall().returns(new Buffer(new Array(0)));
      var txn = {
        getBinary: getBinary,
        abort: sinon.stub()
      };
      worker.db = {
        env: {
          beginTxn: sinon.stub().returns(txn)
        }
      };
      var wallet = {};
      sandbox.stub(models.Wallet, 'fromBuffer').returns(wallet);
      sandbox.stub(models.WalletTransaction, 'getKey').returns({toString: sinon.stub().returns('key')});
      sandbox.stub(models.WalletTransaction, 'fromBuffer');
      var latestTxids = {
        txids: [
          [400, 0, 'txid'],
          [402, 12, 'txid']
        ],
        start: {
          height: 400,
          index: 12
        },
        end: {
          height: 400,
          index: 14
        }
      };
      worker._importTransaction = sinon.stub().callsArgWith(4, null, 'transaction');
      worker._getLatestTxids = sinon.stub().callsArgWith(3, null, latestTxids);
      var opts = {
        height: 400,
        index: 12
      };
      worker.getWalletTransactions(walletId, opts, function(err, result) {
        if (err) {
          return done(err);
        }
        worker._importTransaction.callCount.should.equal(2);
        worker._importTransaction.args[0][0].should.equal(txn);
        worker._importTransaction.args[0][1].should.equal(wallet);
        worker._importTransaction.args[0][2].should.equal(walletId);
        worker._importTransaction.args[0][3].should.deep.equal(latestTxids.txids[0]);
        worker._importTransaction.args[1][0].should.equal(txn);
        worker._importTransaction.args[1][1].should.equal(wallet);
        worker._importTransaction.args[1][2].should.equal(walletId);
        worker._importTransaction.args[1][3].should.deep.equal(latestTxids.txids[1]);
        models.WalletTransaction.getKey.callCount.should.equal(2);
        models.WalletTransaction.fromBuffer.callCount.should.equal(0);
        result.transactions.length.should.equal(2);
        result.transactions[0].should.equal('transaction');
        result.transactions[1].should.equal('transaction');
        txn.abort.callCount.should.equal(1);
        done();
      });
    });
  });
  describe('#_getLatestTxids', function() {
    var walletId = 'bc3914647cfbfffb7b5f431d3d231e05c01c70ac72e47d992b885d596b87ead0';
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });
    it('will end at the correct endpoint', function(done) {
      sandbox.stub(utils, 'isRangeLessThan').returns(true);
      sandbox.stub(models.WalletTxid, 'parseKey').returns({height: 399999, index: 0});
      var cursor = {
        goToKey: sinon.stub(),
        goToPrev: sinon.stub(),
        close: sinon.stub(),
        getCurrentBinary: sinon.stub().callsArgWith(0, 'key', 'value')
      };
      var WebWorkerStubbed = proxyquire('../lib/web-workers', {
        'node-lmdb': {
          Cursor: sinon.stub().returns(cursor)
        }
      });
      var worker = new WebWorkerStubbed(options);
      worker.db = {};
      worker._getLatestTxids({}, walletId, {
        height: 401000,
        index: MAX_INT,
        end: {
          height: 400000,
          index: 18
        }
      }, function(err, data) {
        if (err) {
          return done(err);
        }
        data.txids.should.deep.equal([]);
        data.start.should.deep.equal({height: 401000, index: MAX_INT});
        done();
      });
    });
    it('will give error from validator', function(done) {
      var worker = new WebWorker(options);
      var txn = {};
      var opts = {};
      sandbox.stub(validators, 'sanitizeRangeOptions').throws(new Error('test'));
      worker._getLatestTxids(txn, walletId, opts, function(err) {
        err.should.be.instanceOf(Error);
        err.message.should.equal('test');
        done();
      });
    });
    it('will return empty array if no txids found', function(done) {
      var worker = new WebWorker(options);
      worker.db = {
        txids: {}
      };
      var cursor = {
        goToKey: sinon.stub().returns(null),
        goToPrev: sinon.stub().returns(null),
        close: sinon.stub()
      };
      sandbox.stub(lmdb, 'Cursor').returns(cursor);
      var opts = {height: 400, index: 20};
      var txn = {};
      worker._getLatestTxids(txn, walletId, opts, function(err, result) {
        if (err) {
          return done(err);
        }
        result.txids.should.deep.equal([]);
        result.start.height.should.equal(400);
        result.start.index.should.equal(20);
        cursor.close.callCount.should.equal(1);
        done();
      });
    });
    it('will iterate until limit is reached', function(done) {
      var worker = new WebWorker(options);
      worker.db = {
        txids: {}
      };
      var key = 'key';
      var value = 'value';
      var cursor = {
        goToKey: sinon.stub().returns(new Buffer(new Array(0))),
        goToPrev: sinon.stub().returns(new Buffer(new Array(0))),
        getCurrentBinary: sinon.stub().callsArgWith(0, key, value),
        close: sinon.stub()
      };
      var height = 400;
      var index = 0;
      sandbox.stub(models.WalletTxid, 'parseKey', function() {
        var result = {
          height: height,
          index: index
        };
        index++;
        return result;
      });
      sandbox.stub(lmdb, 'Cursor').returns(cursor);
      var opts = {
        height: 400,
        index: 0
      };
      var txn = {};
      worker._getLatestTxids(txn, walletId, opts, function(err, result) {
        if (err) {
          return done(err);
        }
        result.txids.should.deep.equal([
          [400, 0, 'value'],
          [400, 1, 'value'],
          [400, 2, 'value'],
          [400, 3, 'value'],
          [400, 4, 'value'],
          [400, 5, 'value'],
          [400, 6, 'value'],
          [400, 7, 'value'],
          [400, 8, 'value'],
          [400, 9, 'value']
        ]);
        result.start.height.should.equal(400);
        result.start.index.should.equal(MAX_INT);
        result.end.height.should.equal(400);
        result.end.index.should.equal(8);
        cursor.close.callCount.should.equal(1);
        done();
      });
    });
    it('will iterate and stop before limit is reached', function(done) {
      var worker = new WebWorker(options);
      worker.db = {
        txids: {}
      };
      var key = 'key';
      var value = 'value';
      var c = 0;
      var cursor = {
        goToKey: sinon.stub().returns(new Buffer(new Array(0))),
        goToPrev: function() {
          var result = null;
          if (c < 6) {
            result = new Buffer(new Array(0));
          }
          c++;
          return result;
        },
        getCurrentBinary: sinon.stub().callsArgWith(0, key, value),
        close: sinon.stub()
      };
      var height = 400;
      var index = 0;
      sandbox.stub(models.WalletTxid, 'parseKey', function() {
        var result = {
          height: height,
          index: index
        };
        index++;
        return result;
      });
      sandbox.stub(lmdb, 'Cursor').returns(cursor);
      var opts = {
        height: 400,
        index: 0
      };
      var txn = {};
      worker._getLatestTxids(txn, walletId, opts, function(err, result) {
        if (err) {
          return done(err);
        }
        result.txids.should.deep.equal([
          [400, 0, 'value'],
          [400, 1, 'value'],
          [400, 2, 'value'],
          [400, 3, 'value'],
          [400, 4, 'value'],
          [400, 5, 'value'],
          [400, 6, 'value']
        ]);
        result.start.height.should.equal(400);
        result.start.index.should.equal(MAX_INT);
        should.not.exist(result.end);
        cursor.close.callCount.should.equal(1);
        done();
      });
    });
  });
  describe('#getBalance', function() {
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });
    var walletId = 'bc3914647cfbfffb7b5f431d3d231e05c01c70ac72e47d992b885d596b87ead0';
    it('will get 404 if wallet not found', function(done) {
      var worker = new WebWorker(options);
      var getBinary = sinon.stub().returns(null);
      var abort = sinon.stub();
      var beginTxn = sinon.stub().returns({getBinary: getBinary, abort: abort});
      worker.db = {
        env: {
          beginTxn: beginTxn
        }
      };
      worker.getBalance(walletId, function(err) {
        err.should.be.instanceOf(Error);
        err.statusCode.should.equal(404);
        err.message.should.equal('Wallet not found');
        done();
      });
    });
    it('will get balance if wallet found', function(done) {
      var worker = new WebWorker(options);
      var getBinary = sinon.stub().returns(new Buffer(new Array(0)));
      var abort = sinon.stub();
      sandbox.stub(models.Wallet, 'fromBuffer').returns({balance: 10000});
      var beginTxn = sinon.stub().returns({getBinary: getBinary, abort: abort});
      worker.db = {
        env: {
          beginTxn: beginTxn
        }
      };
      worker.getBalance(walletId, function(err, balance) {
        if (err) {
          return done(err);
        }
        balance.should.deep.equal({balance: 10000});
        done();
      });
    });
  });
  describe('#getWalletTxids', function() {
    var walletId = 'bc3914647cfbfffb7b5f431d3d231e05c01c70ac72e47d992b885d596b87ead0';
    it('will give error if options are invalid', function(done) {
      var worker = new WebWorker(options);
      var txn = {
        abort: sinon.stub()
      };
      worker.db = {
        env: {
          beginTxn: sinon.stub().returns(txn)
        }
      };
      worker._getLatestTxids = sinon.stub().callsArgWith(3, new Error('test'));
      worker.getWalletTxids(walletId, {}, function(err) {
        err.should.be.instanceOf(Error);
        txn.abort.callCount.should.equal(1);
        done();
      });
    });
    it('will give hex strings for txids', function(done) {
      var worker = new WebWorker(options);
      var txn = {
        abort: sinon.stub()
      };
      worker.db = {
        env: {
          beginTxn: sinon.stub().returns(txn)
        }
      };
      var result = {
        txids: [
          [400, 1, new Buffer('62876740bd494e980b87304f74801b269fea7e7f9835fa22868e909c6da368f1', 'hex')],
          [400, 2, new Buffer('dd947d1ffb5dee014f4281fecf7680450c289d02bc8fb883d4f6e9071cc1b6d2', 'hex')]
        ]
      };
      worker._getLatestTxids = sinon.stub().callsArgWith(3, null, result);
      worker.getWalletTxids(walletId, {}, function(err, res) {
        res.txids.should.deep.equal([
          '62876740bd494e980b87304f74801b269fea7e7f9835fa22868e909c6da368f1',
          'dd947d1ffb5dee014f4281fecf7680450c289d02bc8fb883d4f6e9071cc1b6d2'
        ]);
        txn.abort.callCount.should.equal(1);
        done();
      });
    });
  });
  describe('#_updateLatestTip', function() {
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });
    it('will update with the latest bitcoin height and hash', function() {
      var worker = new WebWorker(options);
      worker.db = {};
      worker.db.env = {};
      var txn = {
        abort: sinon.stub()
      };
      worker.db.env.beginTxn = sinon.stub().returns(txn);
      var key = 'key';
      var value = 'value';
      var getCurrentBinary = sinon.stub().callsArgWith(0, key, value);
      var close = sinon.stub();
      var buffer = new Buffer(new Array(0));
      var goToLast = sinon.stub().returns(buffer);
      sandbox.stub(lmdb, 'Cursor').returns({
        getCurrentBinary: getCurrentBinary,
        close: close,
        goToLast: goToLast
      });
      sandbox.stub(models.WalletBlock, 'fromBuffer').returns({
        height: 1000,
        blockHash: new Buffer('000000000b6c620d5f6b4f944982553875a53f8289a72a37fc48f9ed89d931d3', 'hex')
      });
      worker._updateLatestTip();
      goToLast.callCount.should.equal(1);
      getCurrentBinary.callCount.should.equal(1);
      models.WalletBlock.fromBuffer.callCount.should.equal(1);
      models.WalletBlock.fromBuffer.args[0][0].should.equal(key);
      models.WalletBlock.fromBuffer.args[0][1].should.equal(value);
      close.callCount.should.equal(1);
      txn.abort.callCount.should.equal(1);
    });
    it('will log error if there is not a tip', function() {
      var worker = new WebWorker(options);
      worker.db = {};
      worker.db.env = {};
      var txn = {
        abort: sinon.stub()
      };
      worker.db.env.beginTxn = sinon.stub().returns(txn);
      var close = sinon.stub();
      var goToLast = sinon.stub().returns(null);
      sandbox.stub(lmdb, 'Cursor').returns({
        close: close,
        goToLast: goToLast
      });
      sandbox.stub(console, 'error');
      worker._updateLatestTip();
      goToLast.callCount.should.equal(1);
      close.callCount.should.equal(1);
      txn.abort.callCount.should.equal(1);
      console.error.callCount.should.equal(1);
    });
  });
  describe('#_endpointBalance', function() {
    var walletId = 'bc3914647cfbfffb7b5f431d3d231e05c01c70ac72e47d992b885d596b87ead0';
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });
    it('will set status to 200 with balance', function() {
      var worker = new WebWorker(options);
      var balance = 100;
      worker.getBalance = sinon.stub().callsArgWith(1, null, {balance: balance});
      var endpoint = worker._endpointBalance();
      var req = {
        walletId: walletId
      };
      var jsonp = sinon.stub();
      var status = sinon.stub().returns({jsonp: jsonp});
      var res = {
        status: status
      };
      endpoint(req, res);
      worker.getBalance.callCount.should.equal(1);
      worker.getBalance.args[0][0].should.equal(walletId);
      status.callCount.should.equal(1);
      status.args[0][0].should.equal(200);
      jsonp.callCount.should.equal(1);
      jsonp.args[0][0].should.deep.equal({balance: balance});
    });
    it('will call sendError if error', function() {
      var worker = new WebWorker(options);
      var error = new Error();
      worker.getBalance = sinon.stub().callsArgWith(1, error);
      var endpoint = worker._endpointBalance();
      sandbox.stub(utils, 'sendError');
      var req = {
        walletId: walletId
      };
      var res = {};
      endpoint(req, res);
      utils.sendError.callCount.should.equal(1);
      utils.sendError.args[0][0].should.equal(error);
      utils.sendError.args[0][1].should.equal(res);
    });
  });
  describe('#_endpointTxids', function() {
    var walletId = 'bc3914647cfbfffb7b5f431d3d231e05c01c70ac72e47d992b885d596b87ead0';
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });
    it('will set status to 200 with txids', function() {
      var worker = new WebWorker(options);
      var txids = ['bb2e69ae9e69eac72c3d38ef44ba12553d79f3859493fd7bdd66030acee8fb9a'];
      worker.getWalletTxids = sinon.stub().callsArgWith(2, null, txids);
      var endpoint = worker._endpointTxids();
      var req = {
        walletId: walletId,
        range: 100
      };
      var jsonp = sinon.stub();
      var status = sinon.stub().returns({jsonp: jsonp});
      var res = {
        status: status
      };
      endpoint(req, res);
      status.callCount.should.equal(1);
      status.args[0][0].should.equal(200);
      jsonp.callCount.should.equal(1);
      jsonp.args[0][0].should.equal(txids);
    });
    it('will call sendError if error', function() {
      var worker = new WebWorker(options);
      var error = new Error('test');
      worker.getWalletTxids = sinon.stub().callsArgWith(2, error);
      sandbox.stub(utils, 'sendError');
      var endpoint = worker._endpointTxids();
      var req = {
        walletId: walletId,
        range: 100
      };
      var res = {};
      endpoint(req, res);
      utils.sendError.callCount.should.equal(1);
      utils.sendError.args[0][0].should.equal(error);
      utils.sendError.args[0][1].should.equal(res);
    });
  });
  describe('#_endpointTransactions', function() {
    var walletId = 'bc3914647cfbfffb7b5f431d3d231e05c01c70ac72e47d992b885d596b87ead0';
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });
    it('will set status to 200 with txs', function() {
      var worker = new WebWorker(options);
      var txs = [{
        hello: 'world'
      }];
      worker.getWalletTransactions = sinon.stub().callsArgWith(2, null, txs);
      var endpoint = worker._endpointTransactions();
      var req = {
        walletId: walletId,
        range: 100
      };
      var jsonp = sinon.stub();
      var status = sinon.stub().returns({jsonp: jsonp});
      var res = {
        status: status
      };
      endpoint(req, res);
      worker.getWalletTransactions.callCount.should.equal(1);
      worker.getWalletTransactions.args[0][0].should.equal(walletId);
      worker.getWalletTransactions.args[0][1].should.equal(100);
      status.callCount.should.equal(1);
      status.args[0][0].should.equal(200);
      jsonp.callCount.should.equal(1);
      jsonp.args[0][0].should.deep.equal([{
        hello: 'world'
      }]);
    });
    it('will call sendError if error', function() {
      var worker = new WebWorker(options);
      var error = new Error('test');
      worker.getWalletTransactions = sinon.stub().callsArgWith(2, error);
      sandbox.stub(utils, 'sendError');
      var endpoint = worker._endpointTransactions();
      var req = {
        walletId: walletId,
        range: 100
      };
      var end = sinon.stub();
      var status = sinon.stub().returns({end: end});
      var res = {
        status: status
      };
      endpoint(req, res);
      utils.sendError.callCount.should.equal(1);
      utils.sendError.args[0][0].should.equal(error);
      utils.sendError.args[0][1].should.equal(res);
    });
  });
  describe('#_endpointUTXOs', function() {
    var walletId = 'bc3914647cfbfffb7b5f431d3d231e05c01c70ac72e47d992b885d596b87ead0';
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });
    it('will set status to 200 with utxos', function() {
      var worker = new WebWorker(options);
      var utxos = [];
      worker.getWalletUTXOs = sinon.stub().callsArgWith(2, null, utxos);
      var endpoint = worker._endpointUTXOs();
      var req = {
        walletId: walletId
      };
      var jsonp = sinon.stub();
      var status = sinon.stub().returns({jsonp: jsonp});
      var res = {
        status: status
      };
      endpoint(req, res);
      status.callCount.should.equal(1);
      status.args[0][0].should.equal(200);
      jsonp.callCount.should.equal(1);
      jsonp.args[0][0].should.equal(utxos);
    });
    it('will call sendError if error', function() {
      var worker = new WebWorker(options);
      var error = new Error();
      worker.getWalletUTXOs = sinon.stub().callsArgWith(2, error);
      sandbox.stub(utils, 'sendError');
      var endpoint = worker._endpointUTXOs();
      var req = {};
      var res = {};
      endpoint(req, res);
      utils.sendError.callCount.should.equal(1);
      utils.sendError.args[0][0].should.equal(error);
      utils.sendError.args[0][1].should.equal(res);
    });
  });
  describe('#_endpointPutAddress', function() {
    var walletId = 'bc3914647cfbfffb7b5f431d3d231e05c01c70ac72e47d992b885d596b87ead0';
    var address = '12c6DSiU4Rq3P4ZxziKxzrL5LmMBrzjrJX';
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });
    function checkWriterArgs(fn) {
      fn.args[0][0].should.equal('importWalletAddresses');
      fn.args[0][1].should.deep.equal([walletId, [address]]);
      fn.args[0][2].should.equal(5);
    }
    it('will set status to 201 if new address created', function() {
      var worker = new WebWorker(options);
      var newAddresses = [address];
      worker._queueWriterTask = sinon.stub().callsArgWith(3, null, newAddresses);
      var endpoint = worker._endpointPutAddress();
      var req = {
        walletId: walletId,
        address: address
      };
      var jsonp = sinon.stub();
      var status = sinon.stub().returns({
        jsonp: jsonp
      });
      var res = {
        status: status
      };
      endpoint(req, res);
      checkWriterArgs(worker._queueWriterTask);
      status.callCount.should.equal(1);
      status.args[0][0].should.equal(201);
      jsonp.callCount.should.equal(1);
      jsonp.args[0][0].should.deep.equal({
        address: address
      });
    });
    it('will set status to 200 without new address (empty array)', function() {
      var worker = new WebWorker(options);
      var newAddresses = [];
      worker._queueWriterTask = sinon.stub().callsArgWith(3, null, newAddresses);
      var endpoint = worker._endpointPutAddress();
      var req = {
        walletId: walletId,
        address: address
      };
      var jsonp = sinon.stub();
      var status = sinon.stub().returns({
        jsonp: jsonp
      });
      var res = {
        status: status
      };
      endpoint(req, res);
      checkWriterArgs(worker._queueWriterTask);
      status.callCount.should.equal(1);
      status.args[0][0].should.equal(200);
      jsonp.callCount.should.equal(1);
      jsonp.args[0][0].should.deep.equal({
        address: address
      });
    });
    it('will set status to 200 without new address (undefined)', function() {
      var worker = new WebWorker(options);
      worker._queueWriterTask = sinon.stub().callsArgWith(3, null, undefined);
      var endpoint = worker._endpointPutAddress();
      var req = {
        walletId: walletId,
        address: address
      };
      var jsonp = sinon.stub();
      var status = sinon.stub().returns({
        jsonp: jsonp
      });
      var res = {
        status: status
      };
      endpoint(req, res);
      checkWriterArgs(worker._queueWriterTask);
      status.callCount.should.equal(1);
      status.args[0][0].should.equal(200);
      jsonp.callCount.should.equal(1);
      jsonp.args[0][0].should.deep.equal({
        address: address
      });
    });
    it('will call sendError if error', function() {
      var worker = new WebWorker(options);
      var error = new Error('test');
      sandbox.stub(utils, 'sendError');
      worker._queueWriterTask = sinon.stub().callsArgWith(3, error);
      var endpoint = worker._endpointPutAddress();
      var req = {
        walletId: walletId,
        address: address
      };
      var res = {};
      endpoint(req, res);
      checkWriterArgs(worker._queueWriterTask);
      utils.sendError.callCount.should.equal(1);
      utils.sendError.args[0][0].should.equal(error);
      utils.sendError.args[0][1].should.equal(res);
    });
  });
  describe('#_endpointPostAddresses', function() {
    var walletId = 'bc3914647cfbfffb7b5f431d3d231e05c01c70ac72e47d992b885d596b87ead0';
    var addresses = [
      '12c6DSiU4Rq3P4ZxziKxzrL5LmMBrzjrJX',
      '1HLoD9E4SDFFPDiYfNYnkBLQ85Y51J3Zb1'
    ];
    function checkWriterArgs(fn) {
      fn.callCount.should.equal(1);
      fn.args[0][0].should.equal('importWalletAddresses');
      fn.args[0][1].should.deep.equal([walletId, addresses]);
      fn.args[0][2].should.equal(10);
    }
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });
    it('will set status to 201 if new addresses, and return new addresses', function() {
      var worker = new WebWorker(options);
      var newAddresses = [
        '12c6DSiU4Rq3P4ZxziKxzrL5LmMBrzjrJX'
      ];
      worker._queueWriterTask = sinon.stub().callsArgWith(3, null, newAddresses);
      var endpoint = worker._endpointPostAddresses();
      var req = {
        walletId: walletId,
        addresses: addresses
      };
      var jsonp = sinon.stub();
      var status = sinon.stub().returns({jsonp: jsonp});
      var res = {
        status: status
      };
      endpoint(req, res);
      checkWriterArgs(worker._queueWriterTask);
      status.callCount.should.equal(1);
      status.args[0][0].should.equal(201);
      jsonp.callCount.should.equal(1);
      jsonp.args[0][0].should.deep.equal({
        addresses: newAddresses
      });
    });
    it('will set status to 204 without new addresses (empty array)', function() {
      var worker = new WebWorker(options);
      var newAddresses = [];
      worker._queueWriterTask = sinon.stub().callsArgWith(3, null, newAddresses);
      var endpoint = worker._endpointPostAddresses();
      var req = {
        walletId: walletId,
        addresses: addresses
      };
      var end = sinon.stub();
      var status = sinon.stub().returns({end: end});
      var res = {
        status: status
      };
      endpoint(req, res);
      checkWriterArgs(worker._queueWriterTask);
      status.callCount.should.equal(1);
      status.args[0][0].should.equal(204);
      end.callCount.should.equal(1);
    });
    it('will set status to 204 without new addresses (undefined)', function() {
      var worker = new WebWorker(options);
      worker._queueWriterTask = sinon.stub().callsArgWith(3, null, undefined);
      var endpoint = worker._endpointPostAddresses();
      var req = {
        walletId: walletId,
        addresses: addresses
      };
      var end = sinon.stub();
      var status = sinon.stub().returns({end: end});
      var res = {
        status: status
      };
      endpoint(req, res);
      checkWriterArgs(worker._queueWriterTask);
      status.callCount.should.equal(1);
      status.args[0][0].should.equal(204);
      end.callCount.should.equal(1);
    });
    it('will call sendError if error', function() {
      var worker = new WebWorker(options);
      var walletId = 'bc3914647cfbfffb7b5f431d3d231e05c01c70ac72e47d992b885d596b87ead0';
      var error = new Error('test');
      worker._queueWriterTask = sinon.stub().callsArgWith(3, error);
      sandbox.stub(utils, 'sendError');
      var endpoint = worker._endpointPostAddresses();
      var req = {
        walletId: walletId,
        addresses: addresses
      };
      var res = {};
      endpoint(req, res);
      checkWriterArgs(worker._queueWriterTask);
      utils.sendError.callCount.should.equal(1);
      utils.sendError.args[0][0].should.equal(error);
      utils.sendError.args[0][1].should.equal(res);
    });
  });
  describe('#_endpointPutWallet', function() {
    var walletId = 'bc3914647cfbfffb7b5f431d3d231e05c01c70ac72e47d992b885d596b87ead0';
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });
    function checkWriterArgs(fn) {
      fn.callCount.should.equal(1);
      fn.args[0][0].should.equal('createWallet');
      fn.args[0][1].should.deep.equal([walletId]);
      fn.args[0][2].should.equal(20);
    }
    it('will set status to 204 if not a new walletId', function() {
      var worker = new WebWorker(options);
      worker._queueWriterTask = sinon.stub().callsArg(3);
      var endpoint = worker._endpointPutWallet();
      var req = {
        walletId: walletId
      };
      var end = sinon.stub();
      var status = sinon.stub().returns({end: end});
      var res = {
        status: status
      };
      endpoint(req, res);
      checkWriterArgs(worker._queueWriterTask);
      status.callCount.should.equal(1);
      status.args[0][0].should.equal(204);
      end.callCount.should.equal(1);
    });
    it('will set status to 201 for new walletId', function() {
      var worker = new WebWorker(options);
      worker._queueWriterTask = sinon.stub().callsArgWith(3, null, walletId);
      var endpoint = worker._endpointPutWallet();
      var req = {
        walletId: walletId
      };
      var jsonp = sinon.stub();
      var status = sinon.stub().returns({jsonp: jsonp});
      var res = {
        status: status
      };
      endpoint(req, res);
      checkWriterArgs(worker._queueWriterTask);
      status.callCount.should.equal(1);
      status.args[0][0].should.equal(201);
      jsonp.callCount.should.equal(1);
      jsonp.args[0][0].should.deep.equal({
        walletId: walletId
      });
    });
    it('will call sendError if error', function() {
      var worker = new WebWorker(options);
      var error = new Error('test');
      worker._queueWriterTask = sinon.stub().callsArgWith(3, error);
      sandbox.stub(utils, 'sendError');
      var endpoint = worker._endpointPutWallet();
      var req = {
        walletId: walletId
      };
      var res = {};
      endpoint(req, res);
      utils.sendError.callCount.should.equal(1);
      utils.sendError.args[0][0].should.equal(error);
      utils.sendError.args[0][1].should.equal(res);
    });
  });
  describe('#_startListener', function() {
    it('will create express application, setup and start listening on port', function() {
      var listen = sinon.stub();
      var app = sinon.stub();
      var server = {
        listen: listen
      };
      var http = {
        createServer: sinon.stub().returns(server)
      };
      var WebWorkerStubbed = proxyquire('../lib/web-workers', {
        express: sinon.stub().returns(app),
        http: http
      });
      var worker = new WebWorkerStubbed(options);
      worker.config = {
        hasTLS: sinon.stub().returns(false)
      };
      worker._setupMiddleware = sinon.stub();
      worker._setupRoutes = sinon.stub();
      worker._startListener();
      worker._setupMiddleware.callCount.should.equal(1);
      worker._setupMiddleware.args[0][0].should.equal(app);
      worker._setupRoutes.callCount.should.equal(1);
      worker._setupRoutes.args[0][0].should.equal(app);
      server.listen.callCount.should.equal(1);
      server.listen.args[0][0].should.equal(20001);
    });
  });
  describe('#_endpointGetInfo', function() {
    it('will return function that will give response with version', function() {
      var worker = new WebWorker(options);
      var endpoint = worker._endpointGetInfo();
      var req = {};
      var res = {
        jsonp: sinon.stub()
      };
      endpoint(req, res);
      res.jsonp.callCount.should.equal(1);
      res.jsonp.args[0][0].should.deep.equal({
        version: version
      });
    });
  });
  describe('#_endpointNotfound', function() {
    it('will set status code of 404 and give json response', function() {
      var worker = new WebWorker(options);
      var endpoint = worker._endpointNotFound();
      var req = {};
      var jsonp = sinon.stub();
      var res = {
        status: sinon.stub().returns({jsonp: jsonp})
      };
      endpoint(req, res);
      res.status.callCount.should.equal(1);
      res.status.args[0][0].should.equal(404);
      jsonp.callCount.should.equal(1);
      jsonp.args[0][0].should.deep.equal({
        status: 404,
        url: req.originalUrl,
        error: 'Not found'
      });
    });
  });
  describe('#_middlewareHeaders', function() {
    it('will return function that will set response headers', function(done) {
      var worker = new WebWorker(options);
      var middleware = worker._middlewareHeaders();
      var req = {
        networkName: 'testnet',
        bitcoinHeight: 100,
        bitcoinHash: '0000000000000000acfc75c88c569e4f087a614b584180f19c8b39f16a6a24f3'
      };
      var res = {
        header: sinon.stub()
      };
      middleware(req, res, function() {
        res.header.callCount.should.equal(4);

        res.header.args[0][0].should.equal('x-bitcoin-network');
        res.header.args[0][1].should.equal('testnet');

        res.header.args[1][0].should.equal('x-bitcoin-height');
        res.header.args[1][1].should.equal(100);

        res.header.args[2][0].should.equal('x-bitcoin-hash');
        res.header.args[2][1].should.equal('0000000000000000acfc75c88c569e4f087a614b584180f19c8b39f16a6a24f3');

        res.header.args[3][0].should.equal('x-powered-by');
        res.header.args[3][1].should.equal('bwdb');
        done();
      });
    });
  });
  describe('#_middlewareChainInfo', function() {
    it('will set chain info properties on the request object', function(done) {
      var worker = new WebWorker(options);
      worker.network = bitcore.Networks.testnet;
      worker.config = {
        getNetworkName: sinon.stub().returns('testnet')
      };
      worker._updateLatestTip = sinon.stub();
      worker.bitcoinHeight = 100;
      worker.bitcoinHash = '0000000000000000d33b25b34da5bc2968e149ecf44e5b794e1ec45700d0be3e';
      var middleware = worker._middlewareChainInfo();
      var req = {};
      var res = {};
      middleware(req, res, function() {
        req.network.should.equal(bitcore.Networks.testnet);
        req.networkName.should.equal('testnet');
        req.bitcoinHeight.should.equal(100);
        req.bitcoinHash.should.equal('0000000000000000d33b25b34da5bc2968e149ecf44e5b794e1ec45700d0be3e');
        done();
      });
    });
  });
  describe('#_setupMiddleware', function() {
    it('will setup express application with all the middleware functions', function() {
      var compression = sinon.stub().returns('compression');
      var bodyParser = {
        json: sinon.stub().returns('bodyparser-json'),
        urlencoded: sinon.stub().returns('bodyparser-urlencoded')
      };
      var WebWorkerStubbed = proxyquire('../lib/web-workers', {
        'compression': compression,
        'body-parser': bodyParser
      });
      var worker = new WebWorkerStubbed(options);

      var middlewareChainInfo = sinon.stub();
      worker._middlewareChainInfo = sinon.stub().returns(middlewareChainInfo);

      var middlewareLogger = sinon.stub();
      worker._middlewareLogger = sinon.stub().returns(middlewareLogger);

      var middlewareHeaders = sinon.stub();
      worker._middlewareHeaders = sinon.stub().returns(middlewareHeaders);

      var middlewareCheckSignature = sinon.stub();
      worker._middlewareCheckSignature = sinon.stub().returns(middlewareCheckSignature);

      var middlewareCheckAuth = sinon.stub();
      worker._middlewareCheckAuth = sinon.stub().returns(middlewareCheckAuth);

      var app = {
        use: sinon.stub()
      };
      worker._setupMiddleware(app);
      app.use.callCount.should.equal(9);
      app.use.args[0][0].should.equal(middlewareChainInfo);
      app.use.args[1][0].should.equal(middlewareLogger);
      app.use.args[2][0].should.equal('compression');
      app.use.args[3][0].should.equal('bodyparser-json');
      app.use.args[4][0].should.equal('bodyparser-urlencoded');
      app.use.args[5][0].should.equal(utils.enableCORS);
      app.use.args[6][0].should.equal(middlewareCheckSignature);
      app.use.args[7][0].should.equal(middlewareCheckAuth);
      app.use.args[8][0].should.equal(middlewareHeaders);
    });
  });
  describe('#_setupRoutes', function() {
    it('will setup endpoint handlers with middleware', function() {
      var worker = new WebWorker(options);

      var endpointGetInfo = sinon.stub();
      worker._endpointGetInfo = sinon.stub().returns(endpointGetInfo);

      var endpointBalance = sinon.stub();
      worker._endpointBalance = sinon.stub().returns(endpointBalance);

      var endpointTxids = sinon.stub();
      worker._endpointTxids = sinon.stub().returns(endpointTxids);

      var endpointTransactions = sinon.stub();
      worker._endpointTransactions = sinon.stub().returns(endpointTransactions);

      var endpointRawTransactions = sinon.stub();
      worker._endpointRawTransactions = sinon.stub().returns(endpointRawTransactions);

      var endpointUTXOs = sinon.stub();
      worker._endpointUTXOs = sinon.stub().returns(endpointUTXOs);

      var endpointPutAddress = sinon.stub();
      worker._endpointPutAddress = sinon.stub().returns(endpointPutAddress);

      var endpointPutWallet = sinon.stub();
      worker._endpointPutWallet = sinon.stub().returns(endpointPutWallet);

      var endpointPostAddresses = sinon.stub();
      worker._endpointPostAddresses = sinon.stub().returns(endpointPostAddresses);

      var endpointNotFound = sinon.stub();
      worker._endpointNotFound = sinon.stub().returns(endpointNotFound);

      var app = {
        get: sinon.stub(),
        put: sinon.stub(),
        post: sinon.stub(),
        use: sinon.stub()
      };

      worker._setupRoutes(app);

      app.put.callCount.should.equal(2);
      app.post.callCount.should.equal(1);
      app.use.callCount.should.equal(1);
      app.get.callCount.should.equal(6);

      app.get.args[0][0].should.equal('/info');
      app.get.args[0][1].should.equal(endpointGetInfo);

      app.get.args[1][0].should.equal('/wallets/:walletId/balance');
      app.get.args[1][1].should.equal(validators.checkWalletId);
      app.get.args[1][2].should.equal(endpointBalance);

      app.get.args[2][0].should.equal('/wallets/:walletId/txids');
      app.get.args[2][1].should.equal(validators.checkWalletId);
      app.get.args[2][2].should.equal(validators.checkRangeParams);
      app.get.args[2][3].should.equal(endpointTxids);

      app.get.args[3][0].should.equal('/wallets/:walletId/transactions');
      app.get.args[3][1].should.equal(validators.checkWalletId);
      app.get.args[3][2].should.equal(validators.checkRangeParams);
      app.get.args[3][3].should.equal(endpointTransactions);

      app.get.args[4][0].should.equal('/wallets/:walletId/rawtransactions');
      app.get.args[4][1].should.equal(validators.checkWalletId);
      app.get.args[4][2].should.equal(validators.checkRangeParams);
      app.get.args[4][3].should.equal(endpointRawTransactions);

      app.get.args[5][0].should.equal('/wallets/:walletId/utxos');
      app.get.args[5][1].should.equal(validators.checkWalletId);
      app.get.args[5][2].should.equal(endpointUTXOs);

      app.put.args[0][0].should.equal('/wallets/:walletId/addresses/:address');
      app.put.args[0][1].should.equal(validators.checkWalletId);
      app.put.args[0][2].should.equal(validators.checkAddress);
      app.put.args[0][3].should.equal(endpointPutAddress);

      app.put.args[1][0].should.equal('/wallets/:walletId');
      app.put.args[1][1].should.equal(validators.checkWalletId);
      app.put.args[1][2].should.equal(endpointPutWallet);

      app.post.args[0][0].should.equal('/wallets/:walletId/addresses');
      app.post.args[0][1].should.equal(validators.checkWalletId);
      app.post.args[0][2].should.equal(validators.checkAddresses);
      app.post.args[0][3].should.equal(endpointPostAddresses);

      app.use.args[0][0].should.equal(endpointNotFound);

    });
  });
});
