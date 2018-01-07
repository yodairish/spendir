const moment = require('moment');
moment.locale('ru');

require('./src/bot').startPolling();
require('./src/spends').runDailySpends();
require('./src/currencies').runDailyCurrencies();
