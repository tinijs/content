import {defineTiniModule} from 'tinijs';

export default defineTiniModule({
  meta: {
    name: '@tinijs/content',
  },
  init: {
    copy: {
      assets: 'content',
    },
  },
  async setup(options, tini) {},
});
