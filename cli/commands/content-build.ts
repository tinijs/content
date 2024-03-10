import {defineTiniCommand} from '@tinijs/cli';

export const contentBuildCommand = defineTiniCommand(
  {
    meta: {
      name: 'build',
      description: 'Build the content.',
    },
  },
  async args => {
    console.log('@tinijs/content - Build command ...', args);
  }
);

export default contentBuildCommand;
