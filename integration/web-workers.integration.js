'use strict';

var net = require('net');
var path = require('path');
var crypto = require('crypto');
var spawn = require('child_process').spawn;
var mkdirp = require('mkdirp');
var rimraf = require('rimraf');
var chai = require('chai');
var should = chai.should();
var expect = chai.expect;
var request = require('request');

var db = require('../lib/db');
var version = require('../package.json').version;

var writerServer;

function mockWriter(writerPath, done) {
  writerServer = net.createServer(function() {
    //noop
  });
  writerServer.on('error', function(err) {
    throw err;
  });
  writerServer.listen(writerPath, function() {
    done();
  });
}

describe('Web Workers Cluster', function() {
  var child;
  var port = 19921;
  var tmpDirectory = '/tmp/bwdb-' + crypto.randomBytes(4).toString('hex');
  var dbPath = tmpDirectory + '/testnet3.lmdb';
  var writerPath = tmpDirectory + '/writer.sock';
  before(function(done) {
    // Create the directory
    mkdirp(dbPath, function(err) {
      if (err) {
        return done(err);
      }
      // Create the database
      db.open(dbPath, false);

      // Open writer socket
      mockWriter(writerPath, done);
    });
  });
  after(function(done) {
    if (child) {
      child.kill('SIGINT');
    }
    rimraf(tmpDirectory, done);
  });
  it('will start and stop cluster', function(done) {
    this.timeout(5000);
    var exec = path.resolve(__dirname, '../lib/web-workers.js');
    var options = JSON.stringify({
      numWorkers: 2,
      network: 'testnet',
      bitcoinHeight: 10000,
      bitcoinHash: '0000000000f4446ad3056a6f8770381172b60ec6168e2260a06cf5f81f2caca7',
      clientsConfig: [{
        rpcprotocol: 'http',
        rpchost: 'localhost',
        rpcport: 109821,
        rpcuser: 'user',
        rpcpassword: 'password',
        rpcstrict: false
      }],
      port: port,
      writerSocketPath: writerPath,
      configPath: tmpDirectory
    });
    child = spawn('node', [exec, options]);

    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);

    child.on('exit', function(code) {
      should.equal(code, 0);
      done();
    });

    setTimeout(function() {
      request('http://localhost:' + port + '/info', function(err, info) {
        if (err) {
          return done(err);
        }
        should.exist(info);
        expect(JSON.parse(info.body)).to.deep.equal({version: version});
        child.kill('SIGINT');
      });
    }, 2000);

  });

});
