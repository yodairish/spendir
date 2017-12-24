const Telegram = require('telegraf/telegram');
const TOKEN = require('../configs/token');
const db = require('./db');
const utils = require('./utils');

const telegram = new Telegram(TOKEN);

const EMPTY_MESSAGE = 'Нет записей';
const NO_TAG = 'other';
let endOfDay;

function getData(cell, period) {
  const data = { total: {}, days: {}, tags: {}, empty: false };

  if (!cell || !period) {
    data.empty = true;
    return Promise.resolve(data);
  }

  return db.spend.find({
      cell: cell,
      created_at: { $gte: utils.time().startOf(period).toDate() }
    })
    .then((items) => {
      if (!items || !items.length) {
        data.empty = true;
        return data;
      }

      let currentDay;

      return items.reduce((result, item) => {
        const created = utils.time(item.created_at);
        const day = created.format('DD.MM');

        if (currentDay !== day) {
          currentDay = day;
        }

        const concurrency = utils.getOutputConcurrency(item.concurrency);

        result.total[concurrency] = (result.total[concurrency] || 0) + item.amount;

        if (!item.tags || !item.tags.length) {
          item.tags = [NO_TAG];
        }

        item.tags.forEach((tag) => {
          if (!result.tags[tag]) {
            result.tags[tag] = {};
          }

          result.tags[tag][concurrency] = (result.tags[tag][concurrency] || 0) + item.amount;
        });

        if (!result.days[currentDay]) {
          result.days[currentDay] = [];
        }

        result.days[currentDay].push(`${created.format('HH:mm')} - ${item.amount} ${concurrency} - ${item.author}${(item.msg ? ` - ${item.msg}` : '')}`);

        return result;
      }, data);
    });
}

function print(cell, data) {
  if (data.empty) {
    telegram.sendMessage(cell, EMPTY_MESSAGE);
    return;
  }

  let output = '';

  output += Object.keys(data.days).reduce((out, day) => {
    return out + `\n${day}\n` + data.days[day].join('\n') + '\n';
  }, '');

  output += '\nВсего:';

  if (Object.keys(data.tags).length > 1 || !data.tags[NO_TAG]) {
    output += '\n' + utils.getSortedTagsByAmount(data.tags).map((tag) => {
      return `${tag} - ` + utils.getOutputTotal(data.tags[tag]);
    }).join('\n');
  }

  output += '\n= ' + utils.getOutputTotal(data.total);

  return utils.splitOutput(output).reduce((prev, part, index) => {
    return prev.then(() => telegram.sendMessage(cell, part));
  }, Promise.resolve());
}

function add(ctx, message, result) {
  const data = {
    cell: message.chat.id,
    author: message.from.first_name,
    amount: result.amount,
    msg: result.msg,
    concurrency: result.concurrency,
    tags: result.tags,
    messageId: message.message_id,
  };

  return new db.spend(data)
    .save()
    .then(() => getData(ctx.message.chat.id, 'day'))
    .then((data) => {
      if (!data.empty) {
        return utils.getOutputTotal(data.total);
      }
    })
    .then((total) => {
      total = total ? ` (${total})` : '';

      const concurrency = utils.getOutputConcurrency(result.concurrency);
      ctx.reply(`Принятно: ${result.amount} ${concurrency}${total}`);
    })
    .catch((e) => {
      console.log(e);
    });
}

function update(ctx, record, result) {
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

function remove(ctx, record) {
  return record.remove()
    .then(() => {
      ctx.reply(`Запись удалена`);
    })
    .catch((e) => {
      console.log(e);
    });;
}

function printCellsData(period) {
  db.spend.find().distinct('cell')
    .then((cells) => {
      cells.forEach((cell) => {
        getData(cell, period)
          .then((data) => {
            if (!data.empty) {
              return print(cell, data);
            };
          })
          .catch((e) => console.log(e));
      });
    });
}

/**
 * Show spend info daily
 */
function runDailySpends() {
  if (endOfDay) {
    printCellsData('day');

    if (endOfDay.isSame(endOfDay.clone().endOf('week'))) {
      printCellsData('week');
    }

    if (endOfDay.isSame(endOfDay.clone().endOf('month'))) {
      printCellsData('month');
    }

    // go to next day
    endOfDay.add(1, 'day');

  // Start timer
  } else {
    endOfDay = utils.time().endOf('day');
  }

  setTimeout(runDailySpends, endOfDay.diff());
}

module.exports.getData = getData;
module.exports.print = print;
module.exports.add = add;
module.exports.update = update;
module.exports.remove = remove;
module.exports.runDailySpends = runDailySpends;
