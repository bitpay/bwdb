'use strict';

var crypto = require('crypto');
var Writable = require('stream').Writable;
var inherits = require('util').inherits;
var assert = require('assert');
var fs = require('fs');

var async = require('async');
var bitcore = require('bitcore-lib');
var BitcoinRPC = require('bitcoind-rpc');
var mkdirp = require('mkdirp');
var _ = require('lodash');

var exports = {};

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
exports.readJSONFile = function(path, callback) {
  fs.readFile(path, function(err, file) {
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

exports.tryAllClients = function(obj, func, callback) {
  var clientIndex = obj._clientsIndex;
  var retry = function(done) {
    var client = obj._clients[clientIndex];
    clientIndex = (clientIndex + 1) % obj._clients.length;
    func(client, done);
  };
  async.retry({times: obj._clients.length, interval: 1000}, retry, callback);
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
    buffers.push(buffer.slice(pos, size));
    pos += size;
  }
  return buffers;
};

module.exports = exports;
