// ==UserScript==
// @id             iitc-plugin-activity-tracker@breunigs
// @name           IITC plugin: activity tracker
// @category       Info
// @version        0.0.1.@@DATETIMEVERSION@@
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

var dataCache = {};
var elemCache = {};

trackerUI.append('<table><thead><tbody></table>');
var thead = trackerUI.find('thead');
var tbody = trackerUI.find('tbody');

thead.append('<tr><th>Player</th><th>C/L/F</th><th>R1</th><th>R2</th><th>R3</th><th>R4</th><th>R5</th><th>R6</th><th>R7</th><th>R8</th><th>score<th></tr>');

var CHAT_TRIGGERS = {
  'deployed': 'DEPLOY',
  'destroyed': 'DESTROY',
  'captured': 'CAPTURE',
  'linked': 'LINK',
  'created a Control': 'FIELD'
};

var rlevel = /L(\d)/;
var rowHtml = '<tr>' + (new Array(12)).join('<td>') + '</tr>';

function getPlayerRow(pguid) {
  if (elemCache[pguid]) {
    return elemCache[pguid];
  }
  var elem = $(rowHtml);
  elem.find('td:first-child').text(getPlayerName(pguid));
  elem.addClass('team-' + dataCache[pguid][0].pteam);
  return (elemCache[pguid] = elem);
}

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

function logEvent(event) {
  var playerData = dataCache[event.pguid] || (dataCache[event.pguid] = []);

  if (playerData.some(function(a) { return a.chatguid === event.chatguid; })) {
    return;
  }

  playerData.push(event);
  scheduleUpdate();
}

function markupParser(parsed, markup) {
  if (!parsed) {
    return;
  }
  var type = markup[0];
  var data = markup[1];
  if (type === 'PLAYER') {
    parsed.pguid = data.guid;
    parsed.pteam = data.team;
  } else if (type === 'PORTAL') {
    // only store the first portal in a message
    if (!parsed.lat) {
      $.extend(parsed, data);
    }
  } else if (type === 'TEXT') {
    var level = rlevel.exec(data.plain);
    if (level) {
      parsed.resLevel = +level[1];
    }
    if (!parsed.type) {
      parsed.type = getTypeFromText(data.plain);
    }
  }
  return parsed;
}

function onPublicChat(data) {
  // reducing the data we want out of the public chat
  $.each(data.raw.result, function(index, json) {
    var parsed = json[2].plext.markup.reduce(markupParser, {
      chatguid: json[0],
      timestamp: json[1]
    });
    if (parsed.type && parsed.pguid && parsed.latE6) {
      logEvent(parsed);
    }
  });
}

function scheduleUpdate() {
  clearTimeout(scheduleUpdate.timeout);
  scheduleUpdate.timeout = setTimeout(update);
}

function setup() {
  $('<a title="Show Activity Tracker">ACT</a>')
    .appendTo('#toolbox')
    .click(trackerUI.dialog.bind(trackerUI, 'open'));
  addHook('publicChatDataAvailable', onPublicChat);

  $('head').append('<style>' +
    '#activity-tracker .team-ALIENS td { color: #03DC03; background-color: #0d3d06;}' +
    '#activity-tracker .team-RESISTANCE td { color: #0088FF; background-color: #071c3b;}' +
    '#activity-tracker .team-ALIENS:nth-child(2n) td { background-color: #073203; }' +
    '#activity-tracker .team-RESISTANCE:nth-child(2n) td { background-color: #031931; }' +
    '</style>'
  );
}

function update() {
  var maxt = 0, mint = Date.now();
  tbody.find('tr').filter(function() {
    return !dataCache[this.dataset.pguid];
  }).remove();
  $.map(dataCache, updatePlayer).sort(function(a, b) {
    return b.score - a.score;
  }).forEach(function(sum) {
    maxt = Math.max(maxt, sum.maxt);
    mint = Math.min(mint, sum.mint);
    tbody.append(sum.elem);
  });
  trackerUI.dialog('option', 'title', 'Activity Tracker - ' +
    new Date(mint).toLocaleString() + ' - ' + new Date(maxt).toLocaleString());
}

function updatePlayer(events, pguid) {
  var elem = getPlayerRow(pguid);
  var summary = events.reduce(Summary.parse, new Summary()).renderTo(elem);
  return summary;
}

function Summary() {
}

Summary.parse = function(sum, event) {
  sum.maxt = Math.max(sum.maxt || 0, event.timestamp);
  sum.mint = Math.min(sum.mint || Date.now(), event.timestamp);

  if (event.type === 'DESTROY' || event.type === 'DEPLOY') {
    sum.add(event.type + event.resLevel);
  } else {
    sum.add(event.type);
  }
  return sum;
};

Summary.prototype.add = function(type, number) {
  this[type] = this.get(type) + (number || 1);
  return this;
};

Summary.prototype.get = function(type) {
  return this[type] || 0;
};

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
  cells.eq(10).text(this.score);
  return this;
};


// PLUGIN END //////////////////////////////////////////////////////////

@@PLUGINEND@@
