const db = require('./db');
const utils = require('./utils');
const links = require('./links');

function getGroupedDailyData(items) {
  const dates = {
    year: +utils.datePeriod('year'),
    month: +utils.datePeriod('month'),
    week: +utils.datePeriod('week'),
    day: +utils.datePeriod('day'),
  };

  return items.reduce((result, item) => {
    dates.item = +utils.datePeriod('day', item.created_at);

    result.total[dates.item] = addRoundAmount(result.total[dates.item], item.amountBase);

    if (item.tags && item.tags.length) {
      item.tags.forEach((tag) => {
        addTagAmount(result, tag, item.amountBase, dates);
      });
    } else {
      addTagAmount(result, 'other', item.amountBase, dates);
    }

    return result;

  }, { total: {}, tags: {}, totalTags: { year: {}, 'month': {}, 'week': {}, 'day': {} } });
}

function addTagAmount(result, tag, amount, dates) {
  if (!result.tags[tag]) {
    result.tags[tag] = {};
  }

  result.tags[tag][dates.item] = addRoundAmount(result.tags[tag][dates.item], amount);

  if (dates.item > dates.year) {
    result.totalTags.year[tag] = addRoundAmount(result.totalTags.year[tag], amount);
  }

  if (dates.item > dates.month) {
    result.totalTags.month[tag] = addRoundAmount(result.totalTags.month[tag], amount);
  }

  if (dates.item > dates.week) {
    result.totalTags.week[tag] = addRoundAmount(result.totalTags.week[tag], amount);
  }

  if (dates.item > dates.day) {
    result.totalTags.day[tag] = addRoundAmount(result.totalTags.day[tag], amount);
  }
}

function addRoundAmount(total, amount) {
  return Math.ceil((total || 0) + amount);
}

function getChartHTML(options, type) {
  type = type || 'chart';

  const id = `graph${utils.rand(100, 10000)}`;

  let fromStartMonth = '';

  if (type === 'stock') {
    const startFrom = +utils.time().startOf('day').subtract(1, 'month');
    fromStartMonth = `${id}.xAxis[0].setExtremes(${ startFrom });`;
  }

  return `
<div id="${id}"></div>
<script>
const ${id} = Highcharts.${(type === 'stock' ? 'stockChart' : 'chart')}('${id}', ${JSON.stringify(options)});
${fromStartMonth}
</script>
`
}

function getAreaChartHTML(props) {
  if (!props.data || !Object.keys(props.data).length) {
    return '';
  }

  return getChartHTML({
    chart: {
      type: 'areaspline'
    },

    rangeSelector: {
      allButtonsEnabled: true,
      selected: 2,
      buttons: [
        {
          type: 'day',
          count: 1,
          text: 'd'
        },
        {
          type: 'week',
          count: 1,
          text: 'w'
        },
        {
          type: 'month',
          count: 1,
          text: 'm'
        },
        {
          type: 'year',
          count: 1,
          text: 'y'
        },
      ],
    },

    legend: {
      enabled: true,
      itemMarginTop: 10,
    },

    title: {
      text: props.title,
    },

    xAxis: {
      type: 'datetime',
      dateTimeLabelFormats: {
        day: '%d.%m',
        week: '%d.%m',
        month: '%d.%m',
        year: '%d.%m',
      },
      minRange: 24 * 60 * 60 * 1000,
    },

    yAxis: {
      title: {
        text: 'Amount'
      }
    },

    tooltip: {
      xDateFormat: '%d.%m',
      shared: true,
    },

    series: Object.keys(props.data).map((name) => {
      return {
        name: name,
        data: Object.keys(props.data[name]).map((ts) => {
          return [+ts, props.data[name][ts]];
        }),
      };
    }),
  }, props.type);
}

function getPieChartHTML(props) {
  if (!props.data || !Object.keys(props.data).length) {
    return '';
  }

  return getChartHTML({
    title: {
      text: props.title,
    },

    chart: {
      type: 'pie'
    },

    legend: {
      enabled: true,
      itemMarginTop: 10,
    },

    plotOptions: {
      pie: {
        allowPointSelect: true,
        cursor: 'pointer',
        showInLegend: true
      }
    },

    series: [{
      data: Object.keys(props.data).map((name) => {
        return {
          name: name,
          y: props.data[name],
        };
      })
    }],
  });
}

function getGraphPage(cell) {
  return db.spend
    .find({
      cell: cell,
      created_at: { $gte: utils.time().startOf('day').subtract(1, 'year').toDate() }
    })
    .sort('created_at')
    .select('amountBase currency tags created_at')
    .then((items) => getGroupedDailyData(items))
    .then((data) => ([
      getAreaChartHTML({ title: 'Total amount', data: { total: data.total } }),
      getAreaChartHTML({ title: 'Amount by tags', data: data.tags, type: 'stock' }),
      getPieChartHTML({ title: 'Total by tags (year)', data: data.totalTags.year }),
      getPieChartHTML({ title: 'Total by tags (month)', data: data.totalTags.month }),
      getPieChartHTML({ title: 'Total by tags (week)', data: data.totalTags.week }),
      getPieChartHTML({ title: 'Total by tags (day)', data: data.totalTags.day }),
    ].join('')))
    .then((chartHTML) => ({
      title: 'Spends graphs',
      js: [
        'https://code.highcharts.com/stock/highstock.js'
      ],
      html: chartHTML,
    }));
}

function getBrokenLinkPage() {
  return {
    html: `
<p style="text-align: center; font-size: 25px;">Ссылка просрочена</p>
<p style="text-align: center; font-size: 25px;">Пожалуйста, получите новую ссылку от бота</p>
    `,
  };
}

function getPage(hash) {
  return links.getCellByHash(hash)
    .then((cell) => {
      if (cell) {
        return getGraphPage(cell);
      } else {
        return getBrokenLinkPage();
      }
    });
}

module.exports.getPage = getPage;
