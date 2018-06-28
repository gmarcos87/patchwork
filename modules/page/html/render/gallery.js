var nest = require('depnest')
var extend = require('xtend')
var pull = require('pull-stream')
var ref = require('ssb-ref')
var { h, send, when, computed, map, onceTrue } = require('mutant')

exports.needs = nest({
  sbot: {
    obs: {
      connectedPeers: 'first',
      localPeers: 'first',
      connection: 'first'
    }
  },
  'sbot.pull.stream': 'first',
  'feed.pull.public': 'first',
  'feed.pull.withReplies': 'first',
  'feed.pull.type': 'first',
  'about.html.image': 'first',
  'about.obs.name': 'first',
  'invite.sheet': 'first',

  'message.html.compose': 'first',
  'message.async.publish': 'first',
  'message.sync.root': 'first',
  'progress.html.peer': 'first',

  'feed.html.followWarning': 'first',
  'feed.html.followerWarning': 'first',
  'feed.html.gallery': 'first',
  'profile.obs.recentlyUpdated': 'first',
  'profile.obs.contact': 'first',
  'contact.obs.following': 'first',
  'contact.obs.blocking': 'first',
  'channel.obs': {
    subscribed: 'first',
    recent: 'first'
  },
  'channel.sync.normalize': 'first',
  'keys.sync.id': 'first',
  'settings.obs.get': 'first',
  'intl.sync.i18n': 'first'
})

exports.gives = nest({
  'page.html.render': true
})

exports.create = function (api) {
  const i18n = api.intl.sync.i18n
  return nest('page.html.render', page)

  function page (path) {
    if (path !== '/gallery') return // "/" is a sigil for "page"

    var id = api.keys.sync.id()

    var lastMessage = null

    var getStream = (opts) => {
      if (!opts.lt) {
        // HACK: reset the isReplacementMessage check
        lastMessage = null
      }
      if (opts.lt != null && !opts.lt.marker) {
        // if an lt has been specified that is not a marker, assume stream is finished
        return pull.empty()
      } else {
        return api.feed.pull.type('post');
      }
    }

    var filters = api.settings.obs.get('filters')
    return api.feed.html.gallery(api.feed.pull.type('post'), {
      prefiltered: false, // we've already filtered out the roots we don't want to include
      rootFilter: function (msg) {
        if (getBlobs(msg).length === 0) return false;
        return true;
      },
      bumpFilter: function (msg) {
        // this needs to match the logic in sbot/roots so that we display the
        // correct bump explainations
        if (getBlobs(msg).length === 0) return false;
        return true;
      },
      compactFilter: function (msg, root) {
        return false
      }
    })
  }
}

function getBlobs(msg) {

  try {
    if(msg.value && msg.value.content && typeof msg.value.content.mentions != 'undefined' && typeof msg.value.content.mentions.length !== 'undefined') {
      return msg.value.content.mentions.filter(mention => ref.isBlobId(mention.link))
    }
    return [];
  } catch(e) {
    console.log('GALLERY',e, msg)
  }
}
