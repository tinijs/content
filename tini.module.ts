import {defineTiniModule} from '@tinijs/cli';

import build from './src/scripts/build';

export default defineTiniModule({
  init: {
    copy: {
      assets: 'content',
    },
  },
  build,
});
