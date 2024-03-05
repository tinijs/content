import {defineTiniModule} from '@tinijs/cli';

import build from './module/build.js';

export default defineTiniModule({
  init: {
    copy: {
      assets: 'content',
    },
  },
  build,
});
