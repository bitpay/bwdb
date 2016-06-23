'use strict';

var fs = require('fs');
var mkdirp = require('mkdirp');

var exports = {};

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

module.exports = exports;
