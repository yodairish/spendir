const moment = require('moment');
const Telegraf = require('telegraf');
const Telegram = require('telegraf/telegram')
const TOKEN = require('./configs/token');

moment.locale('ru');

const db = require('./mongo');
const mongoose = require('mongoose');
const MongoSchema = mongoose.Schema;

const CONCURRENCY_LIST = ['руб', 'rub', 'euro', 'usd', 'pounds', 'aud'];
const CONCURRENCY_TRANSLATE = { 'rub': 'руб' };
const CONCURRENCY_DEFAULT = 'rub';

const mongoSpendSchema = new MongoSchema({
  cell: Number,
  author: String,
  amount: Number,
  concurrency: String,
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

const app = new Telegraf(TOKEN);
const telegram = new Telegram(TOKEN);

const moneyPattern = /^([0-9\. ]+)(.*)?/;
const endOfDay = moment().utcOffset(3).endOf('day');

function getOutputConcurrency(value) {
  let concurrency = value || CONCURRENCY_DEFAULT;

  return CONCURRENCY_TRANSLATE[concurrency] || concurrency;
}

function printTotal(total) {
  return Object.keys(total)
    .map((concurrency) => {
      const value = (total[concurrency] % 1 ? total[concurrency].toFixed(1) : total[concurrency]);
      return `${value} ${concurrency}`;
    })
    .join(', ');
}

function getSpends(items) {
  const total = {};
  const tags = {};
  let currentDay;
  let output = items.reduce((result, item) => {
    const created = moment(item.created_at).utcOffset(3);
    const day = created.format('DD.MM');

    if (currentDay !== day) {
      result += `\n${day}\n`;
      currentDay = day;
    }

    const concurrency = getOutputConcurrency(item.concurrency);

    total[concurrency] = (total[concurrency] || 0) + item.amount;

    if (item.tags) {
      item.tags.forEach((tag) => {
        if (!tags[tag]) {
          tags[tag] = {};
        }

        tags[tag][concurrency] = (tags[tag][concurrency] || 0) + item.amount;
      });
    }

    result += `${created.format('HH:mm')} - ${item.amount} ${concurrency} - ${item.author}${(item.msg ? ` - ${item.msg}` : '')}\n`;

    return result;
  }, '');

  if (output) {
    output += '\nВсего:';

    const tagsOutput = Object.keys(tags).map((tag) => {
      return `${tag} - ` + printTotal(tags[tag]);
    }).join('\n');

    if (tagsOutput) {
      output += `\n${tagsOutput}`;
    }

    output += '\n= ' + printTotal(total);
  } else {
    output = 'Нет записей';
  }

  return output;
}

function allocateEntities(text, entities, textOffset) {
  textOffset = textOffset || 0;

  return (entities || []).reduce((result, entity) => {
    const entityOffset = entity.offset + textOffset;

    switch(entity.type) {
      case 'bot_command':
        result.commands.push(result.text.substr(entityOffset, entity.length).toLowerCase());
        result.text = result.text.substring(0, entityOffset) + result.text.substring(entityOffset + entity.length);
        textOffset -= entity.length;
        break;
      case 'hashtag':
        result.tags.push(result.text.substr(entityOffset, entity.length).toLowerCase());
        result.text = result.text.substring(0, entityOffset) + result.text.substring(entityOffset + entity.length);
        textOffset -= entity.length;
        break;
    }

    return result;
  }, { text: text, commands: [], tags: [] })
}

function parseMessage(message, entities) {
  const matches = message.match(moneyPattern);

  if (!matches) return false;

  const amount = +matches[1].trim().replace(/ /g, '');
  let msg = (matches[2] || '').trim();

  // Get concurrency
  const firstWord = (msg.match(/^[a-z]+/) || [])[0];

  let concurrency = CONCURRENCY_LIST.find((name) => name.indexOf(firstWord) === 0);

  if (concurrency) {
    msg = msg.substr(firstWord.length);
  } else {
    concurrency = CONCURRENCY_DEFAULT;
  }

  concurrency = Object.keys(CONCURRENCY_TRANSLATE).find((name) => CONCURRENCY_TRANSLATE[name] === concurrency) || concurrency;

  // Get tags
  const result = allocateEntities(msg, entities, -message.indexOf(msg));

  return {
    amount: amount,
    msg: result.text.trim(),
    concurrency: concurrency,
    tags: result.tags,
    commands: result.commands,
  };
}

function addRecord(ctx, message, result) {
  const data = {
    cell: message.chat.id,
    author: message.from.first_name,
    amount: result.amount,
    msg: result.msg,
    concurrency: result.concurrency,
    tags: result.tags,
    messageId: message.message_id,
  };

  return new mongoSpend(data)
    .save()
    .then(() => {
      const concurrency = getOutputConcurrency(result.concurrency);
      ctx.reply(`Принятно: ${result.amount} ${concurrency}`);
    })
    .catch((e) => {
      console.log(e);
    });
}

function updateRecord(ctx, record, result) {
  const updateData = {
    amount: result.amount,
    concurrency: result.concurrency,
    msg: result.msg,
    tags: result.tags,
  };

  return record.update(updateData)
    .then(() => {
      ctx.reply(`Обновлено`);
    })
    .catch((e) => {
      console.log(e);
    });;
}

function removeRecord(ctx, record) {
  return record.remove()
    .then(() => {
      ctx.reply(`Запись удалена`);
    })
    .catch((e) => {
      console.log(e);
    });;
}

function sendCellSpends(period) {
  mongoSpend.find().distinct('cell')
    .then((cells) => {
      cells.forEach((cell) => {
        mongoSpend.find({
            cell: cell,
            created_at: { $gte: moment().startOf(period).toDate() }
          })
          .then((items) => getSpends(items))
          .then((output) => (output && telegram.sendMessage(cell, output)))
          .catch((e) => console.log(e));
      });
    });
}

function dailySpends() {
  sendCellSpends('day');

  if (endOfDay.isSame(endOfDay.clone().endOf('week'))) {
    sendCellSpends('week');
  }

  if (endOfDay.isSame(endOfDay.clone().endOf('month'))) {
    sendCellSpends('month');
  }

  // go to next day
  endOfDay.add(1, 'day');
  setTimeout(dailySpends, endOfDay.diff());
}

app.command(['day', 'day@SpendirBot'], (ctx) => {
  mongoSpend.find({
      cell: ctx.message.chat.id,
      created_at: { $gte: moment().startOf('day').toDate() }
    })
    .then((items) => getSpends(items))
    .then((output) => ctx.reply(output))
    .catch((e) => console.log(e));
});

app.command(['week', 'week@SpendirBot'], (ctx) => {
  mongoSpend.find({
      cell: ctx.message.chat.id,
      created_at: { $gte: moment().startOf('week').toDate() }
    })
    .then((items) => getSpends(items))
    .then((output) => ctx.reply(output))
    .catch((e) => console.log(e));
});

app.command(['month', 'month@SpendirBot'], (ctx) => {
  mongoSpend.find({
      cell: ctx.message.chat.id,
      created_at: { $gte: moment().startOf('month').toDate() }
    })
    .then((items) => getSpends(items))
    .then((output) => ctx.reply(output))
    .catch((e) => console.log(e));
});

app.on('edited_message', (ctx) => {
  const message = ctx.update.edited_message;

  if (message.from.is_bot || !message.text) return;

  const result = parseMessage(message.text, message.entities);

  mongoSpend
    .findOne({
      cell: message.chat.id,
      messageId: message.message_id,
    })
    .then((record) => {
      if (result && !result.commands.length) {
        if (record) {
          updateRecord(ctx, record, result);

        } else {
          addRecord(ctx, message, result);
        }
      } else if (record) {
        removeRecord(ctx, record);
      }
    });
});

app.on('message', (ctx) => {
  const message = ctx.message;

  if (message.from.is_bot || !message.text) return;

  const result = parseMessage(message.text, message.entities);

  if (!result || result.commands.length) {
    ctx.reply('Неправильный формат\nФормат: <сумма> (сообщение)');
    return;
  }

  addRecord(ctx, message, result);
});

// show spend info daily
setTimeout(dailySpends, endOfDay.diff());

app.startPolling();
