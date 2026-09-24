Component({
  properties: {
    visible: { type: Boolean, value: false },
    title: { type: String, value: '' },
    maxHeight: { type: String, value: '88vh' },
    showClose: { type: Boolean, value: true }
  },

  data: { rendered: false, phase: 'closed' },

  observers: {
    visible(visible) {
      this.motionToken = (this.motionToken || 0) + 1
      const motionToken = this.motionToken
      clearTimeout(this.closeTimer)
      if (visible) {
        this.setData({ rendered: true, phase: 'closed' })
        wx.nextTick(() => {
          if (this.motionToken === motionToken) this.setData({ phase: 'open' })
        })
      } else if (this.data.rendered) {
        this.setData({ rendered: false, phase: 'closed' })
      }
    }
  },

  lifetimes: {
    detached() { clearTimeout(this.closeTimer) }
  },

  methods: {
    requestClose() { this.triggerEvent('close') },
    stopTap() {}
  }
})
