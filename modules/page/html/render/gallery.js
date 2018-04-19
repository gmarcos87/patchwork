var nest = require('depnest')
var { h } = require('mutant')

exports.needs = nest({
  'feed.pull.public': 'first',
  'gallery.html.rollup': 'first',
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

    var prepend = [
      h('PageHeading', [
        h('h1', [
          i18n('All Images from Your '),
          h('strong', i18n('Extended Network'))
        ])
      ])
    ]

    var feedView = api.gallery.html.rollup(api.feed.pull.public, {
      bumpFilter: (msg) => haveBlobs(msg),
      prepend
    })

    var result = h('div.SplitView', [
      h('div.main', feedView)
    ])

    result.pendingUpdates = feedView.pendingUpdates
    result.reload = feedView.reload

    return result
  }
}

function haveBlobs (message) {
  try {
    if(message.value.content && message.value.content.mentions) {
        return (message.value.content.mentions
          .filter(mention => ref.isBlobId(mention.link))
          .filter(mention => mention.emoji !== true )
          .length > 0)
    }
    return false
  }
  catch(e) {
    return false
  }
}
