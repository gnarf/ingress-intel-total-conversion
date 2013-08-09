// ==UserScript==
// @id             iitc-plugin-activity-tracker@breunigs
// @name           IITC plugin: activity tracker
// @category       Info
// @version        0.0.3.@@DATETIMEVERSION@@
// @namespace      https://github.com/gnarf37/ingress-intel-total-conversion
// @updateURL      @@UPDATEURL@@
// @downloadURL    @@DOWNLOADURL@@
// @description    [@@BUILDNAME@@-@@BUILDDATE@@] Tracks Activity
// @include        https://www.ingress.com/intel*
// @include        http://www.ingress.com/intel*
// @match          https://www.ingress.com/intel*
// @match          http://www.ingress.com/intel*
// @grant          none
// ==/UserScript==

@@PLUGINSTART@@

// PLUGIN START ////////////////////////////////////////////////////////

// use own namespace for plugin
var activityTracker = window.plugin.activityTracker = function() {};

var trackerUI = $('<div id="activity-tracker">').dialog({
  autoOpen: false,
  width: 'auto',
  title: 'Activity Tracker'
});

var dialog = trackerUI.dialog('widget');
dialog.addClass('ui-dialog-buttons');
dialog.find('button').addClass('ui-dialog-titlebar-button');

var bars = $("<div class='bar'><span class='res'></span><span class='enl'></span></div>")
  .appendTo(trackerUI)
  .find('span');

var dataCache = {};
var elemCache = {};

var filterCheck = $('<input type="checkbox">')
  .on('click', scheduleUpdate);

$('<label>Filter to map bounds</label>')
  .prepend(filterCheck)
  .appendTo(trackerUI);

trackerUI.append(' | ');

var minutesInput = $('<input class="minutes" size="3">')
  .on('keyup keypress change', scheduleUpdate);

var loadingLabel = $('<strong class="loading">LOADING</strong>');

$('<label>minutes</label>')
  .prepend(minutesInput)
  .append(loadingLabel.hide())
  .appendTo(trackerUI);

trackerUI.append('<table><thead><tbody></table>');

var thead = trackerUI.find('thead');
var tbody = trackerUI.find('tbody');

// append header row
thead.append('<tr><th>Player</th><th>C/L/F</th><th>R1</th><th>R2</th><th>R3</th><th>R4</th><th>R5</th><th>R6</th><th>R7</th><th>R8</th><th>score<th></tr>');

// maps from a word in chat to a type of event
var CHAT_TRIGGERS = {
  'deployed': 'DEPLOY',
  'destroyed': 'DESTROY',
  'captured': 'CAPTURE',
  'linked': 'LINK',
  'created a Control': 'FIELD'
};

// Map the team names in the data packets to css classes
var TEAMS = {
  'ENLIGHTENED': 'enl',
  'RESISTANCE': 'res'
};

// Pull the level out of the resonator message
var rlevel = /L(\d)/;
// new html to inject for a row
var rowHtml = '<tr>' + (new Array(12)).join('<td>') + '</tr>';

// get the players already created table row, or create it.
function getPlayerRow(pguid) {
  if (elemCache[pguid]) {
    return elemCache[pguid];
  }
  var elem = $(rowHtml);
  elem.find('td:first-child').text(getPlayerName(pguid));
  elem.addClass(TEAMS[dataCache[pguid][0].pteam]);
  return (elemCache[pguid] = elem);
}

// Figure out which of the CHAT_TRIGGERS matches and return a type;
function getTypeFromText(text) {
  var result;
  $.each(CHAT_TRIGGERS, function(key, type) {
    if (text.indexOf(key) !== -1) {
      result = type;
      return false;
    }
  });
  return result;
}

// store the event in the log, check for duplicates first.
function logEvent(event) {
  var playerData = dataCache[event.pguid] || (dataCache[event.pguid] = []);

  if (playerData.some(function(a) { return a.chatguid === event.chatguid; })) {
    return;
  }

  playerData.push(event);
  scheduleUpdate();
}

// whenever we get new public chat messages, loop over all of the chat events
// and look for ones we care about using the PortalEvent object
function onPublicChat(data) {
  $.each(data.raw.result, function(index, json) {
    var parsed = new PortalEvent(json);
    if (parsed.type && parsed.pguid && parsed.latE6) {
      logEvent(parsed);
    }
  });
  if (state.moreHistory) {

  }
}

// schedule an update for the next frame
function scheduleUpdate() {
  clearTimeout(scheduleUpdate.timeout);
  scheduleUpdate.timeout = setTimeout(update);
}

// startup method after IITC loaded
function setup() {
  // add link to the toolbox that opens the trackerUI dialog
  $('<a title="Show Activity Tracker">ACT</a>')
    .appendTo('#toolbox')
    .click(function() {
      trackerUI.dialog('open');
      scheduleUpdate();
    });

  // we need the public chat data for the portal events
  addHook('publicChatDataAvailable', onPublicChat);

  // after moving the map, we want to schedule an update
  map.on('moveend', scheduleUpdate);

  // add CSS
  $('head').append('<style>' +
    '#activity-tracker .enl td { color: #03DC03; background-color: #083a02;}' +
    '#activity-tracker .res td { color: #0088FF; background-color: #042439;}' +
    '#activity-tracker .enl:nth-child(2n) td { background-color: #1b3a18; }' +
    '#activity-tracker .res:nth-child(2n) td { background-color: #1a2c3a; }' +
    '#activity-tracker input { height: auto; }' +
    '#activity-tracker .bar { height: 22px; width: 100%; } ' +
    '#activity-tracker .bar span { display: block; float: left; font-weight: bold; cursor: help; height: 21px; line-height: 22px; } ' +
    '#activity-tracker .bar span.res { background: #005684; text-align: right; }' +
    '#activity-tracker .bar span.enl { background: #017f01; text-align: left; }' +
    '#activity-tracker label .loading { color: red; }' +
    '#activity-tracker label .loading:before { content: "|"; color: white; padding: 0px 2px }' +
    '</style>'
  );
}

