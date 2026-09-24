Component({
  properties: { active: { type: String, value: 'today' } },
  methods: {
    switchPage(event) {
      const page = event.currentTarget.dataset.page
      if (page === this.data.active) return
      wx.redirectTo({ url: `/pages/${page}/index` })
    }
  }
})
