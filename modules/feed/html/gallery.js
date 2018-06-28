var nest = require('depnest')
var {Value, Proxy, Array: MutantArray, h, computed, when, onceTrue, throttle} = require('mutant')
var pull = require('pull-stream')
var Abortable = require('pull-abortable')
var Scroller = require('../../../lib/scroller')
var nextStepper = require('../../../lib/next-stepper')
var extend = require('xtend')
var paramap = require('pull-paramap')
var ref = require('ssb-ref')


var bumpMessages = {
  'vote': 'liked this message',
  'post': 'replied to this message',
  'about': 'added changes',
  'mention': 'mentioned you',
  'channel-mention': 'mentioned this channel',
  'attending': 'can attend'
}

// bump even for first message
var rootBumpTypes = ['mention', 'channel-mention']

exports.needs = nest({
  'about.obs.name': 'first',
  'app.sync.externalHandler': 'first',
  'message.html.canRender': 'first',
  'message.html.render': 'first',
  'message.sync.isBlocked': 'first',
  'message.sync.unbox': 'first',
  'message.sync.timestamp': 'first',
  'profile.html.person': 'first',
  'channel.html.link': 'first',
  'message.html.link': 'first',
  'message.sync.root': 'first',
  'feed.pull.rollup': 'first',
  'feed.pull.withReplies': 'first',
  'feed.pull.unique': 'first',
  'sbot.async.get': 'first',
  'keys.sync.id': 'first',
  'intl.sync.i18n': 'first',
  'intl.sync.i18n_n': 'first',
  'message.html.missing': 'first'
})

exports.gives = nest({
  'feed.html.gallery': true
})

