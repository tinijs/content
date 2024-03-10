import {resolveCommand} from '@tinijs/cli';

export default function () {
  return {
    content: import('./commands/content.js').then(resolveCommand),
  };
}
