'use strict';

var crypto = require('crypto');

var bitcore  = require('bitcore-lib');
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
      utils.isInteger('0.1').should.equal(false);
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
        return mySpawn;
      };
      var utilsStub = proxyquire('../lib/utils', {
        'child_process': {
          spawn : spawnStub
        }
      });
      utilsStub.readWalletDatFile('filepath', 'testnet', function(err, data) {
        should.exist(err);
        should.not.exist(data);
        err.message.should.equal('wallet-utility exited (1): error message');
        done();
      });
      mySpawn.stdout.emit('data', 'error message');
      mySpawn.emit('close', 1);
    });
    it('will return address JSON correctly', function(done) {
      var mySpawn = new EventEmitter();
      var spawnStub = function(exec, options) {
        mySpawn.stdout = new EventEmitter();
        mySpawn.stderr = new EventEmitter();
        return mySpawn;
      };
      var utilsStub = proxyquire('../lib/utils', {
        'child_process': {
          spawn : spawnStub
        }
      });
      utilsStub.readWalletDatFile('filepath', 'regtest', function(err, data) {
        should.not.exist(err);
        should.exist(data);
        data.should.deep.equal(["1Ebb8NfVmKMoGuMJCAEbVMv2dX8GnzgxSa", "32PZ2TJ93YN8pRu9yQhgLpUKCrQVarv6uN"]);
        done();
      });
      mySpawn.stdout.emit('data', '["1Ebb8NfVmKMoGuMJCAEbVMv2dX8GnzgxSa", "32PZ2TJ93YN8pRu9yQhgLpUKCrQVarv6uN"]');
      mySpawn.emit('close', 0);
    });
    it('will return address JSON correctly from object', function(done) {
      var mySpawn = new EventEmitter();
      var spawnStub = function(exec, options) {
        mySpawn.stdout = new EventEmitter();
        mySpawn.stderr = new EventEmitter();
        return mySpawn;
      };
      var utilsStub = proxyquire('../lib/utils', {
        child_process: {
          spawn : spawnStub
        }
      });
      var emitData = '[{"addr": "1Ebb8NfVmKMoGuMJCAEbVMv2dX8GnzgxSa"}, {"addr": "32PZ2TJ93YN8pRu9yQhgLpUKCrQVarv6uN"}]';
      utilsStub.readWalletDatFile('filepath', 'regtest', function(err, data) {
        should.not.exist(err);
        should.exist(data);
        data.should.deep.equal(["1Ebb8NfVmKMoGuMJCAEbVMv2dX8GnzgxSa", "32PZ2TJ93YN8pRu9yQhgLpUKCrQVarv6uN"]);
        done();
      });
      mySpawn.stdout.emit('data', emitData);
      mySpawn.emit('close', 0);
    });
    it('will back with an error from stderr', function(done) {
      var mySpawn = new EventEmitter();
      var spawnStub = function(exec, options) {
        mySpawn.stdout = new EventEmitter();
        mySpawn.stderr = new EventEmitter();
        return mySpawn;
      };
      var utilsStub = proxyquire('../lib/utils', {
        child_process: {
          spawn : spawnStub
        }
      });
      utilsStub.readWalletDatFile('filepath', 'regtest', function(err, data) {
        should.exist(err);
        should.not.exist(data);
        err.message.should.equal('some error');
        done();
      });
      mySpawn.stderr.emit('data', 'some error');
      mySpawn.emit('close', 1);
    });
    it('will callback with a json parse error', function(done) {
      var mySpawn = new EventEmitter();
      var spawnStub = function(exec, options) {
        mySpawn.stdout = new EventEmitter();
        mySpawn.stderr = new EventEmitter();
        return mySpawn;
      };
      var utilsStub = proxyquire('../lib/utils', {
        child_process: {
          spawn : spawnStub
        }
      });
      utilsStub.readWalletDatFile('filepath', '', function(err, data) {
        should.exist(err);
        should.not.exist(data);
        err.message.should.equal('Unexpected end of input');
        done();
      });
      mySpawn.stdout.emit('data', '["some bad json"');
      mySpawn.emit('close', 0);
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
      header.callCount.should.equal(3);
      header.args[0][0].should.equal('access-control-allow-origin');
      header.args[0][1].should.equal('*');
      header.args[1][0].should.equal('access-control-allow-methods');
      header.args[1][1].should.equal('GET, HEAD, PUT, POST, OPTIONS');
      header.args[2][0].should.equal('access-control-allow-headers');
      var allowed = [
        'origin',
        'x-requested-with',
        'content-type',
        'accept',
        'content-length',
        'cache-control',
        'cf-connecting-ip'
      ];
      header.args[2][1].should.equal(allowed.join(', '));
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
      clients.length.should.equal(1);
      clients[0].rejectUnauthorized.should.equal(false);
    });
    it('will get a list of clients (with strict)', function() {
      var config = {
        rpcprotocol: 'http',
        rpchost: 'localhost',
        rpcport: 18333,
        rpcuser: 'test',
        rpcpassword: 'local',
        rpcstrict: true
      };
      var clients = utils.getClients([config]);
      should.exist(clients);
      clients.length.should.equal(1);
      clients[0].rejectUnauthorized.should.equal(true);
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

  describe('#setClients', function() {
    it('', function() {
    });
  });

  describe('#tryAllClients', function() {
    it('will retry for each node client', function(done) {
      var obj = {
        _clients: [
          {
            getInfo: sinon.stub().callsArgWith(0, new Error('test'))
          },
          {
            getInfo: sinon.stub().callsArgWith(0, new Error('test'))
          },
          {
            getInfo: sinon.stub().callsArg(0)
          }
        ],
        _clientsIndex: 0
      };
      utils.tryAllClients(obj, function(client, next) {
        client.getInfo(next);
      }, {interval: 1}, function(err) {
        if (err) {
          return done(err);
        }
        obj._clients[0].getInfo.callCount.should.equal(1);
        obj._clients[1].getInfo.callCount.should.equal(1);
        obj._clients[2].getInfo.callCount.should.equal(1);
        done();
      });
    });
    it('will start using the current node index (round-robin)', function(done) {
      var obj = {
        _clients: [
          {
            getInfo: sinon.stub().callsArgWith(0, new Error('2'))
          },
          {
            getInfo: sinon.stub().callsArgWith(0, new Error('3'))
          },
          {
            getInfo: sinon.stub().callsArgWith(0, new Error('1'))
          }
        ],
        _clientsIndex: 2
      };
      utils.tryAllClients(obj, function(client, next) {
        client.getInfo(next);
      }, {interval: 1}, function(err) {
        err.should.be.instanceOf(Error);
        err.message.should.equal('3');
        obj._clients[0].getInfo.callCount.should.equal(1);
        obj._clients[1].getInfo.callCount.should.equal(1);
        obj._clients[2].getInfo.callCount.should.equal(1);
        obj._clientsIndex.should.equal(2);
        done();
      });
    });
    it('will get error if all clients fail', function(done) {
      var obj = {
        _clients: [
          {
            getInfo: sinon.stub().callsArgWith(0, new Error('test'))
          },
          {
            getInfo: sinon.stub().callsArgWith(0, new Error('test'))
          },
          {
            getInfo: sinon.stub().callsArgWith(0, new Error('test'))
          }
        ],
        _clientsIndex: 0
      };
      utils.tryAllClients(obj, function(client, next) {
        client.getInfo(next);
      }, {interval: 1}, function(err) {
        should.exist(err);
        err.should.be.instanceOf(Error);
        err.message.should.equal('test');
        done();
      });
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
    it('it will return pubkeyhash with 01 (string)', function() {
      utils.getAddressTypeString('01').should.equal('pubkeyhash');
    });
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

  describe('#encryptSecret', function() {
    it('will encrypt a hashed passphrase', function(done) {
      var passphrase = 'abc123';
      var salt = 'NaCl';
      var secret = new Buffer('bf0ecd712189f385a846c333c1985b18f140046dec9246869ca9404f1c8cfe62', 'hex');
      utils.encryptSecret({
        secret:secret,
        passphrase: passphrase,
        salt: salt
      }, function(err, res) {
        if (err) {
          return done(err);
        }
        res.should.equal('c942834238b0638087436746319eb87e423eed7da099e10e72c7be23a635479b7a5bd013ce38da40cb8bf29016d995fc');
        done();
      });
    });
  });
  describe('#decryptPrivateKey', function() {
    it('will decrypt a private key using from a passphrase and appropriate cipher text', function(done) {
      var passphrase = 'test';
      var salt = new Buffer('0be3fb75ec805abd', 'hex');
      var pubkey = '03FFFF40B2CC0D3A29FCDA41EAB53E130070EF18D87B69807951FBE0132AFFE15B';
      var mkCipherText = '32e2d576aa78b6b91b8247b46b883d21f768e52e67f78d999f90cef63460fe75e56e6c6cb0ea7171cfffdbd535510505';
      var pkCipherText = '7C285461A401612241E46FC1CF5269D316B9636EFF0CA146D3E9607FC50900897E8C706A441ECF5E737729055926FBE4'
      var derivationOptions = {
        rounds: 162511,
        method: 0
      };
      utils.decryptPrivateKey({
        cipherText: mkCipherText,
        pkCipherText: pkCipherText,
        pubkey: pubkey,
        passphrase: passphrase,
        salt: salt,
        derivationOptions: derivationOptions
      }, function(err, res) {
        if (err) {
          return done(err);
        }
        var privKey = res.toString('hex');
        var addressFromCompressedPubKey = new bitcore.PublicKey(pubkey, {network: 'testnet'}).toAddress().toString();
        var addressFromRawPrivateKey = new bitcore.PrivateKey(privKey, 'testnet').toAddress().toString();
        var actual = '4a9f87c9384a60d1fe95f5cc6c94e54d76457798b687639fb83f2d0cf365ad7b';
        privKey.should.equal(actual);
        addressFromCompressedPubKey.should.equal(addressFromRawPrivateKey);
        done();
      });
    });
  });
  describe('#decryptSecret', function() {
    it('will decrypt a hashed passphrase', function(done) {
      var passphrase = 'abc123';
      var salt = 'NaCl';
      var cipherText = 'c942834238b0638087436746319eb87e423eed7da099e10e72c7be23a635479b7a5bd013ce38da40cb8bf29016d995fc';
      utils.decryptSecret({
        cipherText: cipherText,
        passphrase: passphrase,
        salt: salt,
      }, function(err, res) {
        if (err) {
          return done(err);
        }
        res.toString('hex').should.equal('f1d08f2d9ff9489dd0edb604595cbf9a11d4f1e03bacfec5e6c8b0bb2ed517a9');
        done();
      });
    });
    it('will deal with improper decryption', function(done) {
      var salt = 'c59cf45974c2ec1f75f14755d3caa67da0a3ed18b91c717db5af024165e2aa11';
      var cipherText = 'dbac44fe4c22aae8171d9ccf07407186c368b024a0027ba28530877863c056a5344369ea1a4b0e32db6cc886eb2c25ff';
      utils.decryptSecret({
        cipherText: cipherText,
        passphrase: '',
        salt: salt,
      }, function(err) {
        err.should.be.instanceOf(Error);
        done();
      });
    });
  });
  describe('#encyptPrivateKeys', function() {
    it('it will encrypt a object with keys', function(done) {
      var masterKey = new Buffer('557bf6b8505ed552b4b10b90a206ead9db42df598627cf22e93339302ffb0707', 'hex');
      var keys = [
        {
          type: 'unencrypted private key',
          privKey: 'cVm2Y3oMLf3rBnHkitn3yi9KavmNMzx9mg5M2t9f1fjb73pSUMzM',
          pubKey: '02755c2529b56d5bbd0dbdbd97760537e9544f26331bef601df3eb6bbf98562022',
          checkHash: ''
        },
        {
          type: 'unencrypted private key',
          privKey: 'cNB7dnizFdVRjEBPwUnXY7sGdLy8z8wyZyg8WcbohcMJ93GJU1ZW',
          pubKey: '03a9d328003d8dc12215740f70af80dd45705609e2585195003f64e4f966afb408',
          checkHash: ''
        },
        {
          type: 'unencrypted private key',
          privKey: 'cNiBV3Phs7CjpxUZ42b9yRpmPKQidWX8qVmHyXshmrNGm3tqZMLn',
          pubKey: '02e5e150f06365164634e0c9c4bfa46ca4371275478a5e140ce4b7f46f7179b9ab',
          checkHash: ''
        }
      ];
      utils.encryptPrivateKeys({masterKey: masterKey, keys: keys}, function(err, results) {
        if(err) {
          return done(err);
        }
        results.length.should.equal(3);
        results.should.deep.equal([{
          cipherText: 'b44a88a2f2b713feda634f3284f85c06376187fd0958013faac198e83d0a4e46ea930ba9976cb77763a264f79f8ae0dae6132c3b8b806d7843e9e959c03bfc4a',
          checkHash: '285dc70377b07cf1d86fb7a209694b5fd439f8495f7d3a7f4ab2addb11b86253',
          type: 'encrypted private key',
          pubKey: '02755c2529b56d5bbd0dbdbd97760537e9544f26331bef601df3eb6bbf98562022'
        },
        {
          cipherText: '4eac2f530103d3982631c14d7193c299f009c7d115d8bc738197d3227f7e6a2feff9b2613f25908ef2a095e7e3c65dd6cbae788b5b867cdc4fc2440a5e8a8aca',
          checkHash: '581c44231632d8d208c576c5e4d815fcc4c961c6a3c4feacb14ce0263ec57ef7',
          type: 'encrypted private key',
          pubKey: '03a9d328003d8dc12215740f70af80dd45705609e2585195003f64e4f966afb408'
        },
        {
          cipherText: '3ee46f81737b75fd8385c87a085cc64cb98db9822b3b950bc4f266fec40132a674691af43687c978dc109f7ab6e6af06fdef29518bbcb39b303fd566474f4de1',
          checkHash: 'f5a6d15091df8842a229c20fe8acb64d25a2d2179f6a7b21b9b62d7f3a70b04b',
          type: 'encrypted private key',
          pubKey: '02e5e150f06365164634e0c9c4bfa46ca4371275478a5e140ce4b7f46f7179b9ab'
        }]);
        done();
      });
    });
  });
  describe('#encryptSecretWithPassphrase', function() {
    var secret = crypto.randomBytes(32);
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });
    it('should generate a cipherText and salt', function(done) {
      sandbox.stub(utils, 'acquirePassphrase').callsArgWith(0, null, 'passphrase');
      sandbox.stub(utils, 'encryptSecret').callsArgWith(1, null, 'cipherText');
      utils.encryptSecretWithPassphrase(secret, function(err, cipherText, salt) {
        if (err) {
          return done(err);
        }
        cipherText.should.equal('cipherText');
        salt.should.be.a('string');
        salt.length.should.equal(64);
        utils.acquirePassphrase.callCount.should.equal(1);
        utils.encryptSecret.callCount.should.equal(1);
        utils.encryptSecret.args[0][0].passphrase.should.equal('passphrase');
        done();
      });
    });
    it('should give error from acquirePassphrase', function(done) {
      sandbox.stub(utils, 'acquirePassphrase').callsArgWith(0, new Error('test message'));
      sandbox.stub(utils, 'encryptSecret');
      utils.encryptSecretWithPassphrase(secret, function(err, cipherText, salt) {
        err.message.should.equal('test message');
        utils.acquirePassphrase.callCount.should.equal(1);
        utils.encryptSecret.callCount.should.equal(0);
        done();
      });
    });
    it('should give error from encryptSecret', function(done) {
      sandbox.stub(utils, 'acquirePassphrase').callsArgWith(0, null, 'passphrase');
      sandbox.stub(utils, 'encryptSecret').callsArgWith(1, new Error('test message from encryptSecret'));
      utils.encryptSecretWithPassphrase(secret, function(err, cipherText, salt) {
        err.message.should.equal('test message from encryptSecret');
        utils.acquirePassphrase.callCount.should.equal(1);
        utils.encryptSecret.callCount.should.equal(1);
        done();
      });
    });
  });
  describe('#confirm', function() {
    it('confirm', function(done) {
      var utils = proxyquire('../lib/utils', {
        ttyread: sinon.stub().callsArgWith(1, null, 'y')
      });
      utils.confirm('some question', function(err, answer) {
        if (err) {
          return done(err);
        }
        answer.should.equal(true);
        done();
      });
    });
    it('not confirm', function(done) {
      var utils = proxyquire('../lib/utils', {
        ttyread: sinon.stub().callsArgWith(1, null, 'N')
      });
      utils.confirm('some question', function(err, answer) {
        if (err) {
          return done(err);
        }
        answer.should.equal(false);
        done();
      });
    });
    it('error', function(done) {
      var utils = proxyquire('../lib/utils', {
        ttyread: sinon.stub().callsArgWith(1, new Error('some error'))
      });
      utils.confirm('some question', function(err, answer) {
        err.message.should.equal('some error');
        answer.should.equal(false);
        done();
      });
    });
  });
  describe('#isRangeMoreThan', function() {
    it('should return more than if height is more than', function() {
      var b = { height: 1, index: 0 };
      var a = { height: 2, index: 1 };
      utils.isRangeMoreThan(a, b).should.equal(true);
    });
    it('should return more than if index is more than', function() {
      var b = { height: 1, index: 0 };
      var a = { height: 1, index: 1 };
      utils.isRangeMoreThan(a, b).should.equal(true);
    });
    it('should return false if equal', function() {
      var b = { height: 1, index: 1 };
      var a = { height: 1, index: 1 };
      utils.isRangeMoreThan(a, b).should.equal(false);
    });
    it('should return false if height is greater than', function() {
      var b = { height: 2, index: 1 };
      var a = { height: 1, index: 1 };
      utils.isRangeMoreThan(a, b).should.equal(false);
    });
    it('should return false if index is greater than', function() {
      var b = { height: 1, index: 2 };
      var a = { height: 1, index: 1 };
      utils.isRangeMoreThan(a, b).should.equal(false);
    });
  });
});