exports.create = function (api) {
  const i18n = api.intl.sync.i18n
  const i18nPlural = api.intl.sync.i18n_n
  return nest('feed.html.gallery', function (getStream, {
    prepend,
    rootFilter = returnTrue,
    bumpFilter = returnTrue,
    resultFilter = returnTrue, // filter after replies have been resolved (just before append to scroll)
    compactFilter = returnFalse,
    prefiltered = false,
    displayFilter = returnTrue,
    updateStream, // override the stream used for realtime updates
    waitFor = true
  }) {
    var updates = Value(0)
    var yourId = api.keys.sync.id()
    var throttledUpdates = throttle(updates, 200)
    var updateLoader = h('a Notifier -loader', { href: '#', 'ev-click': refresh }, [
      'Show ', h('strong', [throttledUpdates]), ' ', plural(throttledUpdates, i18n('update'), i18n('updates'))
    ])

    var abortLastFeed = null
    var content = Value()
    var loading = Proxy(true)
    var unreadIds = new Set()
    var newSinceRefresh = new Set()
    var highlightItems = new Set()

    var container = h('Scroller', {
      style: { overflow: 'auto' },
      hooks: [(element) => {
        // don't activate until added to DOM
        refresh()

        // deactivate when removed from DOM
        return () => {
          if (abortLastFeed) {
            abortLastFeed()
            abortLastFeed = null
          }
        }
      }]
    }, [
      h('div.wrapper', [
        h('section.prepend', prepend),
        content,
        when(loading, h('Loading -large'))
      ])
    ])

    onceTrue(waitFor, () => {
      // display pending updates
      pull(
        updateStream || pull(
          getStream({old: false})
        ),
        pull.filter(rootFilter),
        pull.filter(bumpFilter),
        pull.drain((msg) => {
          if (api.app.sync.externalHandler(msg)) return

          // Only increment the 'new since' for items that we render on
          // the feed as otherwise the 'show <n> updates message' will be
          // shown on new messages that patchwork cannot render
          if (canRenderMessage(msg) && msg.value.author !== yourId && msg.value.content.mentions && (!msg.root || canRenderMessage(msg.root))) {
            newSinceRefresh.add(msg.key)
            unreadIds.add(msg.key)
          }

          if (updates() === 0 && msg.value.author === yourId && container.scrollTop < 500) {
            refresh()
          }

          updates.set(newSinceRefresh.size)
        })
      )
    })

    var result = MutantArray([
      when(updates, updateLoader),
      container
    ])

    result.pendingUpdates = throttledUpdates
    result.reload = refresh

    return result

    function canRenderMessage (msg) {
      return api.message.html.canRender(msg)
    }

    function refresh () {
      onceTrue(waitFor, () => {
        if (abortLastFeed) abortLastFeed()
        updates.set(0)
        content.set(h('section.content', {
          attributes: {

          }
        }))

        var abortable = Abortable()
        abortLastFeed = abortable.abort

        highlightItems = newSinceRefresh
        newSinceRefresh = new Set()

        var done = Value(false)
        var stream = pull(
          nextStepper(getStream, {reverse: true, limit: 100}),
        )
        var scroller = Scroller(container, content(), renderItem, {
          onDone: () => done.set(true),
          onItemVisible: (item) => {
            if (Array.isArray(item.msgIds)) {
              item.msgIds.forEach(id => {
                unreadIds.delete(id)
              })
            }
          }
        })

        // track loading state
        loading.set(computed([done, scroller.queue], (done, queue) => {
          return !done && queue < 5
        }))

        pull(
          stream,
          abortable,
          pull.filter(msg => msg && msg.value && msg.value.content),
          prefiltered ? pull(
            pull.filter(msg => !api.message.sync.isBlocked(msg)),
            pull.filter(rootFilter),
            api.feed.pull.unique()
          ) : pull(
            pull.filter(bumpFilter),
            api.feed.pull.rollup(rootFilter)
          ),
          pull.map(msg => {
            let mentions = getBlobs(msg)
            let result = mentions.map(mention => {
              let item = clone(msg);
              item.value.content.mentions = [clone(mention)];
              item.value.content.type = 'galleryItem';
              return item;
            })

            return result;
          }),
          pull.flatten(),
          pull.unique(msg => msg.value.content.mentions[0].link),
          pull.filter(resultFilter),
          scroller
        )
      })
    }

    function renderItem (item, opts) {
      var meta = null

      var renderedMessage = api.message.html.render(item, {
        compact: compactFilter(item),
        includeForks: false, // this is a root message, so forks are already displayed as replies
        priority: getPriority(item)
      })

      unreadIds.delete(item.key)

      if (!renderedMessage) return h('div')

      var result = h('FeedEvent -post', {
        attributes: {
          'data-root-id': item.key,
          'style': 'width: 48%; margin: 1%; float:left;'
        }
      }, [
        meta,
        renderedMessage
      ])
      result.msgIds = [item.key]

      return result;
    }

    function getPriority (msg) {
      if (highlightItems.has(msg.key)) {
        return 2
      } else if (unreadIds.has(msg.key)) {
        return 1
      } else {
        return 0
      }
    }
  })

}

function plural (value, single, many) {
  return computed(value, (value) => {
    if (value === 1) {
      return single
    } else {
      return many
    }
  })
}

function returnTrue () {
  return true
}

function returnFalse () {
  return false
}

function last (array) {
  if (Array.isArray(array)) {
    return array[array.length - 1]
  } else {
    return array
  }
}

function clone(obj) {
  var newObject = {};
  for(var i in obj) {
      if(obj[i] != null &&  typeof(obj[i])=="object")
          newObject[i] = clone(obj[i]);
      else
          newObject[i] = obj[i];
  }
  return newObject;
}

function getBlobs(msg) {

  try {
    if(msg.value && msg.value.content && typeof msg.value.content.mentions != 'undefined' && typeof msg.value.content.mentions.length !== 'undefined') {
      return msg.value.content.mentions.filter(mention => ref.isBlob(mention.link))
    }
    return [];
  } catch(e) {
    console.log('GALLERY FEED', e, msg, msg.value.content.mentions)
  }
}
