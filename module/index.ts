import {defineTiniModule} from '@tinijs/core';

import contentBuildCommand from '../cli/commands/content-build.js';

export type ContentModuleOptions = Parameters<typeof contentBuildCommand>[0];

export default defineTiniModule<ContentModuleOptions>({
  meta: {
    name: '@tinijs/content',
  },
  init() {
    return {
      copy: {
        assets: 'content',
      },
    };
  },
  async setup(options, tini) {
    tini.hook(
      'build:after',
      () => contentBuildCommand(options) as Promise<void>
    );
  },
});