// hold the local state for filtering
var state = {
  bounds: null,
  mintime: 0,
  moreHistory: false
};

// render the full table because something changed
function update() {
  // do nothing when it is already open
  if (!trackerUI.dialog('isOpen')) {
    return;
  }

  // if we want to filter to the bounds, get the map bounds and store them
  state.bounds = filterCheck.is(':checked') ? map.getBounds() : null;

  // figure out the timestamp
  var minutes = +minutesInput.val();
  if (minutes) {
    var temp = new Date();
    temp.setMinutes(temp.getMinutes() - minutes);
    state.mintime = temp.getTime();
    state.moreHistory = true;
  } else {
    state.mintime = 0;
  }

  // store the date range of rendered events
  var maxt = 0, mint = Date.now();

  // remove any table rows not in the data cache
  tbody.find('tr').filter(function() {
    return !dataCache[this.dataset.pguid];
  }).remove();

  var score = {
    enl: 0,
    res: 0
  };

  // call getPlayerSummary with each player in the dataCache
  $.map(dataCache, getPlayerSummary)
    // sort the results on the "score"
    .sort(function(a, b) {
      return b.score - a.score;
    })
    .forEach(function(sum) {
      // remove elements without a score
      if (!sum.total) {
        return sum.elem.detach();
      }

      // calculate team totals
      score[sum.team] += sum.score;

      // find the date range of rendered events
      maxt = Math.max(maxt, sum.maxt);
      mint = Math.min(mint, sum.mint);

      // append to table (in order)
      tbody.append(sum.elem);
    });

  // update the bars width with the team totals
  bars.eq(0).text(score.res).css('width', score.res * 100/(score.res+score.enl) + '%');
  bars.eq(1).text(score.enl).css('width', score.enl * 100/(score.res+score.enl) + '%');

  // show the date range of rendered events
  trackerUI.dialog('option', 'title', 'Activity Tracker - ' +
    new Date(mint).toLocaleString() + ' - ' + new Date(maxt).toLocaleString());

  if (state.moreHistory) {
    clearTimeout(state.chatTimeout);
    state.chatTimeout = setTimeout(function() {
      console.log('ACT: Loading more chat history', Date.now());
      chat.requestPublic(true);
    }, 3000);
    loadingLabel.show();
  } else {
    loadingLabel.hide();
  }
}

// get a Summary for the player events and render to the element for the player
function getPlayerSummary(events, pguid) {
  return new Summary(events).renderTo(getPlayerRow(pguid));
}

// takes players chat events and creates a summary
function Summary(events) {
  events.reduce(Summary.parse, this)
}

// add up each event type
Summary.parse = function(sum, event) {
  if (state.bounds && !state.bounds.contains(event.getLatLng())) {
    return sum;
  }

  if (state.mintime && event.timestamp < state.mintime) {
    state.moreHistory = false;
    return sum;
  }

  sum.team = TEAMS[event.pteam];

  sum.add('total');
  sum.maxt = Math.max(sum.maxt || 0, event.timestamp);
  sum.mint = Math.min(sum.mint || Date.now(), event.timestamp);

  if (event.type === 'DESTROY' || event.type === 'DEPLOY') {
    sum.add(event.type + event.resLevel);
  } else {
    sum.add(event.type);
  }
  return sum;
};

// add one or more points to a summary field
Summary.prototype.add = function(type, number) {
  this[type] = this.get(type) + (+number || 1);
  return this;
};

// when you want to make sure it's a number...
Summary.prototype.get = function(type) {
  return +this[type] || 0;
};

// render the summary to a table row
Summary.prototype.renderTo = function(elem) {
  this.elem = elem;
  this.score = 0;
  var cells = elem.find('td');
  cells.eq(1).text(this.get('CAPTURE') + '/' + this.get('LINK') + '/' + this.get('FIELD'));
  for (var level = 1; level <= 8; level++) {
    var r = this.get('DEPLOY' + level);
    var x = this.get('DESTROY' + level);
    cells.eq(level + 1).text('+' + r + '/-' + x);
    this.score += r * level + x * level;
  }
  this.score += this.get('CAPTURE') * 5;
  this.score += this.get('LINK') * 3;
  this.score += this.get('FIELD') * 9;
  cells.eq(10).text(this.score);
  return this;
};

// Parses and summaraizes data from chat json events
function PortalEvent(json) {
  this.chatguid = json[0];
  this.timestamp = json[1];

  // find all the data from the plext markup
  json[2].plext.markup.reduce(PortalEvent.parseMarkup, this);
}

// parse the Markup
PortalEvent.parseMarkup = function (event, markup) {
  if (!event) {
    return;
  }
  var type = markup[0];
  var data = markup[1];
  if (type === 'PLAYER') {
    event.pguid = data.guid;
    event.pteam = data.team;
  } else if (type === 'PORTAL') {
    // only store the first portal in a message
    if (!event.lat) {
      $.extend(event, data);
    }
  } else if (type === 'TEXT') {
    var level = rlevel.exec(data.plain);
    if (level) {
      event.resLevel = +level[1];
    }
    if (!event.type) {
      event.type = getTypeFromText(data.plain);
    }
  }
  return event;
};

// get the real lat and lng from the event
PortalEvent.prototype.getLatLng = function() {
  return new L.LatLng(this.latE6 / 1e6, this.lngE6 / 1e6);
};

// PLUGIN END //////////////////////////////////////////////////////////

@@PLUGINEND@@
