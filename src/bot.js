const Telegraf = require('telegraf');
const db = require('./db');
const spends = require('./spends');
const utils = require('./utils');
const TOKEN = require('../configs/token');

const bot = new Telegraf(TOKEN);

bot.command(['day', 'day@SpendirBot'], (ctx) => {
  spends.getData(ctx.message.chat.id, 'day')
    .then((data) => spends.print(ctx.message.chat.id, data))
    .catch((e) => console.log(e));
});

bot.command(['week', 'week@SpendirBot'], (ctx) => {
  spends.getData(ctx.message.chat.id, 'week')
    .then((data) => spends.print(ctx.message.chat.id, data))
    .catch((e) => console.log(e));
});

bot.command(['month', 'month@SpendirBot'], (ctx) => {
  spends.getData(ctx.message.chat.id, 'month')
    .then((data) => spends.print(ctx.message.chat.id, data))
    .catch((e) => console.log(e));
});

bot.on('edited_message', (ctx) => {
  const message = ctx.update.edited_message;

  if (message.from.is_bot || !message.text) return;

  const result = utils.parseMessage(message.text, message.entities);

  db.spend
    .findOne({
      cell: message.chat.id,
      messageId: message.message_id,
    })
    .then((record) => {
      if (result && !result.commands.length) {
        if (record) {
          spends.update(ctx, record, result);
        } else {
          spends.add(ctx, message, result);
        }
      } else if (record) {
        spends.remove(ctx, record);
      }
    });
});

bot.on('message', (ctx) => {
  const message = ctx.message;

  if (message.from.is_bot || !message.text) return;

  const result = utils.parseMessage(message.text, message.entities);

  if (!result || result.commands.length) {
    ctx.reply('Неправильный формат\nФормат: <сумма> (сообщение)');
    return;
  }

  spends.add(ctx, message, result);
});

module.exports = bot;
