const mongoose = require('mongoose');
const MongoSchema = mongoose.Schema;

mongoose.Promise = global.Promise;
mongoose.connect('mongodb://localhost/spendir', {
  useMongoClient: true,
});

const db = mongoose.connection;

db.on('error', (dbErr) => console.error('err', dbErr));
db.once('open', () => console.log('db connected'));

// Schemas

const mongoSpendSchema = new MongoSchema({
  cell: Number,
  author: String,
  amount: Number,
  amountBase: Number,
  currency: String,
  msg: String,
  messageId: Number,
  tags: [String],
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
});

const mongoSpend = mongoose.model('Spend', mongoSpendSchema);

const mongoLinksSchema = new MongoSchema({
  hash: String,
  cell: Number,
}, {
  timestamps: {
    createdAt: 'created_at',
  },
});

const mongoLinks = mongoose.model('Links', mongoLinksSchema);

const mongoSettingsSchema = new MongoSchema({
  cell: Number,
  limit: Number,
  limitOnly: [String],
  limitExcept: [String],
}, {
  timestamps: {
    createdAt: 'created_at',
  },
});

const mongoSettings = mongoose.model('Settings', mongoSettingsSchema);

module.exports.base = db;
module.exports.spend = mongoSpend;
module.exports.links = mongoLinks;
module.exports.settings = mongoSettings;
