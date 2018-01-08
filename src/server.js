const express = require('express');
const graphs = require('./graphs');

const GRAPH_PORT = 5000;

const app = express();

function pageHTML(props) {
  props = props || {};

  const js = (props.js || []).map((path) => {
    return `<script src="${path}"></script>`;
  });
  const css = (props.css || []).map((path) => {
    return `<link rel="stylesheet" type="text/css" href="${path}" />`;
  });

  return `
<!doctype html>
<head>
  <title>${props.title || 'Spendir bot'}</title>
  <meta name="viewport" content="width=device-width, user-scalable=no, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0">
  ${css.join('\n')}
  ${js.join('\n')}
</head>
<body>
  ${props.html || ''}
</body>
`;
}

function getMainPage() {
  return {
  html: `
<p style="text-align: center; font-size: 30px;">Простой финансовый бот в Телеграме</p>
<p style="text-align: center;"><a href="https://telegram.me/SpendirBot" style="font-size: 25px; text-decoration: none; color: #6767ff;">Открыть бота</a></p>
`
  };
}

app.get('/spend/:hash/', (req, res) => {
  graphs.getPage(req.params.hash)
    .then((page) => pageHTML(page))
    .then((html) => res.send(html))
    .catch((e) => {
      console.log(e);
      res.status(500).send({ error: 'Inner error' });
    });
});

app.get('*', (req, res) => {
  const html = pageHTML(getMainPage());

  res.send(html);
});

app.listen(GRAPH_PORT, '0.0.0.0', (err) => {
  if (err) {
    console.log(err);
    return;
  }

  console.log(`start the server`);
});
