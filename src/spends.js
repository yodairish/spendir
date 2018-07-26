const db = require('./db');
const currencies = require('./currencies');
const utils = require('./utils');
const settings = require('./settings');

const EMPTY_MESSAGE = 'Нет записей';
const NO_TAG = 'other';
let endOfDay;

function getData(cell, period, date) {
  const data = { total: {}, days: {}, tags: {}, empty: false };

  if (!cell || !period) {
    data.empty = true;
    return Promise.resolve(data);
  }

  return db.spend.find({
      cell: cell,
      created_at: { $gte: utils.datePeriod(period, date) }
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

        const currency = currencies.getName(item.currency);

        result.total[currency] = (result.total[currency] || 0) + item.amount;

        if (item.tags && item.tags.length) {
          item.tags = item.tags.filter((tag) => tag !== 'no_limit');
        }

        if (!item.tags || !item.tags.length) {
          item.tags = [NO_TAG];
        }

        item.tags.forEach((tag) => {
          if (!result.tags[tag]) {
            result.tags[tag] = {};
          }

          result.tags[tag][currency] = (result.tags[tag][currency] || 0) + item.amount;
        });

        if (!result.days[currentDay]) {
          result.days[currentDay] = [];
        }

        const amount = {};
        amount[currency] = item.amount;

        const record = [
          created.format('HH:mm'),      // time
          utils.getOutputValue(amount), // amount
          item.author,                  // author
          item.msg,                     // message
        ].filter(Boolean).join(' - ');

        result.days[currentDay].push(record);

        return result;
      }, data);
    });
}

function print(cell, data) {
  if (data.empty) {
    return utils.printToCell(cell, EMPTY_MESSAGE);
  }

  let output = '';

  output += Object.keys(data.days).reduce((out, day) => {
    return out + `\n${day}\n` + data.days[day].join('\n') + '\n';
  }, '');

  output += '\nВсего:';

  if (Object.keys(data.tags).length > 1 || !data.tags[NO_TAG]) {
    output += '\n' + utils.getSortedTagsByAmount(data.tags).map((tag) => {
      return `${tag} - ` + utils.getOutputValue(data.tags[tag]);
    }).join('\n');
  }

  output += '\n= ' + utils.getOutputValue(data.total);

  return getRestLimit(cell)
    .then((limit) => {
      if (Number.isInteger(limit)) {
        output += `\n\nОстаток:\n= ${limit}`;
      }

      return utils.printToCell(cell, output);
    });
}

function add(ctx, message, result) {
  const data = {
    cell: message.chat.id,
    author: message.from.first_name,
    amount: result.amount,
    amountBase: currencies.getValueInDefault(result.currency, result.amount),
    msg: result.msg,
    currency: result.currency,
    tags: result.tags,
    messageId: message.message_id,
  };

  return new db.spend(data)
    .save()
    .then(() => getData(ctx.message.chat.id, 'day'))
    .then((data) => {
      if (!data.empty) {
        return utils.getOutputValue(data.total);
      }
    })
    .then((total) => {
      return getRestLimit(message.chat.id)
        .then((limit) => {
          return { total: total, limit: limit };
        });
    })
    .then((info) => {
      additional = '';
      additional = info.total ? ` (=${info.total})` : '';
      additional = Number.isInteger(info.limit) ? ` (Остаток: ${info.limit})` : '';

      const currency = currencies.getForOutput(result.currency);
      ctx.reply(`Принятно: ${result.amount} ${currency}${additional}`);
    })
    .catch((e) => {
      console.log(e);
    });
}

function update(ctx, record, result) {
  const updateData = {
    amount: result.amount,
    amountBase: currencies.getValueInDefault(result.currency, result.amount),
    currency: result.currency,
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

function printCellsData(period, date) {
  db.spend.find().distinct('cell')
    .then((cells) => {
      cells.forEach((cell) => {
        getData(cell, period, date)
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
    console.log('Print report: ', endOfDay.format('DD.MM HH:mm:ss'));

    const endOfDayTS = endOfDay.valueOf();

    printCellsData('day', endOfDayTS);

    if (endOfDay.isSame(endOfDay.clone().endOf('week'))) {
      printCellsData('week', endOfDayTS);
    }

    if (endOfDay.isSame(endOfDay.clone().endOf('month'))) {
      printCellsData('month', endOfDayTS);
    }

    // go to next day
    endOfDay.add(1, 'day');

  // Start timer
  } else {
    endOfDay = utils.time().endOf('day');
  }

  setTimeout(runDailySpends, endOfDay.diff());
}

function getRestLimit(cell) {
  if (!cell) {
    return Promise.resolve(false);
  }

  return settings.getLimit(cell)
    .then((limit) => {
      if (!limit.amount) {
        return false;
      }

      const result = db.spend.find({
          cell: cell,
          created_at: { $gte: utils.datePeriod('month') },
        })
        .where('tags').nin(['no_limit']);

      if (limit.only && limit.only.length) {
        result.where('tags').in(limit.only);
      } else if (limit.except && limit.except.length) {
        result.where('tags').nin(limit.except);
      }

      return result.then((items) => {
        items = items || [];

        return items.reduce((rest, item) => {
          const currency = currencies.getName(item.currency);
          return rest - Math.ceil(currencies.getValueInDefault(currency, item.amount));
        }, limit.amount);
      });
    });
}

module.exports.getData = getData;
module.exports.print = print;
module.exports.add = add;
module.exports.update = update;
module.exports.remove = remove;
module.exports.runDailySpends = runDailySpends;
