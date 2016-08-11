'use strict';

var chai = require('chai');
var should = chai.should();
var sinon = require('sinon');
var proxyquire = require('proxyquire');
var EventEmitter = require('events').EventEmitter;

var utils = require('../lib/utils');

describe('Wallet Utils', function() {

  describe('#isInteger', function() {
    it('will return false for 0.1', function() {
      utils.isInteger(0.1).should.equal(false);
    });
    it('will return false for "0.1"', function() {
      utils.isInteger("0.1").should.equal(false);
    });
    it('will return false for NaN', function() {
      utils.isInteger(NaN).should.equal(false);
    });
    it('will return false for Infinity', function() {
      utils.isInteger(Infinity).should.equal(false);
    });
    it('will return false for Math.PI', function() {
      utils.isInteger(Math.PI).should.equal(false);
    });
    it('will return false for "99"', function() {
      utils.isInteger('99').should.equal(false);
    });
    it('will return false for "-99"', function() {
      utils.isInteger('-99').should.equal(false);
    });
    it('will return true for 99', function() {
      utils.isInteger(99).should.equal(true);
    });
    it('will return true for -99', function() {
      utils.isInteger(-99).should.equal(true);
    });
  });

  describe('#setupDirectory', function() {
    it('will make directory if the application directory does not exist', function(done) {
      var mkdirp = sinon.stub().callsArg(1);
      var enoentError = new Error();
      enoentError.code = 'ENOENT';
      var access = sinon.stub().callsArgWith(1, enoentError);
      var utils = proxyquire('../lib/utils', {
        'fs': {
          access: access
        },
        'mkdirp': mkdirp
      });
      utils.setupDirectory('/tmp/bwdb-directory', function(err) {
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
      var utils = proxyquire('../lib/utils', {
        'fs': {
          access: access
        },
        'mkdirp': mkdirp
      });
      utils.setupDirectory('/tmp/bwdb-directory', function(err) {
        err.should.be.instanceOf(Error);
        err.message.should.equal('test');
        mkdirp.callCount.should.equal(0);
        done();
      });
    });
    it('will continue if application directory already exists', function(done) {
      var mkdirp = sinon.stub().callsArg(1);
      var access = sinon.stub().callsArg(1);
      var utils = proxyquire('../lib/utils', {
        'fs': {
          access: access
        },
        'mkdirp': mkdirp
      });
      utils.setupDirectory('/tmp/bwdb-directory', function(err) {
        if (err) {
          return done(err);
        }
        mkdirp.callCount.should.equal(0);
        access.callCount.should.equal(1);
        done();
      });
    });
  });

  describe('#splitRange', function() {
    it('will split 1 to 10 by sections of 3', function() {
      var range = utils.splitRange(1, 10, 3);
      range.should.deep.equal([[1, 3], [4, 6], [7, 9], [10, 10]]);
    });
    it('will split 1 to 417769 by sections of 100000', function() {
      var range = utils.splitRange(1, 417769, 100000);
      range.should.deep.equal([[1, 100000], [100001, 200000], [200001, 300000], [300001, 400000], [400001, 417769]]);
    });
    it('will split 1 to 2 by sections of 3 (leaving unchanged)', function() {
      var range = utils.splitRange(1, 2, 3);
      range.should.deep.equal([[1, 2]]);
    });
  });

  describe('#readJSONFile', function() {
    it('will give error from readFile', function(done) {
      var enoentError = new Error();
      enoentError.code = 'ENOENT';
      var readFile = sinon.stub().callsArgWith(1, enoentError);
      var utils = proxyquire('../lib/utils', {
        'fs': {
          readFile: readFile
        }
      });
      utils.readJSONFile('/tmp/bwdb-directory', function(err) {
        should.exist(err);
        err.code.should.equal('ENOENT');
        readFile.callCount.should.equal(1);
        done();
      });
    });
    it('will give error from parsing JSON', function(done) {
      var readFile = sinon.stub().callsArgWith(1, null, 'badjson');
      var utils = proxyquire('../lib/utils', {
        'fs': {
          readFile: readFile
        }
      });
      utils.readJSONFile('/tmp/bwdb-directory', function(err) {
        should.exist(err);
        err.message.should.equal('Unexpected token b');
        readFile.callCount.should.equal(1);
        done();
      });
    });
    it('will callback with parsed JSON', function(done) {
      var readFile = sinon.stub().callsArgWith(1, null, '{"hello":"world"}');
      var utils = proxyquire('../lib/utils', {
        'fs': {
          readFile: readFile
        }
      });
      utils.readJSONFile('/tmp/bwdb-directory', function(err, json) {
        if (err) {
          return done(err);
        }
        readFile.callCount.should.equal(1);
        json.should.deep.equal({hello: 'world'});
        done();
      });
    });
  });

  describe('#readWalletFile', function() {
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });
    it('it will call readJSONFile', function(done) {
      sandbox.stub(utils, 'readJSONFile').callsArg(1);
      utils.readWalletFile('wallet.json', 'testnet', function(err) {
        if (err) {
          done(err);
        }
        utils.readJSONFile.callCount.should.equal(1);
        done();
      });
    });
    it('it will call readWalletDatFile', function(done) {
      sandbox.stub(utils, 'readWalletDatFile').callsArg(2);
      utils.readWalletFile('wallet.dat', 'testnet', function(err) {
        if (err) {
          return done(err);
        }
        utils.readWalletDatFile.callCount.should.equal(1);
        done();
      });
    });
    it('will give error with unknown extension', function(done) {
      utils.readWalletFile('wallet.unknown', 'testnet', function(err) {
        should.exist(err);
        err.message.should.equal('"dat" or "json" file extension is expected');
        done();
      });
    });
  });

  describe('#readWalletDatFile', function() {
    it('will callback with error set', function(done) {
      var mySpawn = new EventEmitter();
      var spawnStub = function(exec, options) {
        mySpawn.stdout = new EventEmitter();
        mySpawn.stderr = new EventEmitter();
        mySpawn.emit('ready');
        return mySpawn;
      };
      var utilsStub = proxyquire('../lib/utils', {
        child_process: {
          spawn : spawnStub
        }
      });
      mySpawn.on('ready', function() {
        setImmediate(function() {
          mySpawn.stdout.emit('data', '[\"1Ebb8NfVmKMoGuMJCAEbVMv2dX8GnzgxSa\", \"32PZ2TJ93YN8pRu9yQhgLpUKCrQVarv6uN\"]');
          mySpawn.emit('close', 1);
        });
      });
      utilsStub.readWalletDatFile('filepath', 'testnet', function(err, data) {
        should.exist(err);
        should.not.exist(data);
        err.message.should.equal('wallet-utility exited (1): ["1Ebb8NfVmKMoGuMJCAEbVMv2dX8GnzgxSa", "32PZ2TJ93YN8pRu9yQhgLpUKCrQVarv6uN"]');
        done();
      });
    });
    it('will return address JSON correctly', function(done) {
      var mySpawn = new EventEmitter();
      var spawnStub = function(exec, options) {
        mySpawn.stdout = new EventEmitter();
        mySpawn.stderr = new EventEmitter();
        mySpawn.emit('ready');
        return mySpawn;
      };
      var utilsStub = proxyquire('../lib/utils', {
        child_process: {
          spawn : spawnStub
        }
      });
      mySpawn.on('ready', function() {
        setImmediate(function() {
          mySpawn.stdout.emit('data', '["1Ebb8NfVmKMoGuMJCAEbVMv2dX8GnzgxSa", "32PZ2TJ93YN8pRu9yQhgLpUKCrQVarv6uN"]');
          mySpawn.emit('close', 0);
        });
      });
      utilsStub.readWalletDatFile('filepath', 'regtest', function(err, data) {
        should.not.exist(err);
        should.exist(data);
        data.should.deep.equal(["1Ebb8NfVmKMoGuMJCAEbVMv2dX8GnzgxSa", "32PZ2TJ93YN8pRu9yQhgLpUKCrQVarv6uN"]);
        done();
      });
    });
    it('will return address JSON correctly from object', function(done) {
      var mySpawn = new EventEmitter();
      var spawnStub = function(exec, options) {
        mySpawn.stdout = new EventEmitter();
        mySpawn.stderr = new EventEmitter();
        mySpawn.emit('ready');
        return mySpawn;
      };
      var utilsStub = proxyquire('../lib/utils', {
        child_process: {
          spawn : spawnStub
        }
      });
      var emitData = '[{"addr": "1Ebb8NfVmKMoGuMJCAEbVMv2dX8GnzgxSa"}, {"addr": "32PZ2TJ93YN8pRu9yQhgLpUKCrQVarv6uN"}]';
      mySpawn.on('ready', function() {
        setImmediate(function() {
          mySpawn.stdout.emit('data', emitData);
          mySpawn.emit('close', 0);
        });
      });
      utilsStub.readWalletDatFile('filepath', 'regtest', function(err, data) {
        should.not.exist(err);
        should.exist(data);
        data.should.deep.equal(["1Ebb8NfVmKMoGuMJCAEbVMv2dX8GnzgxSa", "32PZ2TJ93YN8pRu9yQhgLpUKCrQVarv6uN"]);
        done();
      });
    });
    it('will back with an error from stderr', function(done) {
      var mySpawn = new EventEmitter();
      var spawnStub = function(exec, options) {
        mySpawn.stdout = new EventEmitter();
        mySpawn.stderr = new EventEmitter();
        mySpawn.emit('ready');
        return mySpawn;
      };
      var utilsStub = proxyquire('../lib/utils', {
        child_process: {
          spawn : spawnStub
        }
      });
      mySpawn.on('ready', function() {
        setImmediate(function() {
          mySpawn.stderr.emit('data', 'some error');
          mySpawn.emit('close', 1);
        });
      });
      utilsStub.readWalletDatFile('filepath', 'regtest', function(err, data) {
        should.exist(err);
        should.not.exist(data);
        err.message.should.equal('some error');
        done();
      });
    });
    it('will callback with a json parse error', function(done) {
      var mySpawn = new EventEmitter();
      var spawnStub = function(exec, options) {
        mySpawn.stdout = new EventEmitter();
        mySpawn.stderr = new EventEmitter();
        mySpawn.emit('ready');
        return mySpawn;
      };
      var utilsStub = proxyquire('../lib/utils', {
        child_process: {
          spawn : spawnStub
        }
      });
      mySpawn.on('ready', function() {
        setImmediate(function() {
          mySpawn.stdout.emit('data', '["some bad json"');
          mySpawn.emit('close', 0);
        });
      });

      utilsStub.readWalletDatFile('filepath', '', function(err, data) {
        should.exist(err);
        should.not.exist(data);
        err.message.should.equal('Unexpected end of input');
        done();
      });
    });
  });

  describe('#enableCORS', function() {
    it('will set res headers with req method GET', function() {
      var header = sinon.stub().returns('res header stub');
      var end = sinon.stub();
      var myRes = {
        header: header,
        statusCode: '',
        end: end
      };
      var toUpperCase = sinon.stub().returns('GET');
      var myReq = {
        method: {
          toUpperCase: toUpperCase
        }
      };
      var next = sinon.stub();
      utils.enableCORS(myReq, myRes, next);
    });
    it('will set res headers with req method OPTIONS', function() {
      var header = sinon.stub().returns('res header stub');
      var end = sinon.stub();
      var myRes = {
        header: header,
        statusCode: '',
        end: end
      };
      var toUpperCase = sinon.stub().returns('OPTIONS');
      var myReq = {
        method: {
          toUpperCase: toUpperCase
        }
      };
      var next = sinon.stub();
      utils.enableCORS(myReq, myRes, next);
      myRes.statusCode.should.equal(204);
    });
  });

  describe('#createLogStream', function() {
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });
    it('will return log stream', function() {
      var fn = sinon.stub();
      var stream = utils.createLogStream(fn);
      should.exist(stream);
      stream.write('something', 'utf8', fn);
    });
  });

  describe('#getClients', function() {
    it('will get a list of clients', function() {
      var config = {
        rpcprotocol: 'http',
        rpchost: 'localhost',
        rpcport: 18333,
        rpcuser: 'test',
        rpcpassword: 'local',
        rpcstrict: false
      };
      var clients = utils.getClients([config]);
      should.exist(clients);
    });
    it('will get a list of clients with empty config', function() {
      var clients = utils.getClients([{}]);
      should.exist(clients);
    });
  });

  describe('#splitArray', function() {
    it('will split an array', function() {
      var array = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'];
      var split = utils.splitArray(array, 2);
      split.length.should.equal(6);
      split.should.deep.equal([['a', 'b'], ['c', 'd'], ['e', 'f'], ['g', 'h'], ['i', 'j'], ['k']]);
    });
  });

  describe('#getRemoteAddress', function() {
    it('will return cloudflare headers', function() {
      var address = utils.getRemoteAddress({headers: {'cf-connecting-ip': '127.0.0.1'}});
      address.should.equal('127.0.0.1');
    });
    it('will return socket address', function() {
      var address = utils.getRemoteAddress({headers: {}, socket: {remoteAddress: '127.0.0.1'}});
      address.should.equal('127.0.0.1');
    });
  });

  describe('#sendError', function() {
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });
    it('will include status code', function() {
      var err = new Error('test');
      err.statusCode = 404;
      var send = sinon.stub();
      var status = sinon.stub().returns({send: send});
      var res = {
        status: status
      };
      utils.sendError(err, res);
      status.callCount.should.equal(1);
      status.args[0][0].should.equal(404);
      send.callCount.should.equal(1);
      send.args[0][0].should.equal('test');
    });
    it('will default to 503 if status code not included', function() {
      sandbox.stub(console, 'error');
      var err = new Error('test');
      var send = sinon.stub();
      var status = sinon.stub().returns({send: send});
      var res = {
        status: status
      };
      utils.sendError(err, res);
      console.error.callCount.should.equal(1);
      status.callCount.should.equal(1);
      status.args[0][0].should.equal(503);
      send.callCount.should.equal(1);
      send.args[0][0].should.equal('test');
    });
  });

  describe('#getTaskId', function() {
    it('will get a random value', function() {
      var id = utils.getTaskId();
      id.should.be.a('string');
      id.length.should.equal(8);
    });
  });

  describe('#getClients', function() {
    it('', function() {
    });
  });

  describe('#setClients', function() {
    it('', function() {
    });
  });

  describe('#tryAllClients', function() {
    it('', function() {
    });
  });

  describe('#wrapRPCError', function() {
    it('will create an error', function() {
      var error = utils.wrapRPCError({message: 'test'});
      error.should.be.instanceOf(Error);
      error.message.should.equal('test');
    });
  });

  describe('#getAddressTypeString', function() {
    it('it will return pubkeyhash with 01', function() {
      utils.getAddressTypeString(new Buffer('01', 'hex')).should.equal('pubkeyhash');
    });
    it('it will return scripthash with 02', function() {
      utils.getAddressTypeString(new Buffer('02', 'hex')).should.equal('scripthash');
    });
    it('will throw error if unknown type', function() {
      (function() {
        utils.getAddressTypeString(new Buffer('00', 'hex'));
      }).should.throw('Unknown address type');
    });
  });

  describe('#getAddressTypeBuffer', function() {
    it('it will return 01 for pubkeyhash', function() {
      utils.getAddressTypeBuffer({type: 'pubkeyhash'}).toString('hex').should.equal('01');
    });
    it('it will return 02 for scripthash', function() {
      utils.getAddressTypeBuffer({type: 'scripthash'}).toString('hex').should.equal('02');
    });
    it('will throw error if unknown type', function() {
      (function() {
        utils.getAddressTypeBuffer({type: 'unkonwn'});
      }).should.throw('Unknown address type');
    });
  });

  describe('#splitBuffer', function() {
    it('will split buffers by segment size', function() {
      var value = 'f4d652a6902744f4738ab484c23d267293a2c7fdb89fe1aa78e6f0f2d0b63d2c';
      value += '071fac61f3e6572197dcb9d7f5ddf17bcce062d12a29a1ba317c1c03d438ddef';
      value += '97bdd4ac795eb08c6fd99b198bc9d8f549e3bc7e3fbb9e37563d8c9bf78bb477';
      var buf = new Buffer(value, 'hex');
      var buffers = utils.splitBuffer(buf, 32);
      buffers.length.should.equal(3);
      buffers[0].toString('hex').should.equal('f4d652a6902744f4738ab484c23d267293a2c7fdb89fe1aa78e6f0f2d0b63d2c');
      buffers[1].toString('hex').should.equal('071fac61f3e6572197dcb9d7f5ddf17bcce062d12a29a1ba317c1c03d438ddef');
      buffers[2].toString('hex').should.equal('97bdd4ac795eb08c6fd99b198bc9d8f549e3bc7e3fbb9e37563d8c9bf78bb477');
    });
  });

  describe('#exitWorker', function() {
    it('will send SIGINT and exit cleanly', function(done) {
      var worker = new EventEmitter();
      worker.kill = function() {
        worker.emit('exit', 0);
      };
      utils.exitWorker(worker, 1000, function() {
        done();
      });
    });
    it('will send SIGINT and give error if non-zero', function(done) {
      var worker = new EventEmitter();
      worker.kill = function() {
        worker.emit('exit', 1);
      };
      utils.exitWorker(worker, 1000, function(err) {
        should.exist(err);
        err.message.should.equal('Worker did not exit cleanly: 1');
        done();
      });
    });
    it('will send SIGKILL after timeout', function(done) {
      var worker = new EventEmitter();
      worker.kill = function(signal) {
        if (signal === 'SIGKILL') {
          worker.emit('exit', 1);
        }
      };
      utils.exitWorker(worker, 10, function(err) {
        should.exist(err);
        err.message.should.equal('Worker exit timeout, force shutdown');
        done();
      });
    });
  });

  describe('#timestampToISOString', function() {
    it('will convert second timestamp to iso string', function() {
      utils.timestampToISOString(1231006505).should.equal('2009-01-03T18:15:05.000Z');
    });
  });

  describe('#satoshisToBitcoin', function() {
    it('1999 to 0.00001999', function() {
      utils.satoshisToBitcoin(1999, 0.00001999);
    });
  });
});
