const mongoose = require('mongoose');

mongoose.Promise = global.Promise;
mongoose.connect('mongodb://localhost/spendir', {
  useMongoClient: true,
});

const db = mongoose.connection;

db.on('error', (dbErr) => console.error('err', dbErr));
db.once('open', () => console.log('db connected'));

module.exports = db;
