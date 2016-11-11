'use strict';

//things this is checking
//1. tx's:   do both reports have the same tx's, if not why not? For the missing txs in each report, check the confirmation counts and query insight for details
//2. tx amounts: for the txs that are common between the reports, do the amounts match exact, if not, show the ones that don't match
//3. Are there any duplicate lines in the new report. Lines matching tx, category, amount, output index (if it has one)
//4. addresses:   do both reports reference the same addresses, if not why not? If missing addresses, are those addresses associated with the missing txs in check #1?
//  Are the missing addresses associated with "move" type transactions on the new report? If so, that is the reason that they are missing from the new report. As long as the txs match, all is well.
//5. fees:   the old reports does not have a separate fee line for a transaction, therefore the new report will have one extra line showing a fee.
//6. Total number of records on each report.
//7. Records per tx: on the new report, how many records per txid?

var request = require('request');
var async = require('async');
var clc = require('cli-color');

var listtransactions = require('./files/oldreport.json');
var gettransactions = require('./files/chrisreport2.json');
var lt = {};
var gt = {};
var addressLT = {};
var addressGT = {};
var inLTNotGT = {};
var inGTNotLT = {};
var addressInLTNotGT = {};
var addressInGTNotLT = {};
var amountDiff = {};
var url = 'https://insight.bitpay.com/api/tx/';
var apiUrl;
var txid;
var compositeKey;
var diff;
var searchBlockchain = true;

function setAmount(item, output, addressOutput) {
  var amount;
  if (item.satoshis) {
    amount = Math.round(((item.satoshis || 0) + (item.fee || 0)));
  } else {
    amount = Math.round((((item.amount || 0) * 1E8) + ((item.fee || 0) * 1E8)));
  }
  if (output[item.txid]) {
    output[item.txid].amount += amount;
  } else {
    output[item.txid] = {
      amount: amount,
      address: (item.address || 0)
    };
  }
  if (item.address) {
    if (!addressOutput[item.address]) {
      addressOutput[item.address] = [item.txid];
    } else {
      addressOutput[item.address].push(item.txid);
    }
  }
}

function setDifferenceItem(input, item, output, key) {
  if (input && !input[item[key]]) {
    output[item[key]] = {
      confirmations: item.confirmations,
      address: (item.address || 0)
    };
  }
}

function setMaxMinTime(item, opts) {
  var btime;
  btime = item.blockTime || item.blocktime;
  if (opts.oldest.time > btime) {
    opts.oldest = {
      time: btime,
      hash: item.blockHash || item.blockhash
    };
  }
  if (opts.newest.time < btime) {
    opts.newest = {
      time: btime,
      hash: item.blockHash || item.blockhash
    };
  }
}

function getCount(countObj, opts) {
  if (!opts.repeats && !opts.recordsPerTxid) {
    return;
  }
  if (countObj.recordsPerTxid && opts.recordsPerTxid[countObj.recordsPerTxid]) {
    opts.recordsPerTxid[countObj.recordsPerTxid]++;
  } else if (countObj.recordsPerTxid && !opts.recordsPerTxid[countObj.recordsPerTxid]) {
    opts.recordsPerTxid[countObj.recordsPerTxid] = 1;
  }
  if (countObj.repeats && opts.repeats[countObj.repeats]) {
    opts.repeats[countObj.repeats]++;
  } else if (countObj.repeats && !opts.repeats[countObj.repeats]) {
    opts.repeats[countObj.repeats] = 1;
  }
}

function loopOverReport(report, output, opts) {
  for(var i = 0; i < report.length; i++) {
    opts.linesInFile++;
    txid = report[i].txid;
    compositeKey = report[i].txid + report[i].address + report[i].category + (report[i].satoshis || report[i].amount) + (report[i].outputIndex || 0);
    setAmount(report[i], output, opts.addressOutput);
    setDifferenceItem(opts.otherOutput, report[i], opts.differenceSet, 'txid');
    setDifferenceItem(opts.otherAddressOutput, report[i], opts.addressDifferenceSet, 'address');
    setMaxMinTime(report[i], opts);
    if (report[i].category === 'fee') {
      opts.feeLines++;
    }
    getCount({
      repeats: compositeKey,
      recordsPerTxid: txid
    }, opts);
  }
}

