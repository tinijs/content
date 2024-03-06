import {TiniCli, errorInvalidSubCommand} from '@tinijs/cli';

import buildSubCommand from './commands/build.js';

enum SubCommands {
  Build = 'build',
}

function rootHandler(subCommand: string) {
  switch (subCommand) {
    case SubCommands.Build:
      buildSubCommand();
      break;
    default:
      errorInvalidSubCommand(subCommand, SubCommands);
      break;
  }
}

export default function (tiniCli: TiniCli) {
  return tiniCli
    .command('content <subCommand>')
    .description('Tools for the @tinijs/content module.')
    .action(rootHandler);
}
