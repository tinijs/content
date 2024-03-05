import {TiniCLI, errorInvalidSubCommand} from '@tinijs/cli';

import buildSubCommand from './commands/build.js';

enum SubCommands {
  Build = 'build',
}

function rootCommand(subCommand: string) {
  switch (subCommand) {
    case SubCommands.Build:
      buildSubCommand();
      break;
    default:
      errorInvalidSubCommand(subCommand, SubCommands);
      break;
  }
}

export default function (tiniCLI: TiniCLI) {
  return tiniCLI
    .command('content <subCommand>')
    .description('Tools for the @tinijs/content module.')
    .action(rootCommand);
}
