const crypto = require('crypto');
const utils = require('./utils');
const db = require('./db');

const LINK_LIFE = 10 * 60 * 1000; // 10 minutes

function generateNewLink(cell) {
  const hash = getHash();

  // Firstly remove all previous links for chat
  return db.links.deleteMany({
      cell: cell,
    })
    .then(() => (new db.links({ cell: cell, hash: hash })).save())
    .then(() => ({
      hash: hash,
      // Time until this link is available
      activeTo: utils.time().add(LINK_LIFE).format('HH:mm'),
    }));
}

function getHash() {
  const date = (new Date()).valueOf().toString();
  const rand = Math.random().toString();

  return crypto.createHash('sha256').update(date + rand).digest('hex');
}

function getCellByHash(hash) {
  if (!hash) {
    return Promise.resolve(null);
  }

  return db.links.findOne({
      hash: hash
    })
    .then((item) => {
      if (!item) {
        console.log('not found link');
        return null;
      }

      // If link is out of date, remove it
      if (utils.time(item.created_at).diff() + LINK_LIFE < 0) {
        console.log('remove link');
        return item.remove().then(() => null);
      }

      return item.cell;
    });
}

module.exports.generateNewLink = generateNewLink;
module.exports.getCellByHash = getCellByHash;
