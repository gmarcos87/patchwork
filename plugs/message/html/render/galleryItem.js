const nest = require('depnest')
var extend = require('xtend')
const { h, when, resolve } = require('mutant')
const ref = require('ssb-ref')


exports.gives = nest('message.html', {
  canRender: true,
  render: true
})

exports.needs = nest({
  'about.obs.color': 'first',
  'app.navigate': 'first',
  'blob.sync.url': 'first',
  'message.html.decorate': 'reduce',
  'message.html.layout': 'first',
  'message.html.markdown': 'first',
  'sbot.obs.connection': 'first'
})

exports.create = function (api) {
  return nest('message.html', {
    render: galleryItemRenderer,
    canRender: isRenderable
  })


  function galleryItemRenderer (msg, opts) {
    if (!isRenderable(msg)) return

    function onClick () {
      api.app.navigate(msg.key)
    }

    const content =  h('div', {
      style: {
        'background-image': 'url("data:image/svg+xml;charset=utf-8;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZlcnNpb249IjEuMSIgd2lkdGg9IjEwMHB4IiBoZWlnaHQ9IjIwcHgiPjxkZWZzPjxzdHlsZSB0eXBlPSJ0ZXh0L2NzcyI+PCFbQ0RBVEFbdGV4dCB7IGZvbnQ6IGNhcHRpb247IGZvbnQtc2l6ZTogMTJweDsgfQpdXT48L3N0eWxlPjwvZGVmcz48dGV4dCB4PScwJyB5PScxMic+RmV0Y2hpbmcgaW1hZ2UuLi48L3RleHQ+PC9zdmc+")',
        'background-repeat': 'no-repeat',
        'background-position':'center'
      }
    }, msg.value.content.mentions.map(mention =>
      h('div', {
        'ev-click': onClick,
        style: {
          'width':'100%',
          'height':'300px',
          'border': '2px solid #fff',
          'background-image': 'url('+api.blob.sync.url(mention.link)+')',
          'background-size': 'cover',
          'background-position': 'center'
        }
      }
      )
    ))

    return content

    //return element
    //return api.message.html.decorate(element, { msg })
  }


  function isRenderable (msg) {
      if (msg.value.content.type !== 'galleryItem') return
      return true
  }
}
