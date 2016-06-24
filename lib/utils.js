'use strict';

var assert = require('assert');
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

module.exports = exports;
