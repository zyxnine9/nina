Component({
  properties: {
    // [{ tagId, name }]
    tags: {
      type: Array,
      value: [],
    },
    // 主标签 tagId，渲染为强调态
    primaryId: {
      type: String,
      value: '',
    },
  },
  methods: {
    onTagTap(e) {
      const { tagId } = e.currentTarget.dataset;
      this.triggerEvent('tagtap', { tagId });
    },
  },
});
