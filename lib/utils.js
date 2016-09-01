'use strict';

var path = require('path');
var spawn = require('child_process').spawn;
var crypto = require('crypto');
var Writable = require('stream').Writable;
var inherits = require('util').inherits;
var assert = require('assert');
var fs = require('fs');
var crypto = require('crypto');

var async = require('async');
var BitcoinRPC = require('bitcoind-rpc');
var mkdirp = require('mkdirp');
var ttyread = require('ttyread');
var scrypt = require('scrypt');
var _ = require('lodash');

var exports = {};

exports.isInteger = function(value) {
  return typeof value === 'number' &&
    isFinite(value) &&
    Math.floor(value) === value;
};

/**
 * Will create a directory if it does not already exist.
 *
 * @param {String} directory - An absolute path to the directory
 * @param {Function} callback
 */
exports.setupDirectory = function(directory, callback) {
  fs.access(directory, function(err) {
    if (err && err.code === 'ENOENT') {
      return mkdirp(directory, callback);
    } else if (err) {
      return callback(err);
    }
    callback();
  });
};

/**
 * This will split a range of numbers "a" to "b" by sections
 * of the length "max".
 *
 * Example:
 * > var range = utils.splitRange(1, 10, 3);
 * > [[1, 3], [4, 6], [7, 9], [10, 10]]
 *
 * @param {Number} a - The start index (lesser)
 * @param {Number} b - The end index (greater)
 * @param {Number} max - The maximum section length
 */
exports.splitRange = function(a, b, max) {
  assert(b > a, '"b" is expected to be greater than "a"');
  var sections = [];
  var delta = b - a;
  var first = a;
  var last = a;

  var length = Math.floor(delta / max);
  for (var i = 0; i < length; i++) {
    last = first + max - 1;
    sections.push([first, last]);
    first += max;
  }

  if (last <= b) {
    sections.push([first, b]);
  }

  return sections;
};

/**
 * This will read a JSON file and give back the result
 *
 * @param {String} path - The path to the file
 * @param {Function} callback
 */
exports.readJSONFile = function(filePath, callback) {
  fs.readFile(filePath, function(err, file) {
    if (err) {
      return callback(err);
    }
    var json;
    try {
      json = JSON.parse(file);
    } catch(err) {
      return callback(err);
    }
    callback(null, json);
  });
};

exports.readWalletDatFile = function(filePath, network, callback) {
  var datadir = path.dirname(filePath);
  var name = path.basename(filePath);
  var options = ['-datadir=' + datadir, '-wallet=' + name];
  if (network === 'testnet') {
    options.push('-testnet');
  } else if (network === 'regtest') {
    options.push('-regtest');
  }
  // TODO use ../node_modules/.bin/wallet-utility
  var exec = path.resolve(__dirname, '../node_modules/bitcore-node/bin/bitcoin-0.12.1/bin/wallet-utility');
  var wallet = spawn(exec, options);

  var result = '';

  wallet.stdout.on('data', function(data) {
    result += data.toString('utf8');
  });

  var error;

  wallet.stderr.on('data', function(data) {
    error = data.toString();
  });

  wallet.on('close', function(code) {
    if (code === 0) {
      var addresses;
      try {
        addresses = JSON.parse(result);
        addresses = addresses.map(function(entry) {
          return entry.addr ? entry.addr : entry;
        });
      } catch(err) {
        return callback(err);
      }
      return callback(null, addresses);
    } else if (error) {
      return callback(new Error(error));
    } else {
      var message = 'wallet-utility exited (' + code + '): ' + result;
      return callback(new Error(message));
    }
  });
};

exports.readWalletFile = function(filePath, network, callback) {
  if (/\.dat$/.test(filePath)) {
    exports.readWalletDatFile(filePath, network, callback);
  } else if (/\.json$/.test(filePath)) {
    exports.readJSONFile(filePath, callback);
  } else {
    callback(new Error('"dat" or "json" file extension is expected'));
  }
};

/**
 * This will split an array into smaller arrays by size
 *
 * @param {Array} array
 * @param {Number} size - The length of resulting smaller arrays
 */
exports.splitArray = function(array, size) {
  var results = [];
  while (array.length) {
    results.push(array.splice(0, size));
  }
  return results;
};

/**
 * Utility to get the remote ip address from cloudflare headers.
 *
 * @param {Object} req - An express request object
 */
exports.getRemoteAddress = function(req) {
  if (req.headers['cf-connecting-ip']) {
    return req.headers['cf-connecting-ip'];
  }
  return req.socket.remoteAddress;
};

