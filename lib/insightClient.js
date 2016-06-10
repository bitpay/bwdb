'use strict';

function InsightClient() {
  //
}

//getRawBlockByHeight

//getInfo

module.exports = InsightClient;


// 'use strict';
//
// var _ = require('lodash');
// var $ = require('preconditions').singleton();
// var log = require('npmlog');
// log.debug = log.verbose;
// var io = require('socket.io-client');
// var requestList = require('./request-list');
//
// function Insight(opts) {
//   $.checkArgument(opts);
//   $.checkArgument(_.contains(['livenet', 'testnet'], opts.network));
//   $.checkArgument(opts.url);
//
//   this.apiPrefix = opts.apiPrefix || '/api';
//   this.network = opts.network || 'livenet';
//   this.hosts = opts.url;
//   this.userAgent = opts.userAgent || 'bws';
// }
//
//
// var _parseErr = function(err, res) {
//   if (err) {
//     log.warn('Insight error: ', err);
//     return "Insight Error";
//   }
//   log.warn("Insight " + res.request.href + " Returned Status: " + res.statusCode);
//   return "Error querying the blockchain";
// };
//
// Insight.prototype._doRequest = function(args, cb) {
//   var opts = {
//     hosts: this.hosts,
//     headers: {
//       'User-Agent': this.userAgent,
//     }
//   };
//   requestList(_.defaults(args, opts), cb);
// };
//
// Insight.prototype.getConnectionInfo = function() {
//   return 'Insight (' + this.network + ') @ ' + this.hosts;
// };
//
// /**
//  * Retrieve a list of unspent outputs associated with an address or set of addresses
//  */
// Insight.prototype.getUtxos = function(addresses, cb) {
//   var url = this.url + this.apiPrefix + '/addrs/utxo';
//   var args = {
//     method: 'POST',
//     path: this.apiPrefix + '/addrs/utxo',
//     json: {
//       addrs: [].concat(addresses).join(',')
//     },
//   };
//
//
//   this._doRequest(args, function(err, res, unspent) {
//     if (err || res.statusCode !== 200) return cb(_parseErr(err, res));
//     return cb(null, unspent);
//   });
// };
//
// /**
//  * Broadcast a transaction to the bitcoin network
//  */
// Insight.prototype.broadcast = function(rawTx, cb) {
//   var args = {
//     method: 'POST',
//     path: this.apiPrefix + '/tx/send',
//     json: {
//       rawtx: rawTx
//     },
//   };
//
//   this._doRequest(args, function(err, res, body) {
//     if (err || res.statusCode !== 200) return cb(_parseErr(err, res));
//     return cb(null, body ? body.txid : null);
//   });
// };
//
// Insight.prototype.getTransaction = function(txid, cb) {
//   var args = {
//     method: 'GET',
//     path: this.apiPrefix + '/tx/' + txid,
//     json: true,
//   };
//
//   this._doRequest(args, function(err, res, tx) {
//     if (res && res.statusCode === 404) return cb();
//
//     if (err || res.statusCode !== 200)
//       return cb(_parseErr(err, res));
//
//     return cb(null, tx);
//   });
// };
//
// Insight.prototype.getTransactions = function(addresses, from, to, cb) {
//   var qs = [];
//   if (_.isNumber(from)) qs.push('from=' + from);
//   if (_.isNumber(to)) qs.push('to=' + to);
//
//   var args = {
//     method: 'POST',
//     path: this.apiPrefix + '/addrs/txs' + (qs.length > 0 ? '?' + qs.join('&') : ''),
//     json: {
//       addrs: [].concat(addresses).join(',')
//     },
//   };
//
//   this._doRequest(args, function(err, res, txs) {
//     if (err || res.statusCode !== 200) return cb(_parseErr(err, res));
//
//     if (_.isObject(txs) && txs.items)
//       txs = txs.items;
//
//     // NOTE: Whenever Insight breaks communication with bitcoind, it returns invalid data but no error code.
//     if (!_.isArray(txs) || (txs.length !== _.compact(txs).length)) return cb(new Error('Could not retrieve transactions from blockchain. Request was:' + JSON.stringify(args)));
//
//     return cb(null, txs);
//   });
// };
//
// Insight.prototype.getAddressActivity = function(address, cb) {
//   var self = this;
//
//   var args = {
//     method: 'GET',
//     path: self.apiPrefix + '/addr/' + address,
//     json: true,
//   };
//
//   this._doRequest(args, function(err, res, result) {
//     if (res && res.statusCode == 404) return cb();
//     if (err || res.statusCode !== 200)
//       return cb(_parseErr(err, res));
//
//     var nbTxs = result.unconfirmedTxApperances + result.txApperances;
//     return cb(null, nbTxs > 0);
//   });
// };
//
// Insight.prototype.estimateFee = function(nbBlocks, cb) {
//   var path = this.apiPrefix + '/utils/estimatefee';
//   if (nbBlocks) {
//     path += '?nbBlocks=' + [].concat(nbBlocks).join(',');
//   }
//
//   var args = {
//     method: 'GET',
//     path: path,
//     json: true,
//   };
//
//   this._doRequest(args, function(err, res, body) {
//     if (err || res.statusCode !== 200) return cb(_parseErr(err, res));
//     return cb(null, body);
//   });
// };
//
// Insight.prototype.initSocket = function() {
//
//   // sockets always use the first server on the pull
//   var socket = io.connect(_.first([].concat(this.hosts)), {
//     'reconnection': true,
//   });
//   return socket;
// };
//
// // param can be a height or a hash
// Insight.prototype.getRawBlock = function(param, callback) {
//   var path = this.apiPrefix + '/rawblock/' + param;
//
//   var args = {
//     method: 'GET',
//     path: path,
//     json: true
//   };
//
//   this._doRequest(args, function(err, res, body) {
//     if (err) {
//       return callback(err);
//     }
//
//     if (res.statusCode === 404) {
//       //insight does not have the block at this height or hash yet
//       return callback();
//     }
//
//     if (res.statusCode !== 200) {
//       return callback(new Error(res.statusCode + ' status code: ' + body));
//     }
//
//     if (body.rawblock === undefined) {
//       return callback(new Error('no rawblock in response from insight'));
//     }
//
//     callback(null, body.rawblock);
//   });
// };
//
// Insight.prototype.getRawBlockByHeight = function(height, callback) {
//   // this.getRawBlock(height, callback);
//   var self = this;
//   this.getBlockHashAtHeight(height, function(err, blockHash) {
//     if (err) {
//       return callback(err);
//     }
//
//     self.getRawBlockByHash(blockHash, callback);
//   });
// };
//
// Insight.prototype.getBlockHashAtHeight = function(height, callback) {
//   var path = this.apiPrefix + '/block-index/' + height;
//
//   var args = {
//     method: 'GET',
//     path: path,
//     json: true
//   };
//
//   this._doRequest(args, function(err, res, body) {
//     if (err) {
//       return callback(err);
//     }
//
//     if (res.statusCode !== 200) {
//       return callback(new Error(res.statusCode + ' status code: ' + body));
//     }
//
//     if (!body.blockHash) {
//       return callback(new Error('no blockHash in response from insight'));
//     }
//
//     callback(null, body.blockHash);
//   });
// };
//
// Insight.prototype.getRawBlockByHash = function(hash, callback) {
//   this.getRawBlock(hash, callback);
// };
//
// Insight.prototype.getInfo = function(callback) {
//   var path = this.apiPrefix + '/status';
//   var queryString = {
//     q: 'getInfo'
//   };
//
//   var args = {
//     method: 'GET',
//     path: path,
//     qs: queryString,
//     json: true
//   };
//
//   this._doRequest(args, function(err, res, body) {
//     if (err) {
//       return callback(err);
//     }
//
//     if (res.statusCode !== 200) {
//       return callback(new Error(res.statusCode + ' status code: ' + body));
//     }
//
//     if (!body.info) {
//       return callback(new Error('no info in response from insight'));
//     }
//
//     callback(null, body.info);
//   });
// };
//
// module.exports = Insight;
