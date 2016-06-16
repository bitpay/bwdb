'use strict';

var exports = {};

exports.isNotFoundError = function(err) {
  return /notfound/i.test(err);
};

module.exports = exports;