/**
 * A middleware to enable CORS
 *
 * @param {Object} req - An express request object
 * @param {Object} res - An express response object
 * @param {Function} next
 */
exports.enableCORS = function(req, res, next) {
  res.header('access-control-allow-origin', '*');
  res.header('access-control-allow-methods', 'GET, HEAD, PUT, POST, OPTIONS');
  var allowed = [
    'origin',
    'x-requested-with',
    'content-type',
    'accept',
    'content-length',
    'cache-control',
    'cf-connecting-ip'
  ];
  res.header('access-control-allow-headers', allowed.join(', '));

  var method = req.method && req.method.toUpperCase && req.method.toUpperCase();

  if (method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
  } else {
    next();
  }
};

/**
 * Will send error to express response
 *
 * @param {Error} err - error object
 * @param {Object} res - express response object
 */
exports.sendError = function(err, res) {
  if (err.statusCode)  {
    res.status(err.statusCode).send(err.message);
  } else {
    console.error(err.stack);
    res.status(503).send(err.message);
  }
};

/**
 * Will create a writeable logger stream
 *
 * @param {Function} logger - Function to log information
 * @returns {Stream}
 */
exports.createLogStream = function(logger) {
  function Log(options) {
    Writable.call(this, options);
  }
  inherits(Log, Writable);

  Log.prototype._write = function (chunk, enc, callback) {
    logger(chunk.slice(0, chunk.length - 1)); // remove new line and pass to logger
    callback();
  };
  var stream = new Log();

  return stream;
};

exports.getTaskId = function() {
  return crypto.randomBytes(4).toString('hex');
};

exports.getClients = function(clientsConfig) {
  var clients = [];
  for (var i = 0; i < clientsConfig.length; i++) {
    var config = clientsConfig[i];
    var remoteClient = new BitcoinRPC({
      protocol: config.rpcprotocol || 'http',
      host: config.rpchost || '127.0.0.1',
      port: config.rpcport,
      user: config.rpcuser,
      pass: config.rpcpassword,
      rejectUnauthorized: _.isUndefined(config.rpcstrict) ? true : config.rpcstrict
    });
    clients.push(remoteClient);
  }
  return clients;
};

exports.setClients = function(obj, clients) {
  obj._clients = clients;
  obj._clientsIndex = 0;
  Object.defineProperty(obj, 'clients', {
    get: function() {
      var client = obj._clients[obj._clientsIndex];
      obj._clientsIndex = (obj._clientsIndex + 1) % obj._clients.length;
      return client;
    },
    enumerable: true,
    configurable: false
  });
};

exports.tryAllClients = function(obj, func, options, callback) {
  if (_.isFunction(options)) {
    callback = options;
    options = {};
  }
  var clientIndex = obj._clientsIndex;
  var retry = function(done) {
    var client = obj._clients[clientIndex];
    clientIndex = (clientIndex + 1) % obj._clients.length;
    func(client, done);
  };
  async.retry({times: obj._clients.length, interval: options.interval || 1000}, retry, callback);
};

exports.wrapRPCError = function(errObj) {
  var err = new Error(errObj.message);
  err.code = errObj.code;
  return err;
};

var PUBKEYHASH = new Buffer('01', 'hex');
var SCRIPTHASH = new Buffer('02', 'hex');

exports.getAddressTypeString  = function(bufferArg) {
  var buffer = bufferArg;
  if (!Buffer.isBuffer(bufferArg)) {
    buffer = new Buffer(bufferArg, 'hex');
  }
  var type = buffer.slice(0, 1);
  if (type.compare(PUBKEYHASH) === 0) {
    return 'pubkeyhash';
  } else if (type.compare(SCRIPTHASH) === 0) {
    return 'scripthash';
  } else {
    throw new TypeError('Unknown address type');
  }
};

exports.getAddressTypeBuffer = function(address) {
  var type;
  if (address.type === 'pubkeyhash') {
    type = PUBKEYHASH;
  } else if (address.type === 'scripthash') {
    type = SCRIPTHASH;
  } else {
    throw new TypeError('Unknown address type');
  }
  return type;
};

exports.splitBuffer = function(buffer, size) {
  var pos = 0;
  var buffers = [];
  while (pos < buffer.length) {
    buffers.push(buffer.slice(pos, pos + size));
    pos += size;
  }
  return buffers;
};

