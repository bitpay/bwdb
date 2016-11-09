'use strict';

//things this is checking
//tx's: which ones does each report have
//tx amounts: do they match?
// look up the missing txs on the blockchain

var request = require('request');
var async = require('async');
var clc = require('cli-color');

var listtransactions = require('./files/oldreport.json');
var gettransactions = require('./files/newreport.json');
var lt = {};
var gt = {};
var inLTNotGT = {};
var inGTNotLT = {};
var amountDiff = {};
var oldest = 4E9;
var newest = 0;
var url = 'https://insight.bitpay.com/api/tx/';
var apiUrl;
var txid;
var diff;
var searchBlockchain = true;

function setAmount(item, output) {
  var amount;
  if (item.satoshis) {
    amount = Math.round(((item.satoshis || 0) + (item.fee || 0)));
  } else {
    amount = Math.round((((item.amount || 0) * 1E8) + ((item.fee || 0) * 1E8)));
  }
  if (output[txid]) {
    output[txid].amount += amount;
  } else {
    output[txid] = {
      amount: amount
    };
  }
}

function setDifferenceItem(input, item, output) {
  if (input && !input[txid]) {
    output[txid] = {
      confirmations: item.confirmations
    };
  }
}

function setMaxMinTime(item, opts) {
  var btime;
  btime = item.blockTime || item.blocktime;
  if (opts.oldest > btime) {
    opts.oldest = btime;
  }
  if (opts.newest < btime) {
    opts.newest = btime;
  }
}

function loopOverReport(report, output, opts) {
  for(var i = 0; i < report.length; i++) {
    txid = report[i].txid;
    setAmount(report[i], output);
    setDifferenceItem(opts.otherOutput, report[i], opts.differenceSet);
    setMaxMinTime(report[i], opts);
  }
}

var optsGT = {
  otherReport: listtransactions,
  oldest: oldest,
  newest: newest
};
loopOverReport(gettransactions, gt, optsGT);

var optsLT = {
  otherReport: gettransactions,
  oldest: oldest,
  newest: newest,
  otherOutput: gt,
  differenceSet: inLTNotGT,
};
loopOverReport(listtransactions, lt, optsLT);

for(var i = 0; i < gettransactions.length; i++) {
  txid = gettransactions[i].txid;
  if (!lt[txid]) {
    inGTNotLT[txid] = true;
  } else {
    diff = gt[txid].amount - lt[txid].amount;
    if (diff !== 0) {
      amountDiff[txid] = diff;
    }
  }
}


var inLTNotGTKeys = Object.keys(inLTNotGT);
var inGTNotLTKeys = Object.keys(inGTNotLT);
var listTxNum = Object.keys(lt).length;
var getTxNum = Object.keys(gt).length;
var diff = Math.abs(getTxNum - listTxNum);

if (listTxNum > getTxNum) {
  var hasMore = 'List transactions';
  var hasLess = 'Get transactions';
}
console.log(clc.green('Starting report...'));

console.log('');
console.log(clc.red('List transactions') + ' refers to the old report coming from bitcoind.');
console.log(clc.blueBright('Get transactions') + ' refers to the new report coming from bwdb.');

console.log('');
console.log('Found: ' + clc.red(listTxNum) + ' in list transactions (bitcoin rpc) report.');
console.log('Found: ' + clc.blueBright(getTxNum) + ' in get transactions (bwdb) report.');

console.log('');
console.log(hasMore + ' has: ' + clc.red(diff) + ' more transactions than ' + hasLess);

console.log('');
console.log('Oldest block time reported in list transactions: ' + clc.red(new Date(optsLT.oldest * 1000)));
console.log('Newest block time reported in list transactions: ' + clc.red(new Date(optsLT.newest * 1000)));

console.log('');
console.log('Found: ' + clc.red(listTxNum) + ' in list transactions (bitcoin rpc) report.');
console.log('Oldest block time reported in get transactions: ' + clc.blueBright(new Date(optsGT.oldest * 1000)));
console.log('Newest block time reported in get transactions: ' + clc.blueBright(new Date(optsGT.newest * 1000)));

console.log('');
console.log('There were: ' + clc.red(inLTNotGTKeys.length) + ' transactions that appeared in list transactions but did not appear in get transactions.');
console.log('There were: ' + clc.blueBright(inGTNotLTKeys.length) + ' transactions that appeared in get transactions but did not appear in list transactions.');

if (searchBlockchain) {
  console.log('');
  console.log('Looking up each transaction in list transactions but not in get transactions...');

  async.eachLimit(inLTNotGTKeys, 3, function(tx, next) {
    apiUrl = url + tx;
    request(apiUrl, function(err, res) {
      if (res.statusCode === 404) {
        console.log('Tx: ' + clc.green(tx) + ' was ' + clc.red('not') + ' found on the blockchain. Confirmation count on report: ' + clc.yellow(inLTNotGT[tx].confirmations));
      } else if (!err && res.statusCode === 200) {
        console.log('Tx: ' + clc.green(tx) + clc.green('was found') + ' on the blockchain. Confirmation count on report: ' + clc.yellow(inLTNotGT[tx].confirmations));
      } else {
        console.log('Tx: ' + clc.green(tx) + clc.red(' there was another error attempting to retrieve information for this tx. Here is the status code: ') + clc.yellow(res.statusCode));
      }
      next(err, null);
    });
  });
}

console.log('');
console.log('Checking if any of the txs that exist in both reports have any differences...');

var diffKeys = Object.keys(amountDiff);
var loggedDiff = false;
for(var m = 0; m < diffKeys.length; m++) {
  loggedDiff = true;
  console.log('Tx: ' + diffKeys[m] + ' has a difference of: ' + amountDiff[diffKeys[m]]);
}
if (!loggedDiff) {
  console.log(clc.green('Report no differences in any tx amounts.'));
}
