var nest = require('depnest')
var {Value, Proxy, Array: MutantArray, h, computed, when, onceTrue, throttle} = require('mutant')
var pull = require('pull-stream')
var Abortable = require('pull-abortable')
var Scroller = require('../../../lib/scroller')
var nextStepper = require('../../../lib/next-stepper')
var extend = require('xtend')
var paramap = require('pull-paramap')
var ref = require('ssb-ref');

var bumpMessages = {
  'vote': 'liked this message',
  'post': 'replied to this message',
  'about': 'added changes',
  'mention': 'mentioned you',
  'channel-mention': 'mentioned this channel'
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
  'gallery.html.rollup': true
})

var items = []

exports.create = function (api) {

  const i18n = api.intl.sync.i18n
  const i18nPlural = api.intl.sync.i18n_n

  return nest('gallery.html.rollup', function (getStream, {
    prepend,
    rootFilter = returnTrue,
    bumpFilter = returnFalse,
    compactFilter = returnTrue,
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
        content
      ])
    ])


    var result = MutantArray([
      when(updates, updateLoader),
      container
    ])

    result.pendingUpdates = throttledUpdates
    result.reload = refresh

    return result


    function refresh () {
      onceTrue(waitFor, () => {
        if (abortLastFeed) abortLastFeed()
        updates.set(0)
        content.set(h('section.content'))

        var abortable = Abortable()
        abortLastFeed = abortable.abort

        highlightItems = newSinceRefresh
        newSinceRefresh = new Set()

        var done = Value(false)
        var stream = nextStepper(getStream, {reverse: true, limit: 50})
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
          pull.filter(msg => haveBlobs(msg)),
          scroller
        )
      })
    }

    function renderItem (item, opts) {
      var blobs = getBlobs(item)
      renderedBlobs = blobs
      .filter(blob => {
        if(items.indexOf(blob.link) === -1) {
          items.push(blob.link)
          return true
        }
        return false
      })
      .map(blob => {
        var elementBlob = Object.assign({}, blob, {
            parent: item,
            value: {
                content: {}
            }
        })
        var result = h('FeedEvent -post', {
          attributes: {
            'data-root-id': item.key
          }}, [
            api.message.html.render(elementBlob,{})
          ])

        return result
      })

      return h('div',{},[renderedBlobs])
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

function many (ids, fn, intl) {
  ids = Array.from(ids)
  var featuredIds = ids.slice(0, 4)

  if (ids.length) {
    if (ids.length > 4) {
      return [
        fn(featuredIds[0]), ', ',
        fn(featuredIds[1]), ', ',
        fn(featuredIds[2]), intl(' and '),
        ids.length - 3, intl(' others')
      ]
    } else if (ids.length === 4) {
      return [
        fn(featuredIds[0]), ', ',
        fn(featuredIds[1]), ', ',
        fn(featuredIds[2]), intl(' and '),
        fn(featuredIds[3])
      ]
    } else if (ids.length === 3) {
      return [
        fn(featuredIds[0]), ', ',
        fn(featuredIds[1]), intl(' and '),
        fn(featuredIds[2])
      ]
    } else if (ids.length === 2) {
      return [
        fn(featuredIds[0]), intl(' and '),
        fn(featuredIds[1])
      ]
    } else {
      return fn(featuredIds[0])
    }
  }
}

function getAuthors (items) {
  return items.reduce((result, msg) => {
    result.add(msg.value.author)
    return result
  }, new Set())
}

function getLikeAuthors (items) {
  return items.reduce((result, msg) => {
    if (msg.value.content.type === 'vote') {
      if (msg.value.content && msg.value.content.vote && msg.value.content.vote.value === 1) {
        result.add(msg.value.author)
      } else {
        result.delete(msg.value.author)
      }
    }
    return result
  }, new Set())
}

function isReply (msg) {
  if (msg.value && msg.value.content) {
    var type = msg.value.content.type
    return type === 'post' || (type === 'about' && msg.value.content.attendee)
  }
}

function getType (msg) {
  return msg && msg.value && msg.value.content && msg.value.content.type
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

function haveBlobs (message) {
  try {
    if(message.value.content && message.value.content.mentions) {
        return (message.value.content.mentions
          .filter(mention => ref.isBlobId(mention.link))
          .length > 0)
    }
    return false
  }
  catch(e) {
    return false
  }
}

function getBlobs(message) {
    return message.value.content.mentions
    .filter(mention => ref.isBlobId(mention.link))
}