exports.exitWorker = function(worker, timeout, callback) {
  assert(worker, '"worker" is expected to be defined');
  var exited = false;
  worker.once('exit', function(code) {
    if (!exited) {
      exited = true;
      if (code !== 0) {
        var error = new Error('Worker did not exit cleanly: ' + code);
        error.code = code;
        return callback(error);
      } else {
        return callback();
      }
    }
  });
  worker.kill('SIGINT');
  setTimeout(function() {
    if (!exited) {
      exited = true;
      worker.kill('SIGKILL');
      return callback(new Error('Worker exit timeout, force shutdown'));
    }
  }, timeout).unref();
};

exports.timestampToISOString = function(timestamp) {
  return new Date(timestamp * 1000).toISOString();
};

exports.satoshisToBitcoin = function(satoshis) {
  return satoshis / 100000000;
};

exports.getPassphrase = function(callback) {
  ttyread('Enter passphrase: ', {silent: true}, callback);
};

exports.acquirePassphrase = function(callback) {
  var first;
  var second;
  async.doWhilst(function(next) {
    ttyread('Enter passphrase: ', {silent: true}, function(err, result) {
      if (err) {
        return callback(err);
      }
      first = result;
      ttyread('Re-enter passphrase: ', {silent: true}, function(err, result) {
        second = result;
        next();
      });
    });
  }, function() {
    if (first !== second) {
      console.log('Passphrases do not match, please re-enter.');
      return true;
    }
    return false;
  }, function(err) {
    if (err) {
      return callback(err);
    }
    callback(null, first);
  });
};

exports.xorBuffer = function(a, b) {
  var length = Math.max(a.length, b.length);
  var buf = new Buffer(new Array(length));
  for (var i = 0; i < length; i++) {
    /* jshint bitwise: false */
    buf[i] = a[i] ^ b[i];
  }
  return buf;
};

exports.hashPassphrase = function(passphrase, salt, callback) {
  scrypt.hash(passphrase, { N: Math.pow(2, 14), r: 8, p: 8 }, 64, salt, function(err, res) {
    if (err) {
      return callback(err);
    }
    callback(null, res);
  });
};

exports.encryptSecret = function(opts, callback) {
  exports.hashPassphrase(opts.passphrase, opts.salt, function(err, hashedPassphrase) {
    if (err) {
      return callback(err);
    }
    var secret = opts.secret || crypto.randomBytes(32);
    assert(Buffer.isBuffer(secret), 'secret is expected to be a buffer');
    var firstHalf = hashedPassphrase.slice(0, 32);
    var secondHalf = hashedPassphrase.slice(32, 64);
    var xorSecret = exports.xorBuffer(secret, firstHalf);
    var cipherStream = crypto.createCipheriv('aes-256-ecb', secondHalf, new Buffer(0));
    var cipherText = Buffer.concat([cipherStream.update(xorSecret), cipherStream.final()]).toString('hex');
    return callback(null, cipherText);
  });
};

exports.decryptSecret = function(opts, callback) {
  exports.hashPassphrase(opts.passphrase, opts.salt, function(err, hashedPassphrase) {
    if (err) {
      return callback(err);
    }
    var cipherText = new Buffer(opts.cipherText, 'hex');
    var firstHalf = hashedPassphrase.slice(0, 32);
    var secondHalf = hashedPassphrase.slice(32, 64);
    var cipherStream = crypto.createDecipheriv('aes-256-ecb', secondHalf, new Buffer(0));
    var xorSecret;
    try {
      xorSecret = Buffer.concat([cipherStream.update(cipherText), cipherStream.final()]);
    } catch(e) {
      return callback(e);
    }
    var secret = exports.xorBuffer(xorSecret, firstHalf);
    callback(null, secret);
  });
};

exports.confirm = function(question, callback) {
  ttyread(question + ' (y/N): ', function(err, answer) {
    if (err) {
      return callback(err, false);
    }
    if (answer === 'y') {
      return callback(null, true);
    }
    callback(null, false);
  });
};

exports.generateSecret = function(callback) {
  exports.acquirePassphrase(function(err, passphrase) {
    if (err) {
      return callback(err);
    }
    var salt = crypto.randomBytes(32).toString('hex');
    exports.encryptSecret({
      passphrase: passphrase,
      salt: salt
    }, function(err, cipherText) {
      if (err) {
        return callback(err);
      }
      callback(null, cipherText, salt);
    });
  });
};

exports.generateNonce = function() {
  var nonce = new Buffer(new Array(12));
  nonce.writeDoubleBE(Date.now());
  nonce.writeUInt32BE(process.hrtime()[1], 8);
  return nonce;
};

module.exports = exports;