var optsGT = {
  otherReport: listtransactions,
  oldest: {time: 4E9, hash: 0},
  newest: {time: 0, hash: 0},
  repeats: {},
  recordsPerTxid: {},
  feeLines: 0,
  linesInFile: 0,
  addressOutput: addressGT
};
loopOverReport(gettransactions, gt, optsGT);

var optsLT = {
  otherReport: gettransactions,
  oldest: {time: 4E9, hash: 0},
  newest: {time: 0, hash: 0},
  otherOutput: gt,
  otherAddressOutput: addressGT,
  differenceSet: inLTNotGT,
  addressDifferenceSet: addressInLTNotGT,
  linesInFile: 0,
  addressOutput: addressLT
};
loopOverReport(listtransactions, lt, optsLT);

for(var i = 0; i < gettransactions.length; i++) {
  txid = gettransactions[i].txid;
  if (gettransactions[i].address) {
    var address = gettransactions[i].address;
  }
  if(!addressLT[address]) {
    addressInGTNotLT[address] = true;
  }
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
var addressInLTNotGTKeys = Object.keys(addressInLTNotGT);
var addressInGTNotLTKeys = Object.keys(addressInGTNotLT);
var listTxNum = Object.keys(lt).length;
var getTxNum = Object.keys(gt).length;
var diff = Math.abs(getTxNum - listTxNum);

if (listTxNum > getTxNum) {
  var hasMore = 'Old Report';
  var hasLess = 'New Report';
}
console.log(clc.green('Starting report...'));

console.log('');
console.log(clc.red('Old Report') + ' refers to "list transactions" coming from bitcoind.');
console.log(clc.blueBright('Get transactions') + ' refers to "get transactions" coming from bwdb.');

console.log('');
console.log('Found: ' + clc.red(optsLT.linesInFile) + clc.yellow(' total records') + ' in old report.');
console.log('Found: ' + clc.blueBright(optsGT.linesInFile) + clc.yellow(' total records') + ' in new report.');
console.log('Difference in the number of records: ' + clc.green(Math.abs(optsLT.linesInFile - optsGT.linesInFile)));

console.log('');
console.log('Found: ' + clc.red(listTxNum) + ' transactions in old report.');
console.log('Found: ' + clc.blueBright(getTxNum) + ' transactions in new report.');

console.log('');
console.log('Found: ' + clc.red(Object.keys(addressLT).length) + ' addresses in old report.');
console.log('Found: ' + clc.blueBright(Object.keys(addressGT).length) + ' addresses in new report.');

console.log('');
console.log(hasMore + ' has: ' + clc.red(diff) + ' more transactions than ' + hasLess);

console.log('');
console.log('Oldest block time reported in old report: ' + clc.red(new Date(optsLT.oldest.time * 1000)));
console.log('Newest block time reported in old report: ' + clc.red(new Date(optsLT.newest.time * 1000)));
console.log('Oldest block hash reported in old report: ' + clc.red(optsLT.oldest.hash));
console.log('Newest block hash reported in old report: ' + clc.red(optsLT.newest.hash));

console.log('');
console.log('Oldest block time reported in new report: ' + clc.blueBright(new Date(optsGT.oldest.time * 1000)));
console.log('Newest block time reported in new report: ' + clc.blueBright(new Date(optsGT.newest.time * 1000)));
console.log('Oldest block hash reported in new report: ' + clc.blueBright(optsGT.oldest.hash));
console.log('Newest block hash reported in new report: ' + clc.blueBright(optsGT.newest.hash));

console.log('');
console.log('There were: ' + clc.red(addressInLTNotGTKeys.length) + ' addresses that appeared in old report but did not appear in new report.');
console.log('There were: ' + clc.blueBright(addressInGTNotLTKeys.length) + ' addresses that appeared in new report but did not appear in old report.');

console.log('');
//are all the missing addresses from the missing txids?
var addressCount = 0;
for(var i = 0; i < inLTNotGTKeys.length; i++) {
  var index = addressInLTNotGTKeys.indexOf(inLTNotGT[inLTNotGTKeys[i]].address);
  if (index > -1) {
    addressCount++;
    addressInLTNotGTKeys.splice(index, 1);
  }
}
console.log('Addresses: ' + clc.green(addressInLTNotGTKeys) + clc.red(' NOT') + ' in the group of missing transactions meaning it probably should be in the result set!');
for(i = 0; i < addressInLTNotGTKeys.length; i++) {
  var key = addressInLTNotGTKeys[i];
  console.log('Address: ' + clc.green(key) + ' is associated with: ' + clc.red(addressLT[key].length) + ' transactions');
  //are any of these transactions NOT in the new report
  for(var j = 0; j < addressLT[key].length; j++) {
    if (!gt[addressLT[key][j]]) {
      console.log('Tx: ' + addressLT[key][j] + ' should be in new report list of transactions but isn\'t');
    }
  }
}

console.log('');
console.log('Number of addresses that should be part of new report list: ' + clc.green(addressInLTNotGTKeys.length));

console.log('');
console.log('There were: ' + clc.red(inLTNotGTKeys.length) + ' transactions that appeared in old report but did not appear in new report.');
console.log('There were: ' + clc.blueBright(inGTNotLTKeys.length) + ' transactions that appeared in new report but did not appear in old report.');

console.log('');
console.log('Checking if any of the txs that exist in both reports have any differences...');

var diffKeys = Object.keys(amountDiff);
var logged = false;
for(var i = 0; i < diffKeys.length; i++) {
  logged = true;
  console.log('Tx: ' + diffKeys[i] + ' has a difference of: ' + amountDiff[diffKeys[i]]);
}
if (!logged) {
  console.log(clc.green('Report no differences in any tx amounts.'));
}
logged = false;

console.log('');
console.log('Checking if there are duplicate records the in new report...');
var repeatKeys = Object.keys(optsGT.repeats);
for(i = 0; i < repeatKeys.length; i++) {
  logged = true;
  var repeatNum = optsGT.repeats[repeatKeys[i]];
  if (repeatNum > 1) {
    console.log('There are: ' + clc.yellow(repeatNum) + clc.red(' repeated entries') + ' in the new report for: ' + clc.green(repeatKeys[i]) + '.');
  }
}
if (!logged) {
  console.log(clc.green('Report no dupes in reports.'));
}
logged = false;

console.log('');
console.log('Checking records per txid the in new report...');
var recordsPerTxid = Object.keys(optsGT.recordsPerTxid);
var additionalRecords = 0;
for(i = 0; i < recordsPerTxid.length; i++) {
  logged = true;
  var recordsNum = optsGT.recordsPerTxid[recordsPerTxid[i]];
  if (recordsNum > 1) {
    //console.log('There are: ' + clc.yellow(recordsNum) +  clc.green(' records per txid') + ' in the new report for:' + clc.green(recordsPerTxid[i]) + '.');
    additionalRecords+=(recordsNum - 1);
  }
}
if (additionalRecords) {
  console.log('Report has: ' + clc.green(additionalRecords) + ' additional records for existing tx ids, compare this to the difference in the total number of records: ' + clc.green(Math.abs(optsLT.linesInFile - optsGT.linesInFile)));
}
if (!logged) {
  console.log(clc.green('Report has no records per txid.'));
}
logged = false;

console.log('Number of records that are category, "fee": ' + clc.green(optsGT.feeLines));

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
