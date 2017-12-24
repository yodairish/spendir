const moment = require('moment');
const Telegraf = require('telegraf');
const Telegram = require('telegraf/telegram')
const TOKEN = require('./configs/token');

moment.locale('ru');

const db = require('./mongo');

const CONCURRENCY_LIST = ['руб', 'rub', 'euro', 'usd', 'pounds', 'aud'];
const CONCURRENCY_TRANSLATE = { 'rub': 'руб' };
const CONCURRENCY_DEFAULT = 'rub';

const app = new Telegraf(TOKEN);
const telegram = new Telegram(TOKEN);

const moneyPattern = /^([0-9\. ]+)(.*)?/;
const endOfDay = moment().utcOffset(3).endOf('day');

const EMPTY_MESSAGE = 'Нет записей';
const NO_TAG = 'other';

// Real limit 4096, but save some for extra
const MESSAGE_LIMIT = 3500;

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

function getSpends(cell, period) {
  return getRecords(cell, period)
    .then((items) => {
      const spends = { total: {}, days: {}, tags: {}, empty: false };

      if (!items || !items.length) {
        spends.empty = true;

        return spends;
      }

      let currentDay;

      return items.reduce((result, item) => {
        const created = moment(item.created_at).utcOffset(3);
        const day = created.format('DD.MM');

        if (currentDay !== day) {
          currentDay = day;
        }

        const concurrency = getOutputConcurrency(item.concurrency);

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
      }, spends);
    });
}

function getRecords(cell, period) {
  if (!cell || !period) {
    return Promise.resolve([]);
  }

  return db.spend.find({
    cell: cell,
    created_at: { $gte: moment().startOf(period).toDate() }
  });
}

function printSpends(cell, spends) {
  if (spends.empty) {
    telegram.sendMessage(cell, EMPTY_MESSAGE);
    return;
  }

  let output = '';

  output += Object.keys(spends.days).reduce((out, day) => {
    return out + `\n${day}\n` + spends.days[day].join('\n') + '\n';
  }, '');

  output += '\nВсего:';

  if (Object.keys(spends.tags).length > 1 || !spends.tags[NO_TAG]) {
    output += '\n' + getSortedTagsByAmount(spends.tags).map((tag) => {
      return `${tag} - ` + printTotal(spends.tags[tag]);
    }).join('\n');
  }

  output += '\n= ' + printTotal(spends.total);

  return splitOutput(output).reduce((prev, part, index) => {
    return prev.then(() => telegram.sendMessage(cell, part));
  }, Promise.resolve());
}

/**
 * Maximum allowed message size is 4096 bytes
 * So to send report even if it's really big(for example for month)
 * We need to split it on chunks
 * Just split by length not good enouth cause it may break one record
 * So slipt output by lines
 */
function splitOutput(output) {
  const parts = [''];

  output.split('\n').forEach((line) => {
    line += '\n';

    if ((parts[parts.length - 1] + line).length > MESSAGE_LIMIT) {
      parts.push('');
    }

    parts[parts.length - 1] += line;
  });

  return parts;
}

function getSortedTagsByAmount(tags) {
  return Object.keys(tags).sort((tag1, tag2) => {
    return getTagSum(tags[tag1]) < getTagSum(tags[tag2]) ? 1 : -1;
  });
}

function getTagSum(tag) {
  // Need to put in same concurrency, right now it's stupid
  return Object.keys(tag).reduce((sum, concurrency) => {
    return sum + tag[concurrency];
  }, 0);
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

  return new db.spend(data)
    .save()
    .then(() => getSpends(ctx.message.chat.id, 'day'))
    .then((spends) => {
      if (!spends.empty) {
        return printTotal(spends.total);
      }
    })
    .then((total) => {
      total = total ? ` (${total})` : '';

      const concurrency = getOutputConcurrency(result.concurrency);
      ctx.reply(`Принятно: ${result.amount} ${concurrency}${total}`);
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
  db.spend.find().distinct('cell')
    .then((cells) => {
      cells.forEach((cell) => {
        getSpends(cell, period)
          .then((spends) => {
            if (!spends.empty) {
              return printSpends(cell, spends);
            };
          })
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
  getSpends(ctx.message.chat.id, 'day')
    .then((spends) => printSpends(ctx.message.chat.id, spends))
    .catch((e) => console.log(e));
});

app.command(['week', 'week@SpendirBot'], (ctx) => {
  getSpends(ctx.message.chat.id, 'week')
    .then((spends) => printSpends(ctx.message.chat.id, spends))
    .catch((e) => console.log(e));
});

app.command(['month', 'month@SpendirBot'], (ctx) => {
  getSpends(ctx.message.chat.id, 'month')
    .then((spends) => printSpends(ctx.message.chat.id, spends))
    .catch((e) => console.log(e));
});

app.on('edited_message', (ctx) => {
  const message = ctx.update.edited_message;

  if (message.from.is_bot || !message.text) return;

  const result = parseMessage(message.text, message.entities);

  db.spend
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
