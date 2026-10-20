const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fixture(options = {}) {
  const requests = [];
  let now = Date.now();
  const key = options.key === undefined ? 'test-key' : options.key;
  const initial = Array.from({length: 12}, (_, i) => ({
    id: i + 1, kind: i < 8 ? 'movie' : 'tv', title: 'Title ' + (i + 1),
    backdrop: '/image' + i + '.jpg', meta: 'Netflix', app: 'netflix', detailed: true,
  }));
  const storage = options.storage || new Map([['fmtv.recs', JSON.stringify({picks: initial})]]);
  class Clock extends Date { static now() { return now; } }
  class Request {
    open(method, url) { this.url = new URL(url); }
    setRequestHeader() {}
    send() { requests.push(this); }
  }
  const context = vm.createContext({
    window: {CONFIG: {tmdbKey: key, tmdbRegion: 'BR'}, ZONES: {}},
    localStorage: {getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v)},
    TV: {zone: () => 'America/Bahia'}, navigator: {language: 'pt-BR'}, Date: Clock,
    I18N: {lang: 'pt', locale: () => 'pt-BR'}, tr: pt => pt, XMLHttpRequest: Request,
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../web/data.js'), 'utf8'), context);
  context.Data.setApps([{id: 'netflix', title: 'Netflix'}]);
  return {
    data: context.Data, requests, storage,
    advance(ms) { now += ms; },
    reply(body, status = 200) {
      assert.ok(requests.length, 'Expected an outgoing request');
      const req = requests.shift();
      req.status = status; req.readyState = 4; req.responseText = JSON.stringify(body);
      req.onreadystatechange();
      return req.url;
    },
    providers() { return this.reply({results: [{provider_id: 8, provider_name: 'Netflix'}]}); },
  };
}

test('browse exposes more than three titles, preserves ordering and filters installed services', () => {
  const f = fixture();
  assert.equal(f.data.catalog(null).length, 12);
  assert.equal(f.data.catalog('movie').length, 8);
  assert.equal(f.data.catalog('tv').length, 4);
  assert.ok(f.data.picks(null).length <= 3, 'Screensaver still has a bounded hourly selection');
  const before = JSON.stringify(f.data.catalog(null));
  f.advance(3600000);
  assert.equal(JSON.stringify(f.data.catalog(null)), before, 'Browsing must not reshuffle every hour');
  f.data.setApps([]);
  assert.equal(f.data.catalog(null).length, 0);
  assert.equal(fixture({key: ''}).data.catalog(null).length, 0);
});

test('pagination appends unique titles, retains country and service filters, and resumes after restart', () => {
  const f = fixture();
  const before = f.data.catalog('movie').map(p => p.id).join(',');
  f.data.loadMore('movie');
  f.data.loadMore('movie');
  assert.equal(f.requests.length, 1, 'Repeated key presses must not start duplicate page requests');
  f.providers();
  const url = f.requests[0].url;
  assert.equal(url.searchParams.get('watch_region'), 'BR');
  assert.equal(url.searchParams.get('with_watch_providers'), '8');
  assert.equal(url.searchParams.get('page'), '1');
  f.reply({total_pages: 2, results: [
    {id: 1, title: 'Duplicate', backdrop_path: '/a.jpg'},
    {id: 21, title: 'New movie', backdrop_path: '/b.jpg'},
    {id: 21, title: 'Duplicate in page', backdrop_path: '/b.jpg'},
    {id: 22, title: 'Missing image'},
  ]});
  assert.equal(f.data.catalog('movie').length, 9);
  assert.equal(f.data.catalog('movie').slice(0, 8).map(p => p.id).join(','), before);
  const restored = fixture({storage: f.storage});
  restored.data.loadMore('movie');
  restored.providers();
  assert.equal(restored.requests[0].url.searchParams.get('page'), '2');
  restored.reply({total_pages: 2, results: []});
  restored.data.loadMore('movie');
  assert.equal(restored.requests.length, 0, 'Exhausted catalogs must not request pages forever');
});

test('failed page keeps existing cards, delays retry, and retries the same page', () => {
  const f = fixture();
  f.data.loadMore('movie');
  f.providers();
  f.reply({}, 503);
  assert.equal(f.data.loadingMore(), false);
  assert.equal(f.data.catalog('movie').length, 8);
  assert.ok(f.data.moreError());
  f.data.loadMore('movie');
  assert.equal(f.requests.length, 0);
  f.advance(31000);
  f.data.loadMore('movie');
  f.providers();
  assert.equal(f.requests[0].url.searchParams.get('page'), '1');
  f.reply({total_pages: 1, results: []});
  assert.equal(f.data.moreError(), '');
});

test('visible titles get details once; titles without an installed provider are removed', () => {
  const f = fixture();
  f.data.loadMore('movie'); f.providers();
  f.reply({total_pages: 1, results: [{id: 21, title: 'New movie', backdrop_path: '/new.jpg'}]});
  const visible = f.data.catalog('movie').slice(-1);
  f.data.prepare(visible); f.data.prepare(visible);
  assert.equal(f.requests.length, 1);
  f.reply({genres: [], runtime: 90, 'watch/providers': {results: {BR: {flatrate: [{provider_name: 'Netflix'}]}}}});
  assert.match(f.data.catalog('movie').slice(-1)[0].meta, /Netflix/);
  f.data.prepare(visible);
  assert.equal(f.requests.length, 0);
  f.data.loadMore('tv'); f.providers();
  f.reply({total_pages: 1, results: [{id: 21, name: 'Same numeric ID, another type', backdrop_path: '/tv.jpg'}]});
  const show = f.data.catalog('tv').slice(-1);
  assert.equal(show[0].id, 21, 'Movie and show IDs are separate namespaces');
  f.data.prepare(show);
  f.reply({genres: [], 'watch/providers': {results: {US: {flatrate: [{provider_name: 'Netflix'}]}}}});
  assert.equal(f.data.catalog('tv').length, 4, 'Unavailable titles must leave the browsable list');
});
