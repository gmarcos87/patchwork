var h = require('mutant/h')
var computed = require('mutant/computed')
var nest = require('depnest')
var extend = require('xtend')
var ref = require('ssb-ref')

exports.needs = nest({
  'profile.html.person': 'first',
  'message.obs.backlinks': 'first',
  'message.obs.name': 'first',
  'message.obs.author': 'first',
  'contact.obs.following': 'first',
  'keys.sync.id': 'first',
  'message.html': {
    decorate: 'reduce',
    layout: 'first',
    action: 'first',
    link: 'first',
    meta: 'map',
    action: 'map',
    timestamp: 'first',
    backlinks: 'first'
  },
  'blob.sync.url': 'first',
  'intl.sync.i18n': 'first',
  'about.html.image': 'first',
})

exports.gives = nest('message.html', {
  canRender: true,
  render: true
})

exports.create = function (api) {
  const i18n = api.intl.sync.i18n
  return nest('message.html', {
    canRender: isRenderable,
    render: function (msg, opts) {
      if (!isRenderable(msg)) return

      return h('div.Message',
        [
          messageHeader(msg.parent),
          h('section',{
            style: {'margin': '10px 0'}
          },
           h('a', {href: msg.parent.key},
            h('img', {src: api.blob.sync.url(msg.link), style: {'width':'100%'}})
           )
          )
        ]
      );
    }
  })

  function messageHeader (msg) {
    var yourId = api.keys.sync.id()

    return h('header', [
      h('div.main', [
        h('a.avatar', {href: `${msg.value.author}`}, [
          api.about.html.image(msg.value.author)
        ]),
        h('div.main', [
          h('div.name', [
            api.profile.html.person(msg.value.author),
            msg.value.author === yourId ? [' ', h('span.you', {}, i18n('(you)'))] : null
          ]),
          h('div.meta', [
            api.message.html.timestamp(msg)
          ])
        ])
      ]),
      h('div.meta', [
        api.message.html.meta(msg)
      ])
    ])
  }

  function isRenderable (msg) {
    if (typeof msg.type === 'undefined') return
    if (msg.type.indexOf('image') === -1) return
    return true
  }
}
